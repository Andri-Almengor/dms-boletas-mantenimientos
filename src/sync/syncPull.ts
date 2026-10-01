import { actionRequest, ActionApiError } from '@/api/actionClient';
import { createSyncConflict } from '@/db/conflictRepository';
import { parseJsonObject } from '@/db/json';
import { automaticSyncWindowClosedError } from '@/sync/syncPolicy';
import {
  hasUnresolvedEntityOperations,
  listUnresolvedEntityOperations,
} from '@/db/outboxRepository';
import {
  tombstoneRemoteMaintenance,
  upsertRemoteMaintenance,
} from '@/db/maintenanceRepository';
import {
  removeResourceItemTx,
  replaceResourceSnapshot,
  upsertResourceItemTx,
} from '@/db/resourceRepository';
import {
  getSyncState,
  saveSyncCursor,
} from '@/db/syncStateRepository';
import {
  CLIENT_SYNC_SCHEMA_VERSION,
  DeltaResourceConfig,
  SNAPSHOT_PAGE_SIZE,
  STATIC_RESOURCES,
} from '@/sync/resourceRegistry';
import type { SQLiteDatabase } from 'expo-sqlite';

type RecordLike = Record<string, unknown>;

export type SyncDelta = {
  enabled?: boolean;
  generation?: string;
  schemaVersion?: number;
  cacheScope?: string;
  resource?: string;
  fromCursor?: number;
  cursor?: number;
  snapshotCursor?: number;
  hasMore?: boolean;
  fullSnapshotRequired?: boolean;
  securityInvalidated?: boolean;
  reason?: string;
  upserts?: RecordLike[];
  removed?: string[];
  invalidated?: string[];
  counts?: Record<string, number> | null;
};

function normalizeItems(data: unknown): RecordLike[] {
  if (Array.isArray(data)) return data.filter(Boolean) as RecordLike[];
  if (!data || typeof data !== 'object') return [];
  const value = data as RecordLike;
  for (const key of ['items', 'rows', 'data']) {
    if (Array.isArray(value[key])) return value[key] as RecordLike[];
  }
  return [];
}

function totalFrom(data: unknown, fallback: number) {
  if (!data || typeof data !== 'object') return fallback;
  const total = Number((data as RecordLike).total);
  return Number.isFinite(total) ? total : fallback;
}

function assertNetworkUnitAllowed(shouldContinue?: () => boolean) {
  if (shouldContinue && !shouldContinue()) {
    throw automaticSyncWindowClosedError();
  }
}

async function fetchAllPages(
  route: string,
  sessionToken: string,
  signal?: AbortSignal,
  shouldContinue?: () => boolean,
) {
  const records: RecordLike[] = [];

  for (let page = 1; page <= 100; page += 1) {
    assertNetworkUnitAllowed(shouldContinue);
    const data = await actionRequest<unknown>(
      route,
      { page, pageSize: SNAPSHOT_PAGE_SIZE, activo: true },
      sessionToken,
      { signal },
    );
    const items = normalizeItems(data);
    records.push(...items);
    const total = totalFrom(data, records.length);
    if (items.length < SNAPSHOT_PAGE_SIZE || records.length >= total) break;
  }

  return records;
}

function maintenanceId(record: RecordLike) {
  return String(record.MantenimientoID || record.maintenanceId || record.id || '').trim();
}

async function registerRemoteDeletedMaintenanceConflict(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
  pending: Awaited<ReturnType<typeof listUnresolvedEntityOperations>>,
) {
  const latest = pending[pending.length - 1];
  const localPayload = latest
    ? parseJsonObject<RecordLike>(latest.payload_json)
    : {};
  const basePayload = (
    localPayload.__syncBase
    && typeof localPayload.__syncBase === 'object'
      ? localPayload.__syncBase as RecordLike
      : {}
  );

  await createSyncConflict(db, {
    scopeKey,
    resource: 'maintenance',
    entityType: 'maintenance',
    entityId: maintenanceId,
    aggregateId: maintenanceId,
    localPayload,
    remotePayload: { deleted: true, maintenanceId },
    basePayload,
    reason: JSON.stringify(['REMOTE_DELETED']),
  });

  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'CONFLICT', last_error_code = 'REMOTE_DELETED',
         last_error_message = 'El mantenimiento fue eliminado remotamente.',
         updated_at = ?
     WHERE scope_key = ? AND entity_type = 'maintenance'
       AND entity_id = ?
       AND status IN ('PENDING','FAILED','BLOCKED')`,
    new Date().toISOString(),
    scopeKey,
    maintenanceId,
  );
}

async function applyMaintenanceSnapshot(
  db: SQLiteDatabase,
  scopeKey: string,
  records: RecordLike[],
) {
  const serverIds = new Set(records.map(maintenanceId).filter(Boolean));

  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const record of records) {
      const id = maintenanceId(record);
      if (!id) continue;
      const dirty = await hasUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenance',
        id,
      );
      if (!dirty) await upsertRemoteMaintenance(transaction, scopeKey, record);
    }

    const localRows = await transaction.getAllAsync<{ maintenance_id: string; sync_status: string }>(
      `SELECT maintenance_id, sync_status
       FROM local_maintenances
       WHERE scope_key = ? AND tombstone = 0`,
      scopeKey,
    );

    for (const row of localRows) {
      if (serverIds.has(row.maintenance_id)) continue;
      const pending = await listUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenance',
        row.maintenance_id,
      );
      const pendingCreate = pending.some((item) => item.operation_kind === 'CREATE');
      if (!pending.length && row.sync_status === 'SYNCED') {
        await tombstoneRemoteMaintenance(transaction, scopeKey, row.maintenance_id);
      } else if (pending.length && !pendingCreate) {
        await registerRemoteDeletedMaintenanceConflict(
          transaction,
          scopeKey,
          row.maintenance_id,
          pending,
        );
      }
    }
  });
}

async function applyMaintenanceDelta(
  db: SQLiteDatabase,
  scopeKey: string,
  delta: SyncDelta,
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const record of delta.upserts || []) {
      const id = maintenanceId(record);
      if (!id) continue;
      const dirty = await hasUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenance',
        id,
      );
      if (!dirty) await upsertRemoteMaintenance(transaction, scopeKey, record);
    }

    for (const id of delta.removed || []) {
      const pending = await listUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenance',
        String(id),
      );
      const pendingCreate = pending.some((item) => item.operation_kind === 'CREATE');
      if (!pending.length) {
        await tombstoneRemoteMaintenance(transaction, scopeKey, String(id));
      } else if (!pendingCreate) {
        await registerRemoteDeletedMaintenanceConflict(
          transaction,
          scopeKey,
          String(id),
          pending,
        );
      }
    }
  });
}

async function applyGenericDelta(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  delta: SyncDelta,
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    for (const record of delta.upserts || []) {
      await upsertResourceItemTx(transaction, scopeKey, resource, record);
    }
    for (const id of delta.removed || []) {
      await removeResourceItemTx(transaction, scopeKey, resource, String(id));
    }
  });
}

async function saveDescriptor(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  delta: SyncDelta,
  cursor?: number,
) {
  await saveSyncCursor(db, {
    scopeKey,
    resource,
    cursor: Number(cursor ?? delta.snapshotCursor ?? delta.cursor ?? 1),
    generation: String(delta.generation || ''),
    schemaVersion: Number(delta.schemaVersion || CLIENT_SYNC_SCHEMA_VERSION),
    cacheScope: String(delta.cacheScope || ''),
    fullSnapshotRequired: false,
  });
}

async function probeResource(
  config: DeltaResourceConfig,
  sessionToken: string,
  signal?: AbortSignal,
  shouldContinue?: () => boolean,
) {
  assertNetworkUnitAllowed(shouldContinue);
  return actionRequest<SyncDelta>(
    'sync.delta',
    {
      resource: config.resource,
      cursor: 1,
      generation: '',
      schemaVersion: CLIENT_SYNC_SCHEMA_VERSION,
    },
    sessionToken,
    { signal },
  );
}

async function replaceSnapshot(
  db: SQLiteDatabase,
  scopeKey: string,
  config: DeltaResourceConfig,
  descriptor: SyncDelta,
  sessionToken: string,
  signal?: AbortSignal,
  shouldContinue?: () => boolean,
) {
  const records = await fetchAllPages(
    config.route,
    sessionToken,
    signal,
    shouldContinue,
  );
  if (config.resource === 'maintenance') {
    await applyMaintenanceSnapshot(db, scopeKey, records);
  } else {
    await replaceResourceSnapshot(
      db,
      scopeKey,
      config.localResource || config.resource,
      records,
    );
  }
  await saveDescriptor(
    db,
    scopeKey,
    config.resource,
    descriptor,
    Number(descriptor.snapshotCursor ?? descriptor.cursor ?? 1),
  );
  return records.length;
}

function validateDelta(delta: SyncDelta) {
  if (delta.securityInvalidated) {
    const error = new Error('La seguridad de la sesión cambió durante la sincronización.');
    (error as Error & { code?: string }).code = 'SYNC_SECURITY_CHANGED';
    throw error;
  }
  if (delta.enabled === false || delta.reason === 'sync_unsafe') {
    const error = new Error('El servidor solicitó una reconciliación completa.');
    (error as Error & { code?: string }).code = 'SYNC_DISABLED';
    throw error;
  }
}

export async function synchronizeDeltaResource(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    config: DeltaResourceConfig;
    sessionToken: string;
    signal?: AbortSignal;
    shouldContinue?: () => boolean;
  },
) {
  const {
    scopeKey,
    config,
    sessionToken,
    signal,
    shouldContinue,
  } = input;
  let state = await getSyncState(db, scopeKey, config.resource);

  if (!state?.generation || !state.cache_scope || state.full_snapshot_required) {
    const probe = await probeResource(
      config,
      sessionToken,
      signal,
      shouldContinue,
    );
    validateDelta(probe);
    await replaceSnapshot(
      db,
      scopeKey,
      config,
      probe,
      sessionToken,
      signal,
      shouldContinue,
    );
    state = await getSyncState(db, scopeKey, config.resource);
  }

  if (!state) return { resource: config.resource, changed: 0 };

  let changed = 0;
  for (let page = 0; page < 20; page += 1) {
    assertNetworkUnitAllowed(shouldContinue);
    const delta = await actionRequest<SyncDelta>(
      'sync.delta',
      {
        resource: config.resource,
        cursor: Number(state.cursor || 1),
        generation: state.generation,
        cacheScope: state.cache_scope,
        schemaVersion: state.schema_version || CLIENT_SYNC_SCHEMA_VERSION,
      },
      sessionToken,
      { signal },
    );

    validateDelta(delta);

    if (delta.fullSnapshotRequired) {
      await replaceSnapshot(
        db,
        scopeKey,
        config,
        delta,
        sessionToken,
        signal,
        shouldContinue,
      );
      state = await getSyncState(db, scopeKey, config.resource);
      if (!state) break;
      continue;
    }

    if (String(delta.generation || '') !== String(state.generation || '')) {
      const error = new Error('La generación de sincronización cambió durante el ciclo.');
      (error as Error & { code?: string }).code = 'SYNC_GENERATION_CHANGED';
      throw error;
    }

    if (config.resource === 'maintenance') {
      await applyMaintenanceDelta(db, scopeKey, delta);
    } else {
      await applyGenericDelta(
        db,
        scopeKey,
        config.localResource || config.resource,
        delta,
      );
    }

    changed += (delta.upserts?.length || 0) + (delta.removed?.length || 0);
    await saveDescriptor(db, scopeKey, config.resource, delta, Number(delta.cursor || state.cursor));
    state = await getSyncState(db, scopeKey, config.resource);
    if (!delta.hasMore || !state) break;
  }

  return { resource: config.resource, changed };
}

export async function refreshStaticResources(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    sessionToken: string;
    signal?: AbortSignal;
    shouldContinue?: () => boolean;
  },
) {
  const results: { resource: string; count: number; skipped?: boolean }[] = [];

  for (const config of STATIC_RESOURCES) {
    try {
      assertNetworkUnitAllowed(input.shouldContinue);
      const data = await actionRequest<unknown>(
        config.route,
        { page: 1, pageSize: SNAPSHOT_PAGE_SIZE, activo: true },
        input.sessionToken,
        { signal: input.signal },
      );
      const records = normalizeItems(data);
      await replaceResourceSnapshot(db, input.scopeKey, config.resource, records);
      results.push({ resource: config.resource, count: records.length });
    } catch (error) {
      if (config.optional && error instanceof ActionApiError && error.status === 403) {
        results.push({ resource: config.resource, count: 0, skipped: true });
        continue;
      }
      throw error;
    }
  }

  try {
    assertNetworkUnitAllowed(input.shouldContinue);
    const config = await actionRequest<RecordLike>(
      'maintenance.config',
      {},
      input.sessionToken,
      { signal: input.signal },
    );
    await replaceResourceSnapshot(db, input.scopeKey, 'maintenanceConfig', [
      { id: 'maintenance-config', ...config },
    ]);
  } catch (error) {
    if (!(error instanceof ActionApiError) || error.status !== 403) throw error;
  }

  return results;
}
