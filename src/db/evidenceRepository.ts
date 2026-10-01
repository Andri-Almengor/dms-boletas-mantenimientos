import type { SQLiteDatabase } from 'expo-sqlite';
import { mergeJsonPayload, parseJsonObject, stringifyJson } from '@/db/json';
import {
  enqueueOutboxOperationTx,
  findPendingEntityCreateOperation,
  listUnresolvedEntityOperations,
} from '@/db/outboxRepository';
import {
  deleteLocalFileRecord,
  registerLocalFile,
} from '@/db/localFileRepository';
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

export async function getLocalEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  evidenceId: string,
) {
  const row = await db.getFirstAsync<{
    payload_json: string;
    sync_status: string;
    local_file_id: string;
    tombstone: number;
  }>(
    `SELECT payload_json, sync_status, local_file_id, tombstone
     FROM local_maintenance_evidence
     WHERE scope_key = ? AND evidence_id = ?`,
    scopeKey,
    evidenceId,
  );
  return row
    ? {
        record: parseJsonObject<EvidenceRecord>(row.payload_json),
        syncStatus: row.sync_status,
        localFileId: row.local_file_id,
        tombstone: Boolean(row.tombstone),
      }
    : null;
}

export async function attachLocalFileToEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  evidenceId: string,
  localFileId: string,
) {
  await db.runAsync(
    `UPDATE local_maintenance_evidence
     SET local_file_id = ?, local_updated_at = ?
     WHERE scope_key = ? AND evidence_id = ? AND tombstone = 0`,
    localFileId,
    new Date().toISOString(),
    scopeKey,
    evidenceId,
  );
}

export async function saveLocalEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  input: {
    maintenanceId: string;
    deviceId: string;
    localFileId?: string;
    localFile?: {
      localUri: string;
      fileName: string;
      mimeType: string;
      fileSize: number;
    };
    patch: EvidenceRecord;
  },
) {
  let evidenceId = idOf(input.patch);
  let operationId = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = evidenceId
      ? await transaction.getFirstAsync<{
          payload_json: string;
          sync_status: string;
          local_file_id: string;
        }>(
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

    const unresolved = await listUnresolvedEntityOperations(
      transaction,
      scopeKey,
      'maintenanceEvidence',
      evidenceId,
    );
    const mediaUpload = [...unresolved]
      .reverse()
      .find((operation) => operation.operation_kind === 'MEDIA_UPLOAD');
    const localOnly = !existing
      || existing.sync_status === 'LOCAL_ONLY'
      || Boolean(mediaUpload);
    let localFileId = String(input.localFileId || existing?.local_file_id || '');
    if (input.localFile) {
      localFileId = await registerLocalFile(transaction, {
        fileId: localFileId || undefined,
        scopeKey,
        ownerType: 'maintenanceEvidence',
        ownerId: evidenceId,
        localUri: input.localFile.localUri,
        fileName: input.localFile.fileName,
        mimeType: input.localFile.mimeType,
        fileSize: input.localFile.fileSize,
      });
    }

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

    if (localOnly && mediaUpload?.status === 'IN_FLIGHT') {
      const queued = await enqueueOutboxOperationTx(transaction, {
        scopeKey,
        operationKind: 'UPDATE',
        route: 'maintenance.images.update',
        entityType: 'maintenanceEvidence',
        entityId: evidenceId,
        aggregateId: input.maintenanceId,
        payload: merged,
        priority: 75,
        dependsOnOperationId: mediaUpload.operation_id,
      });
      operationId = queued.operationId;
    } else {
      const queued = await enqueueOutboxOperationTx(transaction, {
        scopeKey,
        operationKind: localOnly ? 'MEDIA_UPLOAD' : 'UPDATE',
        route: localOnly ? 'maintenance.images.upload' : 'maintenance.images.update',
        entityType: 'maintenanceEvidence',
        entityId: evidenceId,
        aggregateId: input.maintenanceId,
        localFileId: localOnly ? localFileId : '',
        payload: merged,
        priority: localOnly ? 70 : 75,
        dependsOnOperationId: localOnly
          ? deviceCreate?.operation_id || ''
          : '',
      });
      operationId = queued.operationId;
    }

    await refreshDetailCountsTx(transaction, scopeKey, input.maintenanceId);
  });

  return { evidenceId, operationId };
}

export async function deleteLocalEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  input: {
    maintenanceId: string;
    deviceId: string;
    evidenceId: string;
  },
) {
  let operationId = '';
  let discardLocalUri = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const existing = await transaction.getFirstAsync<{
      payload_json: string;
      sync_status: string;
      local_file_id: string;
      local_uri: string;
    }>(
      `SELECT
         e.payload_json,
         e.sync_status,
         e.local_file_id,
         COALESCE(f.local_uri, '') AS local_uri
       FROM local_maintenance_evidence e
       LEFT JOIN local_files f
         ON f.scope_key = e.scope_key AND f.file_id = e.local_file_id
       WHERE e.scope_key = ? AND e.evidence_id = ? AND e.tombstone = 0`,
      scopeKey,
      input.evidenceId,
    );
    if (!existing) return;

    const unresolved = await listUnresolvedEntityOperations(
      transaction,
      scopeKey,
      'maintenanceEvidence',
      input.evidenceId,
    );
    const mediaUpload = [...unresolved]
      .reverse()
      .find((operation) => operation.operation_kind === 'MEDIA_UPLOAD');
    const inFlight = [...unresolved]
      .reverse()
      .find((operation) => operation.status === 'IN_FLIGHT');
    const onlyLocal = existing.sync_status === 'LOCAL_ONLY'
      && (!mediaUpload || mediaUpload.status !== 'IN_FLIGHT');

    if (onlyLocal) {
      await transaction.runAsync(
        `DELETE FROM sync_outbox
         WHERE scope_key = ? AND entity_type = 'maintenanceEvidence'
           AND entity_id = ?
           AND status <> 'SUCCEEDED'`,
        scopeKey,
        input.evidenceId,
      );
      await transaction.runAsync(
        `DELETE FROM local_maintenance_evidence
         WHERE scope_key = ? AND evidence_id = ?`,
        scopeKey,
        input.evidenceId,
      );
      if (existing.local_file_id) {
        await deleteLocalFileRecord(
          transaction,
          scopeKey,
          existing.local_file_id,
        );
      }
      discardLocalUri = existing.local_uri;
    } else {
      await transaction.runAsync(
        `DELETE FROM sync_outbox
         WHERE scope_key = ? AND entity_type = 'maintenanceEvidence'
           AND entity_id = ?
           AND status IN ('PENDING','FAILED','BLOCKED','CONFLICT')
           AND operation_kind <> 'MEDIA_UPLOAD'`,
        scopeKey,
        input.evidenceId,
      );

      await transaction.runAsync(
        `UPDATE local_maintenance_evidence
         SET tombstone = 1, sync_status = 'PENDING', local_updated_at = ?
         WHERE scope_key = ? AND evidence_id = ?`,
        new Date().toISOString(),
        scopeKey,
        input.evidenceId,
      );

      const payload = parseJsonObject<EvidenceRecord>(existing.payload_json);
      const queued = await enqueueOutboxOperationTx(transaction, {
        scopeKey,
        operationKind: 'DELETE',
        route: 'maintenance.images.delete',
        entityType: 'maintenanceEvidence',
        entityId: input.evidenceId,
        aggregateId: input.maintenanceId,
        payload: {
          maintenanceId: input.maintenanceId,
          MantenimientoID: input.maintenanceId,
          deviceId: input.deviceId,
          DispositivoMantenimientoRef: input.deviceId,
          imageId: input.evidenceId,
          FotoDispositivoID: input.evidenceId,
          __syncBase: payload.__syncBase,
        },
        priority: 80,
        dependsOnOperationId: inFlight?.operation_id || '',
      });
      operationId = queued.operationId;
    }

    await refreshDetailCountsTx(transaction, scopeKey, input.maintenanceId);
  });

  return {
    evidenceId: input.evidenceId,
    operationId,
    discardLocalUri,
  };
}

export async function markEvidenceDeleteConfirmed(
  db: SQLiteDatabase,
  scopeKey: string,
  evidenceId: string,
) {
  const row = await db.getFirstAsync<{
    local_file_id: string;
    local_uri: string;
  }>(
    `SELECT
       e.local_file_id,
       COALESCE(f.local_uri, '') AS local_uri
     FROM local_maintenance_evidence e
     LEFT JOIN local_files f
       ON f.scope_key = e.scope_key AND f.file_id = e.local_file_id
     WHERE e.scope_key = ? AND e.evidence_id = ?`,
    scopeKey,
    evidenceId,
  );

  await db.runAsync(
    `UPDATE local_maintenance_evidence
     SET tombstone = 1, sync_status = 'SYNCED', last_synced_at = ?,
         local_updated_at = ?
     WHERE scope_key = ? AND evidence_id = ?`,
    new Date().toISOString(),
    new Date().toISOString(),
    scopeKey,
    evidenceId,
  );

  if (row?.local_file_id) {
    await deleteLocalFileRecord(db, scopeKey, row.local_file_id);
  }

  return row?.local_uri || '';
}

export async function listLocalEvidence(
  db: SQLiteDatabase,
  scopeKey: string,
  deviceId: string,
) {
  const rows = await db.getAllAsync<{
    payload_json: string;
    sync_status: string;
    local_uri: string;
    local_file_id: string;
  }>(
    `SELECT
       e.payload_json,
       e.sync_status,
       e.local_file_id,
       COALESCE(f.local_uri, '') AS local_uri
     FROM local_maintenance_evidence e
     LEFT JOIN local_files f
       ON f.scope_key = e.scope_key AND f.file_id = e.local_file_id
     WHERE e.scope_key = ? AND e.device_id = ? AND e.tombstone = 0
     ORDER BY e.captured_at DESC, e.local_updated_at DESC`,
    scopeKey,
    deviceId,
  );

  return rows.map((row) => ({
    ...parseJsonObject<EvidenceRecord>(row.payload_json),
    __local: {
      syncStatus: row.sync_status,
      localUri: row.local_uri,
      localFileId: row.local_file_id,
    },
  }));
}
