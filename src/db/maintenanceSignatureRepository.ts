import type { SQLiteDatabase } from 'expo-sqlite';
import { parseJsonObject } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
} from '@/db/outboxRepository';
import { maintenanceHasServerSignature } from '@/features/maintenance/maintenanceSignature';

export type LocalMaintenanceSignature = {
  maintenanceId: string;
  localFileId: string;
  localUri: string;
  mimeType: string;
  syncStatus: string;
  serverFileId: string;
  serverUrl: string;
  capturedAt: string;
  signedAt: string;
  updatedAt: string;
};

export async function readLocalMaintenanceSignature(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
): Promise<LocalMaintenanceSignature | null> {
  const row = await db.getFirstAsync<{
    maintenance_id: string;
    local_file_id: string;
    local_uri: string;
    mime_type: string;
    sync_status: string;
    server_file_id: string;
    server_url: string;
    captured_at: string;
    signed_at: string;
    updated_at: string;
  }>(
    `SELECT
       s.maintenance_id,
       s.local_file_id,
       COALESCE(f.local_uri, '') AS local_uri,
       s.mime_type,
       s.sync_status,
       s.server_file_id,
       s.server_url,
       s.captured_at,
       s.signed_at,
       s.updated_at
     FROM local_maintenance_signatures s
     LEFT JOIN local_files f
       ON f.scope_key = s.scope_key AND f.file_id = s.local_file_id
     WHERE s.scope_key = ? AND s.maintenance_id = ?`,
    scopeKey,
    maintenanceId,
  );

  return row ? {
    maintenanceId: row.maintenance_id,
    localFileId: row.local_file_id,
    localUri: row.local_uri,
    mimeType: row.mime_type,
    syncStatus: row.sync_status,
    serverFileId: row.server_file_id,
    serverUrl: row.server_url,
    capturedAt: row.captured_at,
    signedAt: row.signed_at,
    updatedAt: row.updated_at,
  } : null;
}

export async function saveLocalMaintenanceSignatureTx(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    maintenanceId: string;
    localFileId: string;
    mimeType: string;
    capturedAt?: string;
  },
) {
  const maintenance = await db.getFirstAsync<{ payload_json: string }>(
    `SELECT payload_json
     FROM local_maintenances
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
    input.scopeKey,
    input.maintenanceId,
  );
  if (!maintenance) {
    throw new Error('El mantenimiento no está disponible en SQLite.');
  }

  const maintenanceRecord = parseJsonObject<Record<string, unknown>>(
    maintenance.payload_json,
  );
  if (maintenanceHasServerSignature(maintenanceRecord)) {
    throw new Error('Este mantenimiento ya tiene una firma general registrada.');
  }

  const current = await db.getFirstAsync<{
    local_file_id: string;
    sync_status: string;
    local_uri: string;
  }>(
    `SELECT
       s.local_file_id,
       s.sync_status,
       COALESCE(f.local_uri, '') AS local_uri
     FROM local_maintenance_signatures s
     LEFT JOIN local_files f
       ON f.scope_key = s.scope_key AND f.file_id = s.local_file_id
     WHERE s.scope_key = ? AND s.maintenance_id = ?`,
    input.scopeKey,
    input.maintenanceId,
  );

  if (current?.sync_status === 'SYNCED') {
    throw new Error(
      'La firma ya fue confirmada por el servidor. Para reemplazarla debe utilizar el flujo administrativo existente.',
    );
  }

  const inFlight = await db.getFirstAsync<{ operation_id: string }>(
    `SELECT operation_id
     FROM sync_outbox
     WHERE scope_key = ?
       AND aggregate_id = ?
       AND operation_kind = 'SIGNATURE_UPLOAD'
       AND status = 'IN_FLIGHT'
     ORDER BY row_id DESC
     LIMIT 1`,
    input.scopeKey,
    input.maintenanceId,
  );
  if (inFlight) {
    throw new Error('La firma se está sincronizando en este momento y no puede reemplazarse todavía.');
  }

  const maintenanceCreate = await findPendingEntityCreateOperation(
    db,
    input.scopeKey,
    'maintenance',
    input.maintenanceId,
  );

  const now = new Date().toISOString();
  const capturedAt = input.capturedAt || now;

  await db.runAsync(
    `INSERT INTO local_maintenance_signatures (
       scope_key, maintenance_id, local_file_id, mime_type, sync_status,
       server_file_id, server_url, captured_at, signed_at, updated_at
     ) VALUES (?, ?, ?, ?, 'PENDING', '', '', ?, '', ?)
     ON CONFLICT(scope_key, maintenance_id) DO UPDATE SET
       local_file_id = excluded.local_file_id,
       mime_type = excluded.mime_type,
       sync_status = 'PENDING',
       server_file_id = '',
       server_url = '',
       captured_at = excluded.captured_at,
       signed_at = '',
       updated_at = excluded.updated_at`,
    input.scopeKey,
    input.maintenanceId,
    input.localFileId,
    input.mimeType,
    capturedAt,
    now,
  );

  const queued = await enqueueOutboxOperationTx(db, {
    scopeKey: input.scopeKey,
    operationKind: 'SIGNATURE_UPLOAD',
    route: 'maintenance.signature.link',
    entityType: 'maintenance',
    entityId: input.maintenanceId,
    aggregateId: input.maintenanceId,
    localFileId: input.localFileId,
    payload: {
      maintenanceId: input.maintenanceId,
      MantenimientoID: input.maintenanceId,
      mimeType: input.mimeType,
    },
    priority: 80,
    dependsOnOperationId: maintenanceCreate?.operation_id || '',
    dedupeKey: `maintenanceSignature:${input.maintenanceId}`,
  });

  if (
    current?.local_file_id
    && current.local_file_id !== input.localFileId
  ) {
    await db.runAsync(
      `DELETE FROM local_files
       WHERE scope_key = ? AND file_id = ?`,
      input.scopeKey,
      current.local_file_id,
    );
  }

  return {
    operationId: queued.operationId,
    previousLocalUri: current?.local_uri || '',
  };
}

export async function markMaintenanceSignatureSyncedTx(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    maintenanceId: string;
    serverFileId?: string;
    serverUrl?: string;
    signedAt?: string;
  },
) {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE local_maintenance_signatures
     SET sync_status = 'SYNCED',
         server_file_id = ?,
         server_url = ?,
         signed_at = ?,
         updated_at = ?
     WHERE scope_key = ? AND maintenance_id = ?`,
    String(input.serverFileId || ''),
    String(input.serverUrl || ''),
    String(input.signedAt || now),
    now,
    input.scopeKey,
    input.maintenanceId,
  );
}
