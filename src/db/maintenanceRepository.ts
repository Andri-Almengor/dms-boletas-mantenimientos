import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeJsonPayload, parseJsonObject, stringifyJson } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
} from '@/db/outboxRepository';
import { createLocalId } from '@/utils/localId';

export type MaintenanceRecord = Record<string, unknown>;

function pick(record: MaintenanceRecord, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
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
    stringifyJson(pick(record, ['ResponsableIDs', 'responsables', 'ResponsableIDsJSON'], []), '[]'),
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

    const merged = existing
      ? mergeJsonPayload(existing.payload_json, patch)
      : { ...patch };

    merged.MantenimientoID = savedId;
    merged.maintenanceId = savedId;

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

export async function listLocalMaintenances(
  db: SQLiteDatabase,
  scopeKey: string,
  status = '',
) {
  const rows = status
    ? await db.getAllAsync<{ payload_json: string }>(
      `SELECT payload_json FROM local_maintenances
       WHERE scope_key = ? AND status = ? AND tombstone = 0
       ORDER BY maintenance_date DESC, local_updated_at DESC`,
      scopeKey,
      normalizeStatus(status),
    )
    : await db.getAllAsync<{ payload_json: string }>(
      `SELECT payload_json FROM local_maintenances
       WHERE scope_key = ? AND tombstone = 0
       ORDER BY maintenance_date DESC, local_updated_at DESC`,
      scopeKey,
    );

  return rows.map((row) => parseJsonObject<MaintenanceRecord>(row.payload_json));
}
