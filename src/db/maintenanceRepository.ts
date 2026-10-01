import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeJsonPayload, parseJsonObject, stringifyJson } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
} from '@/db/outboxRepository';
import {
  maintenanceSyncBase,
  withSyncBase,
} from '@/sync/syncBase';
import {
  MaintenanceListFilters,
  MaintenanceStatus,
} from '@/features/maintenance/maintenanceListDomain';
import { createLocalId } from '@/utils/localId';

export type MaintenanceRecord = Record<string, unknown>;

function pick(record: MaintenanceRecord, keys: string[], fallback: unknown = '') {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

function jsonArrayText(value: unknown) {
  if (Array.isArray(value)) return JSON.stringify(value.map(String).filter(Boolean));
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return JSON.stringify(parsed.map(String).filter(Boolean));
    } catch {
      return JSON.stringify(value.split(/[;,]/).map((item) => item.trim()).filter(Boolean));
    }
  }
  return '[]';
}

function maintenanceId(record: MaintenanceRecord) {
  return String(pick(record, ['MantenimientoID', 'maintenanceId', 'id'], '')).trim();
}

function normalizeStatus(value: unknown) {
  const text = String(value || 'PENDIENTE').trim().toUpperCase();
  return text === 'FINALIZADA' ? 'FINALIZADO' : text;
}

function normalizeType(value: unknown) {
  return String(value || 'MANTENIMIENTO').trim().toUpperCase() === 'PROYECTO'
    ? 'PROYECTO'
    : 'MANTENIMIENTO';
}

async function upsertMaintenanceRow(
  db: SQLiteDatabase,
  scopeKey: string,
  record: MaintenanceRecord,
  syncStatus: string,
) {
  const id = maintenanceId(record);
  if (!id) throw new Error('El mantenimiento local requiere MantenimientoID.');

  const now = new Date().toISOString();
  const serverUpdatedAt = String(
    pick(record, ['FechaActualizacion', 'updatedAt', 'FechaCreacion'], ''),
  );

  await db.runAsync(
    `INSERT INTO local_maintenances (
       scope_key, maintenance_id, maintenance_type, status, client_id,
       client_name, location_id, location_name, title, maintenance_date,
       finalization_date, responsible_ids_json, payload_json, sync_status,
       server_updated_at, local_updated_at, last_synced_at, tombstone
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(scope_key, maintenance_id) DO UPDATE SET
       maintenance_type = excluded.maintenance_type,
       status = excluded.status,
       client_id = excluded.client_id,
       client_name = excluded.client_name,
       location_id = excluded.location_id,
       location_name = excluded.location_name,
       title = excluded.title,
       maintenance_date = excluded.maintenance_date,
       finalization_date = excluded.finalization_date,
       responsible_ids_json = excluded.responsible_ids_json,
       payload_json = excluded.payload_json,
       sync_status = excluded.sync_status,
       server_updated_at = CASE
         WHEN excluded.server_updated_at <> '' THEN excluded.server_updated_at
         ELSE local_maintenances.server_updated_at
       END,
       local_updated_at = excluded.local_updated_at,
       last_synced_at = CASE
         WHEN excluded.sync_status = 'SYNCED' THEN excluded.last_synced_at
         ELSE local_maintenances.last_synced_at
       END,
       tombstone = 0`,
    scopeKey,
    id,
    normalizeType(pick(record, ['TipoMantenimiento', 'tipoMantenimiento', 'maintenanceType'])),
    normalizeStatus(pick(record, ['Estado', 'estado'])),
    String(pick(record, ['ClienteID', 'ClienteRef', 'clienteId'])),
    String(pick(record, ['Cliente', 'cliente'])),
    String(pick(record, ['UbicacionID', 'ubicacionId'])),
    String(pick(record, ['Ubicacion', 'ubicacion'])),
    String(pick(record, ['TituloMantenimiento', 'titulo'])),
    String(pick(record, ['Fecha', 'fecha'])),
    String(pick(record, ['FechaFinalizacion', 'fechaFinalizacion'])),
    jsonArrayText(pick(record, ['ResponsableIDs', 'responsables', 'ResponsableIDsJSON'], [])),
    stringifyJson(record),
    syncStatus,
    serverUpdatedAt,
    now,
    syncStatus === 'SYNCED' ? now : '',
  );

  return id;
}

export async function upsertRemoteMaintenance(
  db: SQLiteDatabase,
  scopeKey: string,
  record: MaintenanceRecord,
) {
  await upsertMaintenanceRow(db, scopeKey, record, 'SYNCED');
}

export async function tombstoneRemoteMaintenance(
  db: SQLiteDatabase,
  scopeKey: string,
  id: string,
) {
  await db.runAsync(
    `UPDATE local_maintenances
     SET tombstone = 1, sync_status = 'SYNCED', local_updated_at = ?
     WHERE scope_key = ? AND maintenance_id = ?`,
    new Date().toISOString(),
    scopeKey,
    id,
  );
}

export async function saveLocalMaintenance(
  db: SQLiteDatabase,
  scopeKey: string,
  patch: MaintenanceRecord,
) {
  let savedId = maintenanceId(patch);
  let operationId = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = savedId
      ? await transaction.getFirstAsync<{ payload_json: string; sync_status: string }>(
        `SELECT payload_json, sync_status FROM local_maintenances
         WHERE scope_key = ? AND maintenance_id = ?`,
        scopeKey,
        savedId,
      )
      : null;

    if (!savedId) savedId = createLocalId('mantenimiento');

    const existingPayload = existing
      ? parseJsonObject<MaintenanceRecord>(existing.payload_json)
      : null;
    let merged = existing
      ? mergeJsonPayload(existing.payload_json, patch)
      : { ...patch };

    merged.MantenimientoID = savedId;
    merged.maintenanceId = savedId;

    if (existingPayload && !merged.__syncBase) {
      merged = withSyncBase(merged, maintenanceSyncBase(existingPayload));
    }

    const pendingCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenance',
      savedId,
    );
    const localOnly = !existing || existing.sync_status === 'LOCAL_ONLY' || Boolean(pendingCreate);
    const route = localOnly ? 'maintenance.create' : 'maintenance.update';

    await upsertMaintenanceRow(
      transaction,
      scopeKey,
      merged,
      localOnly ? 'LOCAL_ONLY' : 'PENDING',
    );

    const queued = await enqueueOutboxOperationTx(transaction, {
      scopeKey,
      operationKind: localOnly ? 'CREATE' : 'UPDATE',
      route,
      entityType: 'maintenance',
      entityId: savedId,
      aggregateId: savedId,
      payload: merged,
      priority: 50,
    });
    operationId = queued.operationId;
  });

  return { maintenanceId: savedId, operationId };
}

export async function getLocalMaintenance(
  db: SQLiteDatabase,
  scopeKey: string,
  id: string,
) {
  const row = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json FROM local_maintenances
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
    scopeKey,
    id,
  );
  return row
    ? parseJsonObject<MaintenanceRecord>(row.payload_json)
    : null;
}

export async function listLocalMaintenanceClients(
  db: SQLiteDatabase,
  scopeKey: string,
) {
  const rows = await db.getAllAsync<{ client_name: string }>(
    `SELECT DISTINCT client_name
     FROM local_maintenances
     WHERE scope_key = ? AND tombstone = 0 AND TRIM(client_name) <> ''
     ORDER BY client_name COLLATE NOCASE ASC`,
    scopeKey,
  );
  return rows.map((row) => row.client_name).filter(Boolean);
}

export async function listLocalMaintenancesPage(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    status: MaintenanceStatus;
    search?: string;
    filters?: MaintenanceListFilters;
    page?: number;
    pageSize?: number;
  },
) {
  const page = Math.max(1, Number(input.page || 1));
  const pageSize = Math.min(100, Math.max(1, Number(input.pageSize || 40)));
  const offset = (page - 1) * pageSize;
  const search = String(input.search || '').trim().toLowerCase();
  const filters = input.filters || { client: '', dateFrom: '', dateTo: '' };
  const params: (string | number)[] = [input.scopeKey, input.status];
  const where = [
    'm.scope_key = ?',
    'm.tombstone = 0',
    `CASE WHEN UPPER(m.status) IN ('FINALIZADO','FINALIZADA') THEN 'FINALIZADO' ELSE UPPER(m.status) END = ?`,
  ];

  if (filters.client) {
    where.push('m.client_name = ?');
    params.push(filters.client);
  }
  if (filters.dateFrom) {
    where.push('SUBSTR(m.maintenance_date, 1, 10) >= ?');
    params.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    where.push('SUBSTR(m.maintenance_date, 1, 10) <= ?');
    params.push(filters.dateTo);
  }
  if (search) {
    where.push(`(
      LOWER(m.title) LIKE ?
      OR LOWER(m.client_name) LIKE ?
      OR LOWER(m.location_name) LIKE ?
      OR LOWER(m.payload_json) LIKE ?
    )`);
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const rows = await db.getAllAsync<{
    payload_json: string;
    sync_status: string;
    detail_complete: number;
    detail_downloaded_at: string;
    local_device_count: number;
    filtered_total: number;
  }>(
    `WITH device_counts AS (
       SELECT scope_key, maintenance_id, COUNT(*) AS local_device_count
       FROM local_maintenance_devices
       WHERE scope_key = ? AND tombstone = 0
       GROUP BY scope_key, maintenance_id
     ),
     filtered AS (
       SELECT
         m.payload_json,
         m.sync_status,
         COALESCE(ds.complete, 0) AS detail_complete,
         COALESCE(ds.downloaded_at, '') AS detail_downloaded_at,
         COALESCE(dc.local_device_count, 0) AS local_device_count
       FROM local_maintenances m
       LEFT JOIN local_maintenance_detail_state ds
         ON ds.scope_key = m.scope_key AND ds.maintenance_id = m.maintenance_id
       LEFT JOIN device_counts dc
         ON dc.scope_key = m.scope_key AND dc.maintenance_id = m.maintenance_id
       WHERE ${where.join(' AND ')}
     )
     SELECT *, COUNT(*) OVER() AS filtered_total
     FROM filtered
     ORDER BY
       SUBSTR(COALESCE(JSON_EXTRACT(payload_json, '$.Fecha'), ''), 1, 10) DESC,
       COALESCE(JSON_EXTRACT(payload_json, '$.FechaCreacion'), '') DESC
     LIMIT ? OFFSET ?`,
    input.scopeKey,
    ...params,
    pageSize,
    offset,
  );

  const items = rows.map((row) => {
    const record = parseJsonObject<MaintenanceRecord>(row.payload_json);
    return {
      ...record,
      DispositivosRegistrados: row.detail_complete
        ? row.local_device_count
        : Number(record.DispositivosRegistrados || record.CantidadDispositivos || 0),
      __local: {
        syncStatus: row.sync_status,
        detailComplete: Boolean(row.detail_complete),
        detailDownloadedAt: row.detail_downloaded_at,
      },
    };
  });

  const total = rows.length ? Number(rows[0].filtered_total || 0) : 0;
  return {
    items,
    total,
    page,
    pageSize,
    hasMore: offset + items.length < total,
  };
}

export async function listLocalMaintenances(
  db: SQLiteDatabase,
  scopeKey: string,
  status = '',
) {
  const normalizedStatus = normalizeStatus(status || 'PENDIENTE') as MaintenanceStatus;
  const first = await listLocalMaintenancesPage(db, {
    scopeKey,
    status: normalizedStatus,
    page: 1,
    pageSize: 100,
  });
  return first.items;
}
