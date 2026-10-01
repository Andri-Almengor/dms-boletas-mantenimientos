import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeJsonPayload, parseJsonObject, stringifyJson } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
} from '@/db/outboxRepository';
import {
  maintenanceDeviceSyncBase,
  withSyncBase,
} from '@/sync/syncBase';
import { createLocalId } from '@/utils/localId';

export type DeviceRecord = Record<string, unknown>;

function pick(record: DeviceRecord, keys: string[], fallback: unknown = '') {
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

function idOf(record: DeviceRecord) {
  return String(pick(record, ['EvidenciaMantenimientoID', 'deviceId', 'id'], '')).trim();
}

function maintenanceIdOf(record: DeviceRecord) {
  return String(pick(record, ['MantenimientoRef', 'MantenimientoID', 'maintenanceId'], '')).trim();
}

async function refreshDetailCountsTx(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
) {
  const counts = await db.getFirstAsync<{ device_count: number; evidence_count: number }>(
    `SELECT
       (SELECT COUNT(*) FROM local_maintenance_devices
        WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0) AS device_count,
       (SELECT COUNT(*) FROM local_maintenance_evidence
        WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0) AS evidence_count`,
    scopeKey,
    maintenanceId,
    scopeKey,
    maintenanceId,
  );
  await db.runAsync(
    `INSERT INTO local_maintenance_detail_state (
       scope_key, maintenance_id, complete, downloaded_at,
       server_updated_at, device_count, evidence_count
     ) VALUES (?, ?, 1, ?, '', ?, ?)
     ON CONFLICT(scope_key, maintenance_id) DO UPDATE SET
       complete = 1,
       device_count = excluded.device_count,
       evidence_count = excluded.evidence_count`,
    scopeKey,
    maintenanceId,
    new Date().toISOString(),
    Number(counts?.device_count || 0),
    Number(counts?.evidence_count || 0),
  );
}

async function upsertDeviceRow(
  db: SQLiteDatabase,
  scopeKey: string,
  record: DeviceRecord,
  syncStatus: string,
) {
  const id = idOf(record);
  const maintenanceId = maintenanceIdOf(record);
  if (!id || !maintenanceId) {
    throw new Error('El dispositivo local requiere ID y mantenimiento.');
  }

  const now = new Date().toISOString();
  const updatedAt = String(pick(record, ['FechaActualizacion', 'updatedAt', 'FechaCreacion'], ''));

  await db.runAsync(
    `INSERT INTO local_maintenance_devices (
       scope_key, device_id, maintenance_id, equipment_location_id,
       equipment_location_name, zone, device_type_id, device_type_name,
       manufacturer_id, manufacturer_name, model_id, model_name, device_name,
       serial_number, mac_address, status, work_date, technician_ids_json,
       payload_json, sync_status, server_updated_at, local_updated_at,
       last_synced_at, tombstone
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(scope_key, device_id) DO UPDATE SET
       maintenance_id = excluded.maintenance_id,
       equipment_location_id = excluded.equipment_location_id,
       equipment_location_name = excluded.equipment_location_name,
       zone = excluded.zone,
       device_type_id = excluded.device_type_id,
       device_type_name = excluded.device_type_name,
       manufacturer_id = excluded.manufacturer_id,
       manufacturer_name = excluded.manufacturer_name,
       model_id = excluded.model_id,
       model_name = excluded.model_name,
       device_name = excluded.device_name,
       serial_number = excluded.serial_number,
       mac_address = excluded.mac_address,
       status = excluded.status,
       work_date = excluded.work_date,
       technician_ids_json = excluded.technician_ids_json,
       payload_json = excluded.payload_json,
       sync_status = excluded.sync_status,
       server_updated_at = CASE
         WHEN excluded.server_updated_at <> '' THEN excluded.server_updated_at
         ELSE local_maintenance_devices.server_updated_at
       END,
       local_updated_at = excluded.local_updated_at,
       last_synced_at = CASE
         WHEN excluded.sync_status = 'SYNCED' THEN excluded.last_synced_at
         ELSE local_maintenance_devices.last_synced_at
       END,
       tombstone = 0`,
    scopeKey,
    id,
    maintenanceId,
    String(pick(record, ['UbicacionEquipoID', 'ubicacionEquipoId'])),
    String(pick(record, ['UbicacionEquipoNombre', 'ubicacionEquipoNombre'])),
    String(pick(record, ['Zona', 'zona'])),
    String(pick(record, ['TipoDispositivoID', 'tipoDispositivoId'])),
    String(pick(record, ['TipoDispositivo', 'Categoria', 'categoria'])),
    String(pick(record, ['FabricanteID', 'fabricanteId'])),
    String(pick(record, ['Fabricante', 'fabricante'])),
    String(pick(record, ['ModeloID', 'modeloId'])),
    String(pick(record, ['Modelo', 'modelo'])),
    String(pick(record, ['NombreDispositivo', 'nombre'])),
    String(pick(record, ['Serie', 'serie'])),
    String(pick(record, ['DireccionMAC', 'macAddress'])),
    String(pick(record, ['Estado', 'estado'])),
    String(pick(record, ['FechaTrabajo', 'fechaTrabajo'])),
    jsonArrayText(pick(record, ['TecnicoIDs', 'tecnicoIds', 'TecnicoIDsJSON'], [])),
    stringifyJson(record),
    syncStatus,
    updatedAt,
    now,
    syncStatus === 'SYNCED' ? now : '',
  );
}

export async function upsertRemoteDevice(
  db: SQLiteDatabase,
  scopeKey: string,
  record: DeviceRecord,
) {
  await upsertDeviceRow(db, scopeKey, record, 'SYNCED');
}

export async function saveLocalDevice(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
  patch: DeviceRecord,
) {
  let deviceId = idOf(patch);
  let operationId = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = deviceId
      ? await transaction.getFirstAsync<{ payload_json: string; sync_status: string }>(
        `SELECT payload_json, sync_status FROM local_maintenance_devices
         WHERE scope_key = ? AND device_id = ?`,
        scopeKey,
        deviceId,
      )
      : null;

    if (!deviceId) deviceId = createLocalId('dispositivo');

    const existingPayload = existing
      ? parseJsonObject<DeviceRecord>(existing.payload_json)
      : null;
    let merged = existing
      ? mergeJsonPayload(existing.payload_json, patch)
      : { ...patch };

    merged.EvidenciaMantenimientoID = deviceId;
    merged.deviceId = deviceId;
    merged.MantenimientoRef = maintenanceId;
    merged.MantenimientoID = maintenanceId;
    merged.maintenanceId = maintenanceId;

    if (existingPayload && !merged.__syncBase) {
      merged = withSyncBase(
        merged,
        maintenanceDeviceSyncBase(existingPayload, maintenanceId),
      );
    }

    const pendingCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenanceDevice',
      deviceId,
    );
    const localOnly = !existing || existing.sync_status === 'LOCAL_ONLY' || Boolean(pendingCreate);

    await upsertDeviceRow(
      transaction,
      scopeKey,
      merged,
      localOnly ? 'LOCAL_ONLY' : 'PENDING',
    );

    const maintenanceCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenance',
      maintenanceId,
    );

    const queued = await enqueueOutboxOperationTx(transaction, {
      scopeKey,
      operationKind: localOnly ? 'CREATE' : 'UPDATE',
      route: localOnly ? 'maintenance.devices.create' : 'maintenance.devices.update',
      entityType: 'maintenanceDevice',
      entityId: deviceId,
      aggregateId: maintenanceId,
      payload: merged,
      priority: 60,
      dependsOnOperationId: maintenanceCreate?.operation_id || '',
    });
    operationId = queued.operationId;
    await refreshDetailCountsTx(transaction, scopeKey, maintenanceId);
  });

  return { deviceId, operationId };
}

export async function deleteLocalDevice(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
  deviceId: string,
) {
  let operationId = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getFirstAsync<{
      payload_json: string;
      sync_status: string;
    }>(
      `SELECT payload_json, sync_status
       FROM local_maintenance_devices
       WHERE scope_key = ? AND maintenance_id = ? AND device_id = ? AND tombstone = 0`,
      scopeKey,
      maintenanceId,
      deviceId,
    );
    if (!existing) return;

    const pendingCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenanceDevice',
      deviceId,
    );

    const createInFlight = pendingCreate?.status === 'IN_FLIGHT';
    const cancelableLocalCreate = (
      existing.sync_status === 'LOCAL_ONLY' || Boolean(pendingCreate)
    ) && !createInFlight;

    if (cancelableLocalCreate) {
      const evidenceIds = await transaction.getAllAsync<{ evidence_id: string }>(
        `SELECT evidence_id FROM local_maintenance_evidence
         WHERE scope_key = ? AND device_id = ?`,
        scopeKey,
        deviceId,
      );
      for (const evidence of evidenceIds) {
        await transaction.runAsync(
          `DELETE FROM sync_outbox
           WHERE scope_key = ? AND entity_type = 'maintenanceEvidence'
             AND entity_id = ? AND status <> 'SUCCEEDED'`,
          scopeKey,
          evidence.evidence_id,
        );
      }
      await transaction.runAsync(
        `DELETE FROM sync_outbox
         WHERE scope_key = ? AND entity_type = 'maintenanceDevice'
           AND entity_id = ? AND status <> 'SUCCEEDED'`,
        scopeKey,
        deviceId,
      );
      await transaction.runAsync(
        `DELETE FROM local_maintenance_devices
         WHERE scope_key = ? AND device_id = ?`,
        scopeKey,
        deviceId,
      );
    } else {
      await transaction.runAsync(
        `DELETE FROM sync_outbox
         WHERE scope_key = ? AND entity_type = 'maintenanceDevice'
           AND entity_id = ?
           AND status IN ('PENDING','FAILED','BLOCKED','CONFLICT')`,
        scopeKey,
        deviceId,
      );
      await transaction.runAsync(
        `UPDATE local_maintenance_devices
         SET tombstone = 1, sync_status = 'PENDING', local_updated_at = ?
         WHERE scope_key = ? AND device_id = ?`,
        new Date().toISOString(),
        scopeKey,
        deviceId,
      );
      const payload = parseJsonObject<DeviceRecord>(existing.payload_json);
      const queued = await enqueueOutboxOperationTx(transaction, {
        scopeKey,
        operationKind: 'DELETE',
        route: 'maintenance.devices.delete',
        entityType: 'maintenanceDevice',
        entityId: deviceId,
        aggregateId: maintenanceId,
        payload: {
          maintenanceId,
          MantenimientoID: maintenanceId,
          deviceId,
          EvidenciaMantenimientoID: deviceId,
          __syncBase: payload.__syncBase,
        },
        priority: 65,
        dedupeKey: `maintenance.devices.delete:maintenanceDevice:${deviceId}`,
        dependsOnOperationId: createInFlight ? pendingCreate?.operation_id || '' : '',
      });
      operationId = queued.operationId;
    }

    await refreshDetailCountsTx(transaction, scopeKey, maintenanceId);
  });

  return { deviceId, operationId };
}

export async function markDeviceDeleteConfirmed(
  db: SQLiteDatabase,
  scopeKey: string,
  deviceId: string,
) {
  await db.runAsync(
    `UPDATE local_maintenance_devices
     SET tombstone = 1, sync_status = 'SYNCED', last_synced_at = ?,
         local_updated_at = ?
     WHERE scope_key = ? AND device_id = ?`,
    new Date().toISOString(),
    new Date().toISOString(),
    scopeKey,
    deviceId,
  );
}

export async function countLocalDevices(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
) {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total
     FROM local_maintenance_devices
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
    scopeKey,
    maintenanceId,
  );
  return Number(row?.total || 0);
}

export async function listLocalDevices(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
) {
  const rows = await db.getAllAsync<{ payload_json: string }>(
    `SELECT payload_json FROM local_maintenance_devices
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0
     ORDER BY local_updated_at ASC`,
    scopeKey,
    maintenanceId,
  );
  return rows.map((row) => parseJsonObject<DeviceRecord>(row.payload_json));
}
