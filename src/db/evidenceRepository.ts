import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeJsonPayload, parseJsonObject, stringifyJson } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
} from '@/db/outboxRepository';
import {
  maintenanceEvidenceSyncBase,
  withSyncBase,
} from '@/sync/syncBase';
import { createLocalId } from '@/utils/localId';

export type EvidenceRecord = Record<string, unknown>;

function pick(record: EvidenceRecord, keys: string[], fallback: unknown = '') {
  for (const key of keys) {
    const value = record?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return fallback;
}

function idOf(record: EvidenceRecord) {
  return String(pick(record, ['FotoDispositivoID', 'imageId', 'id'], '')).trim();
}

async function upsertEvidenceRow(
  db: SQLiteDatabase,
  scopeKey: string,
  record: EvidenceRecord,
  syncStatus: string,
  localFileId = '',
) {
  const id = idOf(record);
  const deviceId = String(pick(record, ['DispositivoMantenimientoRef', 'deviceId']));
  const maintenanceId = String(pick(record, ['MantenimientoID', 'maintenanceId']));
  if (!id || !deviceId || !maintenanceId) {
    throw new Error('La evidencia local requiere IDs de evidencia, dispositivo y mantenimiento.');
  }

  const now = new Date().toISOString();
  const updatedAt = String(pick(record, ['FechaActualizacion', 'updatedAt', 'FechaCreacion'], ''));

  await db.runAsync(
    `INSERT INTO local_maintenance_evidence (
       scope_key, evidence_id, maintenance_id, device_id, local_file_id,
       evidence_type, note, evidence_context, captured_at, project_target_type,
       project_relation_key, project_component_local_id, project_component_type_id,
       project_component_name, media_type, mime_type, file_name, drive_file_id,
       drive_url, preview_url, payload_json, sync_status, server_updated_at,
       local_updated_at, last_synced_at, tombstone
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
     ON CONFLICT(scope_key, evidence_id) DO UPDATE SET
       maintenance_id = excluded.maintenance_id,
       device_id = excluded.device_id,
       local_file_id = CASE
         WHEN excluded.local_file_id <> '' THEN excluded.local_file_id
         ELSE local_maintenance_evidence.local_file_id
       END,
       evidence_type = excluded.evidence_type,
       note = excluded.note,
       evidence_context = excluded.evidence_context,
       captured_at = excluded.captured_at,
       project_target_type = excluded.project_target_type,
       project_relation_key = excluded.project_relation_key,
       project_component_local_id = excluded.project_component_local_id,
       project_component_type_id = excluded.project_component_type_id,
       project_component_name = excluded.project_component_name,
       media_type = excluded.media_type,
       mime_type = excluded.mime_type,
       file_name = excluded.file_name,
       drive_file_id = excluded.drive_file_id,
       drive_url = excluded.drive_url,
       preview_url = excluded.preview_url,
       payload_json = excluded.payload_json,
       sync_status = excluded.sync_status,
       server_updated_at = CASE
         WHEN excluded.server_updated_at <> '' THEN excluded.server_updated_at
         ELSE local_maintenance_evidence.server_updated_at
       END,
       local_updated_at = excluded.local_updated_at,
       last_synced_at = CASE
         WHEN excluded.sync_status = 'SYNCED' THEN excluded.last_synced_at
         ELSE local_maintenance_evidence.last_synced_at
       END,
       tombstone = 0`,
    scopeKey,
    id,
    maintenanceId,
    deviceId,
    localFileId,
    String(pick(record, ['Tipo', 'tipo'], 'Antes')),
    String(pick(record, ['Nota', 'nota'])),
    String(pick(record, ['ContextoEvidencia', 'contextoEvidencia'], 'MANTENIMIENTO')),
    String(pick(record, ['FechaCaptura', 'fechaCaptura', 'capturedAt'])),
    String(pick(record, ['ProyectoDestinoTipo', 'projectTargetType'])),
    String(pick(record, ['ProyectoRelacionClave', 'projectRelationKey'])),
    String(pick(record, ['ProyectoComponenteLocalID', 'projectComponentLocalId'])),
    String(pick(record, ['ProyectoComponenteTipoDispositivoID', 'projectComponentTypeId'])),
    String(pick(record, ['ProyectoComponenteNombre', 'projectComponentName'])),
    String(pick(record, ['TipoMedio', 'mediaType'], 'image')),
    String(pick(record, ['MimeType', 'mimeType'])),
    String(pick(record, ['Nombre', 'NombreArchivo', 'fileName'])),
    String(pick(record, ['DriveFileID', 'driveFileId'])),
    String(pick(record, ['DriveURL', 'driveUrl'])),
    String(pick(record, ['PreviewURL', 'previewUrl'])),
    stringifyJson(record),
    syncStatus,
    updatedAt,
    now,
    syncStatus === 'SYNCED' ? now : '',
  );
}

export async function upsertRemoteEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
  deviceId: string,
  record: EvidenceRecord,
) {
  await upsertEvidenceRow(
    db,
    scopeKey,
    {
      ...record,
      MantenimientoID: maintenanceId,
      maintenanceId,
      DispositivoMantenimientoRef: deviceId,
      deviceId,
    },
    'SYNCED',
  );
}

export async function saveLocalEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  input: {
    maintenanceId: string;
    deviceId: string;
    localFileId?: string;
    patch: EvidenceRecord;
  },
) {
  let evidenceId = idOf(input.patch);
  let operationId = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = evidenceId
      ? await transaction.getFirstAsync<{ payload_json: string; sync_status: string; local_file_id: string }>(
        `SELECT payload_json, sync_status, local_file_id
         FROM local_maintenance_evidence
         WHERE scope_key = ? AND evidence_id = ?`,
        scopeKey,
        evidenceId,
      )
      : null;

    if (!evidenceId) evidenceId = createLocalId('evidencia');

    const existingPayload = existing
      ? parseJsonObject<EvidenceRecord>(existing.payload_json)
      : null;
    let merged = existing
      ? mergeJsonPayload(existing.payload_json, input.patch)
      : { ...input.patch };

    merged.FotoDispositivoID = evidenceId;
    merged.imageId = evidenceId;
    merged.MantenimientoID = input.maintenanceId;
    merged.maintenanceId = input.maintenanceId;
    merged.DispositivoMantenimientoRef = input.deviceId;
    merged.deviceId = input.deviceId;

    if (existingPayload && !merged.__syncBase) {
      merged = withSyncBase(
        merged,
        maintenanceEvidenceSyncBase(existingPayload, input.maintenanceId),
      );
    }

    const pendingCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenanceEvidence',
      evidenceId,
    );
    const localOnly = !existing || existing.sync_status === 'LOCAL_ONLY' || Boolean(pendingCreate);
    const localFileId = String(input.localFileId || existing?.local_file_id || '');

    await upsertEvidenceRow(
      transaction,
      scopeKey,
      merged,
      localOnly ? 'LOCAL_ONLY' : 'PENDING',
      localFileId,
    );

    const deviceCreate = await findPendingEntityCreateOperation(
      transaction,
      scopeKey,
      'maintenanceDevice',
      input.deviceId,
    );

    const queued = await enqueueOutboxOperationTx(transaction, {
      scopeKey,
      operationKind: localOnly ? 'MEDIA_UPLOAD' : 'UPDATE',
      route: localOnly ? 'maintenance.images.upload' : 'maintenance.images.update',
      entityType: 'maintenanceEvidence',
      entityId: evidenceId,
      aggregateId: input.maintenanceId,
      localFileId,
      payload: merged,
      priority: 70,
      dependsOnOperationId: deviceCreate?.operation_id || '',
    });
    operationId = queued.operationId;
  });

  return { evidenceId, operationId };
}

export async function listLocalEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  deviceId: string,
) {
  const rows = await db.getAllAsync<{ payload_json: string }>(
    `SELECT payload_json FROM local_maintenance_evidence
     WHERE scope_key = ? AND device_id = ? AND tombstone = 0
     ORDER BY captured_at DESC, local_updated_at DESC`,
    scopeKey,
    deviceId,
  );
  return rows.map((row) => parseJsonObject<EvidenceRecord>(row.payload_json));
}
