import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeJsonPayload, parseJsonObject, stringifyJson } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
} from '@/db/outboxRepository';
import { createLocalId } from '@/utils/localId';

type DeviceRecord = Record<string, unknown>;

function pick(record: DeviceRecord, keys: string[], fallback = '') {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

function idOf(record: DeviceRecord) {
  return String(pick(record, ['EvidenciaMantenimientoID', 'deviceId', 'id'], '')).trim();
}

function maintenanceIdOf(record: DeviceRecord) {
  return String(pick(record, ['MantenimientoRef', 'MantenimientoID', 'maintenanceId'], '')).trim();
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
    stringifyJson(pick(record, ['TecnicoIDs', 'tecnicoIds', 'TecnicoIDsJSON'], []), '[]'),
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

    const merged = existing
      ? mergeJsonPayload(existing.payload_json, patch)
      : { ...patch };

    merged.EvidenciaMantenimientoID = deviceId;
    merged.deviceId = deviceId;
    merged.MantenimientoRef = maintenanceId;
    merged.MantenimientoID = maintenanceId;
    merged.maintenanceId = maintenanceId;

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
  });

  return { deviceId, operationId };
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
