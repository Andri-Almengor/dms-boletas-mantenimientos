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

export type MaintenanceEquipmentLocation = {
  id: string;
  name: string;
  locationId: string;
  locationName: string;
};

function parseArray(value: unknown) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeMaintenanceLocation(item: unknown): MaintenanceEquipmentLocation | null {
  if (!item) return null;
  if (typeof item === 'string') {
    const id = item.trim();
    return id ? { id, name: id, locationId: '', locationName: '' } : null;
  }
  if (typeof item !== 'object' || Array.isArray(item)) return null;
  const row = item as MaintenanceRecord;
  const id = String(
    row.id
      || row.value
      || row.UbicacionEquipoID
      || row.ubicacionEquipoId
      || '',
  ).trim();
  if (!id || id.startsWith('legacy:')) return null;
  return {
    id,
    name: String(
      row.name
        || row.nombre
        || row.Nombre
        || row.UbicacionEquipoNombre
        || id,
    ).trim(),
    locationId: String(
      row.locationId
        || row.UbicacionID
        || row.ubicacionId
        || '',
    ).trim(),
    locationName: String(
      row.locationName
        || row.UbicacionNombre
        || row.ubicacionNombre
        || '',
    ).trim(),
  };
}

export function maintenanceEquipmentLocationsFromRecord(
  record: MaintenanceRecord | null | undefined,
) {
  const raw = record?.UbicacionesEquipoJSON
    ?? record?.ubicacionesEquipoJSON
    ?? [];
  const seen = new Set<string>();
  return parseArray(raw)
    .map(normalizeMaintenanceLocation)
    .filter((item): item is MaintenanceEquipmentLocation => {
      if (!item?.id || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
}

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
      ? await transaction.getFirstAsync<{
          payload_json: string;
          sync_status: string;
          maintenance_type: string;
        }>(
          `SELECT payload_json, sync_status, maintenance_type
           FROM local_maintenances
           WHERE scope_key = ? AND maintenance_id = ?`,
          scopeKey,
          savedId,
        )
      : null;

    if (!savedId) savedId = createLocalId('mantenimiento');

    const existingPayload = existing
      ? parseJsonObject<MaintenanceRecord>(existing.payload_json)
      : null;
    const requestedType = normalizeType(
      pick(patch, ['TipoMantenimiento', 'tipoMantenimiento', 'maintenanceType']),
    );
    if (existing && normalizeType(existing.maintenance_type) !== requestedType) {
      const devices = await transaction.getFirstAsync<{ total: number }>(
        `SELECT COUNT(*) AS total
         FROM local_maintenance_devices
         WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
        scopeKey,
        savedId,
      );
      const summaryCount = Number(
        existingPayload?.DispositivosRegistrados
          || existingPayload?.CantidadDispositivos
          || 0,
      );
      if (Math.max(Number(devices?.total || 0), summaryCount) > 0) {
        throw new Error(
          'No se puede cambiar entre Mantenimiento y Proyecto después de registrar dispositivos. Cree otro registro o elimine primero los dispositivos.',
        );
      }
    }
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
    const localOnly = !existing
      || existing.sync_status === 'LOCAL_ONLY'
      || Boolean(pendingCreate);
    const route = localOnly ? 'maintenance.create' : 'maintenance.update';

    await upsertMaintenanceRow(
      transaction,
      scopeKey,
      merged,
      localOnly ? 'LOCAL_ONLY' : 'PENDING',
    );

    if (!existing) {
      await transaction.runAsync(
        `INSERT INTO local_maintenance_detail_state (
           scope_key, maintenance_id, complete, downloaded_at,
           server_updated_at, device_count, evidence_count
         ) VALUES (?, ?, 1, ?, '', 0, 0)
         ON CONFLICT(scope_key, maintenance_id) DO UPDATE SET
           complete = 1, downloaded_at = excluded.downloaded_at`,
        scopeKey,
        savedId,
        new Date().toISOString(),
      );
    }

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

export async function saveLocalMaintenanceLocations(
  db: SQLiteDatabase,
  scopeKey: string,
  id: string,
  locations: MaintenanceEquipmentLocation[],
) {
  const maintenanceIdValue = String(id || '').trim();
  if (!maintenanceIdValue) {
    throw new Error('No se indicó el mantenimiento.');
  }

  const normalized = locations
    .map(normalizeMaintenanceLocation)
    .filter((item): item is MaintenanceEquipmentLocation => Boolean(item));

  let operationId = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getFirstAsync<{
      payload_json: string;
    }>(
      `SELECT payload_json
       FROM local_maintenances
       WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
      scopeKey,
      maintenanceIdValue,
    );
    if (!existing) {
      throw new Error('El mantenimiento no está disponible en este dispositivo.');
    }

    const detailState = await transaction.getFirstAsync<{ complete: number }>(
      `SELECT complete
       FROM local_maintenance_detail_state
       WHERE scope_key = ? AND maintenance_id = ?`,
      scopeKey,
      maintenanceIdValue,
    );
    if (!detailState?.complete) {
      throw new Error(
        'Descargue primero el contenido del mantenimiento antes de cambiar sus ubicaciones.',
      );
    }

    const merged = mergeJsonPayload(existing.payload_json, {
      MantenimientoID: maintenanceIdValue,
      maintenanceId: maintenanceIdValue,
      UbicacionesEquipoJSON: JSON.stringify(normalized),
    });

    await upsertMaintenanceRow(
      transaction,
      scopeKey,
      merged,
      'PENDING',
    );

    const maintenanceCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenance',
      maintenanceIdValue,
    );

    const queued = await enqueueOutboxOperationTx(transaction, {
      scopeKey,
      operationKind: 'UPDATE',
      route: 'maintenance.update.locations',
      entityType: 'maintenance',
      entityId: maintenanceIdValue,
      aggregateId: maintenanceIdValue,
      payload: {
        maintenanceId: maintenanceIdValue,
        MantenimientoID: maintenanceIdValue,
        UbicacionesEquipoJSON: normalized,
        ubicacionesEquipoIds: normalized.map((item) => item.id),
      },
      priority: 50,
      dedupeKey: `maintenance:update-locations:${maintenanceIdValue}`,
      dependsOnOperationId: maintenanceCreate?.operation_id || '',
    });
    operationId = queued.operationId;
  });

  return { maintenanceId: maintenanceIdValue, operationId };
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
