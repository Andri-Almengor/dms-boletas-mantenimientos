import type { SQLiteDatabase } from 'expo-sqlite';
import { parseJsonObject, stringifyJson } from '@/db/json';

const RESOURCE_ID_KEYS: Record<string, string[]> = {
  client: ['ClienteID', 'clienteId', 'clientId', 'id'],
  clientLocation: ['UbicacionID', 'ubicacionId', 'locationId', 'id'],
  equipmentLocation: ['UbicacionEquipoID', 'ubicacionEquipoId', 'equipmentLocationId', 'id'],
  contact: ['ContactoID', 'contactoId', 'contactId', 'id'],
  catalogCategory: ['CategoriaID', 'categoriaId', 'categoryId', 'id'],
  deviceType: ['TipoDispositivoID', 'tipoDispositivoId', 'deviceTypeId', 'id'],
  manufacturer: ['FabricanteID', 'fabricanteId', 'manufacturerId', 'id'],
  model: ['ModeloID', 'modeloId', 'modelId', 'id'],
  failureType: ['TipoFallaID', 'tipoFallaId', 'failureTypeId', 'id'],
  deviceManufacturerRelation: ['RelacionID', 'relacionId', 'relationshipId', 'id'],
  assignableUser: ['UsuarioID', 'userId', 'id'],
  maintenanceQuestion: ['PreguntaDispositivoID', 'questionId', 'id'],
  maintenanceConfig: ['id'],
};

const RESOURCE_PARENT_KEYS: Record<string, string[]> = {
  clientLocation: ['ClienteID', 'clienteId', 'clientId'],
  equipmentLocation: ['UbicacionID', 'ubicacionId', 'locationId', 'ClienteID', 'clienteId'],
  contact: ['ClienteID', 'clienteId', 'clientId'],
  model: ['FabricanteID', 'fabricanteId', 'manufacturerId'],
  deviceManufacturerRelation: ['TipoDispositivoID', 'tipoDispositivoId', 'deviceTypeId'],
  maintenanceQuestion: ['TipoDispositivoID', 'tipoDispositivoId'],
};

const RESOURCE_LABEL_KEYS: Record<string, string[]> = {
  client: ['Nombre', 'Cliente', 'nombre'],
  clientLocation: ['Nombre', 'Ubicacion', 'ubicacion'],
  equipmentLocation: ['Nombre', 'UbicacionEquipo', 'zona'],
  contact: ['Nombre', 'NombreCompleto', 'correo'],
  catalogCategory: ['Nombre', 'Categoria', 'nombre'],
  deviceType: ['Nombre', 'TipoDispositivo', 'nombre'],
  manufacturer: ['Nombre', 'Fabricante', 'nombre'],
  model: ['Nombre', 'Modelo', 'nombre'],
  failureType: ['Nombre', 'TipoFalla', 'nombre'],
  deviceManufacturerRelation: ['RelacionID', 'id'],
  assignableUser: ['NombreCompleto', 'Nombre', 'Correo', 'UsuarioID'],
  maintenanceQuestion: ['Pregunta', 'Clave', 'question'],
  maintenanceConfig: ['id'],
};

function first(record: Record<string, unknown>, keys: string[] = []) {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim();
  }
  return '';
}

export function resourceEntityId(
  resource: string,
  record: Record<string, unknown>,
) {
  return first(record, RESOURCE_ID_KEYS[resource] || ['id']);
}

export async function upsertResourceItemTx(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  record: Record<string, unknown>,
) {
  const entityId = resourceEntityId(resource, record);
  if (!entityId) return false;

  const now = new Date().toISOString();
  const parentId = first(record, RESOURCE_PARENT_KEYS[resource]);
  const label = first(record, RESOURCE_LABEL_KEYS[resource]);
  const serverUpdatedAt = first(record, ['FechaActualizacion', 'updatedAt', 'FechaCreacion']);
  const activeValue = record.Activo ?? record.active ?? true;
  const active = activeValue === false || String(activeValue).toLowerCase() === 'false' ? 0 : 1;

  await db.runAsync(
    `INSERT INTO local_resource_items (
       scope_key, resource, entity_id, parent_id, label, payload_json,
       server_updated_at, cached_at, active
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_key, resource, entity_id) DO UPDATE SET
       parent_id = excluded.parent_id,
       label = excluded.label,
       payload_json = excluded.payload_json,
       server_updated_at = excluded.server_updated_at,
       cached_at = excluded.cached_at,
       active = excluded.active`,
    scopeKey,
    resource,
    entityId,
    parentId,
    label,
    stringifyJson(record),
    serverUpdatedAt,
    now,
    active,
  );
  return true;
}

export async function removeResourceItemTx(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  entityId: string,
) {
  await db.runAsync(
    `DELETE FROM local_resource_items
     WHERE scope_key = ? AND resource = ? AND entity_id = ?`,
    scopeKey,
    resource,
    entityId,
  );
}

export async function replaceResourceSnapshot(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  records: Record<string, unknown>[],
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'DELETE FROM local_resource_items WHERE scope_key = ? AND resource = ?',
      scopeKey,
      resource,
    );
    for (const record of records || []) {
      await upsertResourceItemTx(transaction, scopeKey, resource, record);
    }
  });
}

export async function listResourceItems(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  parentId = '',
) {
  const rows = parentId
    ? await db.getAllAsync<{ payload_json: string }>(
      `SELECT payload_json FROM local_resource_items
       WHERE scope_key = ? AND resource = ? AND parent_id = ? AND active = 1
       ORDER BY label COLLATE NOCASE ASC`,
      scopeKey,
      resource,
      parentId,
    )
    : await db.getAllAsync<{ payload_json: string }>(
      `SELECT payload_json FROM local_resource_items
       WHERE scope_key = ? AND resource = ? AND active = 1
       ORDER BY label COLLATE NOCASE ASC`,
      scopeKey,
      resource,
    );

  return rows.map((row) => {
    try { return JSON.parse(row.payload_json) as Record<string, unknown>; }
    catch { return {}; }
  });
}

export async function listResourceItemsByParents(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  parentIds: string[],
) {
  const ids = [...new Set(
    parentIds.map((value) => String(value || '').trim()).filter(Boolean),
  )];
  if (!ids.length) return [];

  const placeholders = ids.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{ payload_json: string }>(
    `SELECT payload_json
     FROM local_resource_items
     WHERE scope_key = ?
       AND resource = ?
       AND parent_id IN (${placeholders})
       AND active = 1
     ORDER BY parent_id COLLATE NOCASE ASC, label COLLATE NOCASE ASC`,
    scopeKey,
    resource,
    ...ids,
  );

  return rows.map((row) => {
    try { return JSON.parse(row.payload_json) as Record<string, unknown>; }
    catch { return {}; }
  });
}


export async function remapCreatedEquipmentLocationTx(
  db: SQLiteDatabase,
  scopeKey: string,
  localId: string,
  serverRecord: Record<string, unknown>,
) {
  const serverId = resourceEntityId('equipmentLocation', serverRecord);
  if (!serverId) {
    throw new Error('El servidor no devolvió UbicacionEquipoID para la ubicación creada.');
  }

  const serverName = first(
    serverRecord,
    ['Nombre', 'UbicacionEquipo', 'zona'],
  );

  if (serverId === localId) {
    await upsertResourceItemTx(
      db,
      scopeKey,
      'equipmentLocation',
      serverRecord,
    );
    return serverId;
  }

  await removeResourceItemTx(
    db,
    scopeKey,
    'equipmentLocation',
    localId,
  );
  await upsertResourceItemTx(
    db,
    scopeKey,
    'equipmentLocation',
    serverRecord,
  );

  const devices = await db.getAllAsync<{
    device_id: string;
    payload_json: string;
  }>(
    `SELECT device_id, payload_json
     FROM local_maintenance_devices
     WHERE scope_key = ? AND equipment_location_id = ? AND tombstone = 0`,
    scopeKey,
    localId,
  );

  for (const device of devices) {
    const payload = parseJsonObject<Record<string, unknown>>(
      device.payload_json,
    );
    const next = {
      ...payload,
      UbicacionEquipoID: serverId,
      ubicacionEquipoId: serverId,
      UbicacionEquipoNombre: serverName
        || payload.UbicacionEquipoNombre
        || payload.ubicacionEquipoNombre
        || payload.Zona
        || '',
      ubicacionEquipoNombre: serverName
        || payload.ubicacionEquipoNombre
        || payload.UbicacionEquipoNombre
        || payload.Zona
        || '',
      Zona: serverName
        || payload.Zona
        || payload.UbicacionEquipoNombre
        || '',
      zona: serverName
        || payload.zona
        || payload.UbicacionEquipoNombre
        || '',
    };

    await db.runAsync(
      `UPDATE local_maintenance_devices
       SET equipment_location_id = ?,
           equipment_location_name = CASE
             WHEN ? <> '' THEN ?
             ELSE equipment_location_name
           END,
           zone = CASE WHEN ? <> '' THEN ? ELSE zone END,
           payload_json = ?,
           local_updated_at = ?
       WHERE scope_key = ? AND device_id = ?`,
      serverId,
      serverName,
      serverName,
      serverName,
      serverName,
      stringifyJson(next),
      new Date().toISOString(),
      scopeKey,
      device.device_id,
    );

    const operations = await db.getAllAsync<{
      operation_id: string;
      payload_json: string;
    }>(
      `SELECT operation_id, payload_json
       FROM sync_outbox
       WHERE scope_key = ?
         AND entity_type = 'maintenanceDevice'
         AND entity_id = ?
         AND status IN ('PENDING','FAILED','BLOCKED','CONFLICT')`,
      scopeKey,
      device.device_id,
    );

    for (const operation of operations) {
      const operationPayload = parseJsonObject<Record<string, unknown>>(
        operation.payload_json,
      );
      await db.runAsync(
        `UPDATE sync_outbox
         SET payload_json = ?, updated_at = ?
         WHERE operation_id = ?`,
        stringifyJson({
          ...operationPayload,
          UbicacionEquipoID: serverId,
          ubicacionEquipoId: serverId,
          UbicacionEquipoNombre: serverName
            || operationPayload.UbicacionEquipoNombre
            || operationPayload.ubicacionEquipoNombre
            || '',
          ubicacionEquipoNombre: serverName
            || operationPayload.ubicacionEquipoNombre
            || operationPayload.UbicacionEquipoNombre
            || '',
          Zona: serverName
            || operationPayload.Zona
            || operationPayload.UbicacionEquipoNombre
            || '',
          zona: serverName
            || operationPayload.zona
            || operationPayload.UbicacionEquipoNombre
            || '',
        }),
        new Date().toISOString(),
        operation.operation_id,
      );
    }
  }

  return serverId;
}
