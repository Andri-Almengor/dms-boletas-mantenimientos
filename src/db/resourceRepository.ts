import type { SQLiteDatabase } from 'expo-sqlite';
import { stringifyJson } from '@/db/json';

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
};

const RESOURCE_PARENT_KEYS: Record<string, string[]> = {
  clientLocation: ['ClienteID', 'clienteId', 'clientId'],
  equipmentLocation: ['UbicacionID', 'ubicacionId', 'locationId', 'ClienteID', 'clienteId'],
  contact: ['ClienteID', 'clienteId', 'clientId'],
  model: ['FabricanteID', 'fabricanteId', 'manufacturerId'],
  deviceManufacturerRelation: ['TipoDispositivoID', 'tipoDispositivoId', 'deviceTypeId'],
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
