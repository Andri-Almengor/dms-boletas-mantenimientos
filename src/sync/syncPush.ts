import {
  actionRequest,
  ActionApiError,
  isAuthenticationError,
} from '@/api/actionClient';
import { createSyncConflict } from '@/db/conflictRepository';
import { upsertRemoteDevice } from '@/db/deviceRepository';
import { upsertRemoteEvidence } from '@/db/evidenceRepository';
import { getLocalFile } from '@/db/localFileRepository';
import { upsertRemoteMaintenance } from '@/db/maintenanceRepository';
import {
  hasUnresolvedEntityOperations,
  listReadyOutboxOperations,
  markOutboxBlocked,
  markOutboxConflict,
  markOutboxFailed,
  markOutboxInFlight,
  markOutboxSucceeded,
  OutboxRow,
} from '@/db/outboxRepository';
import { markSyncPushSuccess } from '@/db/syncStateRepository';
import { parseJsonObject } from '@/db/json';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

type RecordLike = Record<string, unknown>;

function errorInfo(error: unknown) {
  if (error instanceof ActionApiError) {
    return {
      code: error.code,
      message: error.message,
      status: error.status,
      details: error.details,
    };
  }
  if (error instanceof Error) {
    return {
      code: String((error as Error & { code?: string }).code || 'NETWORK_ERROR'),
      message: error.message,
      status: 0,
      details: null,
    };
  }
  return { code: 'UNKNOWN_ERROR', message: 'Error desconocido.', status: 0, details: null };
}

async function payloadForOperation(
  db: SQLiteDatabase,
  scopeKey: string,
  operation: OutboxRow,
) {
  const payload = parseJsonObject<RecordLike>(operation.payload_json);

  if (operation.operation_kind !== 'MEDIA_UPLOAD') return payload;
  if (!operation.local_file_id) {
    const error = new Error('La evidencia local no tiene un archivo asociado.');
    (error as Error & { code?: string }).code = 'LOCAL_FILE_MISSING';
    throw error;
  }

  const file = await getLocalFile(db, scopeKey, operation.local_file_id);
  if (!file?.local_uri) {
    const error = new Error('No se encontró el archivo local de la evidencia.');
    (error as Error & { code?: string }).code = 'LOCAL_FILE_MISSING';
    throw error;
  }

  const base64 = await FileSystem.readAsStringAsync(file.local_uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    ...payload,
    base64,
    mimeType: payload.mimeType || file.mime_type || 'image/jpeg',
    fileName: payload.fileName || file.file_name || 'evidencia.jpg',
  };
}

function resultRecord(operation: OutboxRow, result: unknown) {
  const value = result && typeof result === 'object'
    ? result as RecordLike
    : {};
  if (operation.entity_type === 'maintenance') {
    return (value.mantenimiento || value.maintenance || value) as RecordLike;
  }
  return value;
}

async function completeSuccess(
  db: SQLiteDatabase,
  scopeKey: string,
  operation: OutboxRow,
  result: unknown,
) {
  await db.withExclusiveTransactionAsync(async (transaction) => {
    await markOutboxSucceeded(transaction, operation.operation_id);

    const newerLocalWork = await hasUnresolvedEntityOperations(
      transaction,
      scopeKey,
      operation.entity_type,
      operation.entity_id,
      operation.operation_id,
    );
    if (newerLocalWork) return;

    const record = resultRecord(operation, result);
    if (operation.entity_type === 'maintenance') {
      await upsertRemoteMaintenance(transaction, scopeKey, record);
      return;
    }
    if (operation.entity_type === 'maintenanceDevice') {
      await upsertRemoteDevice(transaction, scopeKey, {
        ...record,
        MantenimientoRef: operation.aggregate_id,
        MantenimientoID: operation.aggregate_id,
        maintenanceId: operation.aggregate_id,
      });
      return;
    }
    if (operation.entity_type === 'maintenanceEvidence') {
      const payload = parseJsonObject<RecordLike>(operation.payload_json);
      const deviceId = String(
        record.DispositivoMantenimientoRef
          || payload.DispositivoMantenimientoRef
          || payload.deviceId
          || '',
      );
      await upsertRemoteEvidence(
        transaction,
        scopeKey,
        operation.aggregate_id,
        deviceId,
        record,
      );
    }
  });
}

function isRetriable(error: unknown) {
  if (!(error instanceof ActionApiError)) return true;
  return error.status === 0
    || error.status === 408
    || error.status === 429
    || error.status >= 500;
}

function abortError() {
  const error = new Error('Sincronización cancelada.');
  error.name = 'AbortError';
  return error;
}

export async function pushOutbox(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    sessionToken: string;
    signal?: AbortSignal;
    onProgress?: (detail: { processed: number; operation: OutboxRow }) => void;
  },
) {
  let processed = 0;
  let succeeded = 0;
  let conflicts = 0;
  let blocked = 0;

  for (let loop = 0; loop < 100; loop += 1) {
    const operations = await listReadyOutboxOperations(db, input.scopeKey, 25);
    if (!operations.length) break;

    for (const operation of operations) {
      if (input.signal?.aborted) throw abortError();
      await markOutboxInFlight(db, operation.operation_id);

      try {
        const payload = await payloadForOperation(db, input.scopeKey, operation);
        const result = await actionRequest<unknown>(
          operation.route,
          payload,
          input.sessionToken,
          { signal: input.signal },
        );
        await completeSuccess(db, input.scopeKey, operation, result);
        succeeded += 1;
      } catch (error) {
        const info = errorInfo(error);

        if (isAuthenticationError(error)) {
          await markOutboxFailed(db, operation.operation_id, info);
          throw error;
        }

        if (error instanceof ActionApiError && error.code === 'SYNC_CONFLICT') {
          const details = (
            error.details && typeof error.details === 'object'
              ? error.details as RecordLike
              : {}
          );
          await createSyncConflict(db, {
            scopeKey: input.scopeKey,
            resource: 'maintenance',
            entityType: operation.entity_type,
            entityId: operation.entity_id,
            aggregateId: operation.aggregate_id,
            localPayload: details.localRecord || parseJsonObject(operation.payload_json),
            remotePayload: details.serverRecord || {},
            basePayload: details.baseRecord || {},
            reason: JSON.stringify(details.conflictFields || ['SYNC_CONFLICT']),
          });
          await markOutboxConflict(db, operation.operation_id, error.message);
          conflicts += 1;
        } else if (isRetriable(error)) {
          const nextAttempt = new Date(Date.now() + 60_000).toISOString();
          await markOutboxFailed(db, operation.operation_id, info, nextAttempt);
          throw error;
        } else {
          await markOutboxBlocked(db, operation.operation_id, info);
          blocked += 1;
        }
      } finally {
        processed += 1;
        input.onProgress?.({ processed, operation });
      }
    }
  }

  await markSyncPushSuccess(db, input.scopeKey, 'maintenance');
  return { processed, succeeded, conflicts, blocked };
}
