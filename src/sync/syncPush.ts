import {
  actionRequest,
  ActionApiError,
  isAuthenticationError,
} from '@/api/actionClient';
import { createSyncConflict } from '@/db/conflictRepository';
import {
  markDeviceDeleteConfirmed,
  upsertRemoteDevice,
} from '@/db/deviceRepository';
import {
  markEvidenceDeleteConfirmed,
  upsertRemoteEvidence,
} from '@/db/evidenceRepository';
import { getLocalFile } from '@/db/localFileRepository';
import { upsertRemoteMaintenance } from '@/db/maintenanceRepository';
import { remapCreatedEquipmentLocationTx } from '@/db/resourceRepository';
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
import {
  LARGE_EVIDENCE_CHUNK_BYTES,
  LARGE_EVIDENCE_THRESHOLD_BYTES,
} from '@/features/maintenance/maintenanceEvidence';
import { automaticSyncWindowClosedError } from '@/sync/syncPolicy';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

type RecordLike = Record<string, unknown>;

type LargeUploadInit = {
  complete?: boolean;
  evidence?: RecordLike;
  uploadToken?: string;
  chunkBytes?: number;
};

type LargeUploadChunk = {
  complete?: boolean;
  evidence?: RecordLike;
  nextOffset?: number;
};

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
  return {
    code: 'UNKNOWN_ERROR',
    message: 'Error desconocido.',
    status: 0,
    details: null,
  };
}

async function localMediaFile(
  db: SQLiteDatabase,
  scopeKey: string,
  operation: OutboxRow,
) {
  if (!operation.local_file_id) {
    const error = new Error('La evidencia local no tiene un archivo asociado.');
    (error as Error & { code?: string }).code = 'LOCAL_FILE_MISSING';
    throw error;
  }

  const file = await getLocalFile(
    db,
    scopeKey,
    operation.local_file_id,
  );
  if (!file?.local_uri) {
    const error = new Error('No se encontró el archivo local de la evidencia.');
    (error as Error & { code?: string }).code = 'LOCAL_FILE_MISSING';
    throw error;
  }

  const info = await FileSystem.getInfoAsync(file.local_uri).catch(() => null);
  if (!info?.exists) {
    const error = new Error('El archivo de la evidencia ya no existe en el dispositivo.');
    (error as Error & { code?: string }).code = 'LOCAL_FILE_MISSING';
    throw error;
  }

  return {
    ...file,
    file_size: Math.max(
      Number(file.file_size || 0),
      Number('size' in info ? info.size || 0 : 0),
    ),
  };
}

async function uploadSmallEvidence(
  payload: RecordLike,
  file: Awaited<ReturnType<typeof localMediaFile>>,
  sessionToken: string,
  signal?: AbortSignal,
  keepLeaseAlive?: () => Promise<void>,
) {
  const base64 = await FileSystem.readAsStringAsync(file.local_uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await keepLeaseAlive?.();
  return actionRequest<RecordLike>(
    'maintenance.images.upload',
    {
      ...payload,
      base64,
      mimeType: payload.mimeType || payload.MimeType || file.mime_type || 'image/jpeg',
      fileName: payload.fileName || payload.Nombre || file.file_name || 'evidencia.jpg',
      size: Number(payload.size || payload.Size || file.file_size || 0),
    },
    sessionToken,
    { signal },
  );
}

async function uploadLargeEvidence(
  payload: RecordLike,
  file: Awaited<ReturnType<typeof localMediaFile>>,
  sessionToken: string,
  signal?: AbortSignal,
  keepLeaseAlive?: () => Promise<void>,
) {
  const size = Number(payload.size || payload.Size || file.file_size || 0);
  await keepLeaseAlive?.();
  const init = await actionRequest<LargeUploadInit>(
    'maintenance.images.large.init',
    {
      ...payload,
      fileName: payload.fileName || payload.Nombre || file.file_name || 'evidencia',
      mimeType: payload.mimeType || payload.MimeType || file.mime_type || 'application/octet-stream',
      mediaType: payload.mediaType || payload.TipoMedio || 'image',
      durationSeconds: Number(
        payload.durationSeconds
          || payload.DuracionSegundos
          || 0,
      ),
      size,
    },
    sessionToken,
    { signal },
  );

  if (init.complete) return init.evidence || init as unknown as RecordLike;

  const uploadToken = String(init.uploadToken || '');
  if (!uploadToken) {
    throw new Error('El servidor no devolvió una sesión para cargar la evidencia.');
  }

  const chunkBytes = Math.max(
    256 * 1024,
    Number(init.chunkBytes || LARGE_EVIDENCE_CHUNK_BYTES),
  );
  let offset = 0;

  while (offset < size) {
    if (signal?.aborted) {
      const error = new Error('Sincronización cancelada.');
      error.name = 'AbortError';
      throw error;
    }

    const length = Math.min(chunkBytes, size - offset);
    let base64 = await FileSystem.readAsStringAsync(
      file.local_uri,
      {
        encoding: FileSystem.EncodingType.Base64,
        position: offset,
        length,
      },
    );

    try {
      await keepLeaseAlive?.();
      const result = await actionRequest<LargeUploadChunk>(
        'maintenance.images.large.chunk',
        {
          uploadToken,
          offset,
          base64,
        },
        sessionToken,
        { signal },
      );

      if (result.complete) {
        return result.evidence || result as unknown as RecordLike;
      }

      const nextOffset = Number(result.nextOffset);
      if (
        !Number.isSafeInteger(nextOffset)
        || nextOffset <= offset
        || nextOffset > size
      ) {
        throw new Error(
          'El servidor no confirmó el siguiente bloque de la evidencia.',
        );
      }
      offset = nextOffset;
    } finally {
      base64 = '';
    }
  }

  throw new Error(
    'La carga segmentada terminó sin confirmación del servidor.',
  );
}

async function executeOperation(
  db: SQLiteDatabase,
  scopeKey: string,
  operation: OutboxRow,
  sessionToken: string,
  signal?: AbortSignal,
  keepLeaseAlive?: () => Promise<void>,
) {
  const payload = parseJsonObject<RecordLike>(operation.payload_json);

  if (operation.operation_kind !== 'MEDIA_UPLOAD') {
    await keepLeaseAlive?.();
    return actionRequest<unknown>(
      operation.route,
      payload,
      sessionToken,
      { signal },
    );
  }

  const file = await localMediaFile(db, scopeKey, operation);
  const size = Math.max(
    Number(file.file_size || 0),
    Number(payload.size || payload.Size || 0),
  );

  const mediaType = String(
    payload.mediaType
      || payload.TipoMedio
      || '',
  ).toLowerCase();

  if (
    mediaType === 'video'
    || size > LARGE_EVIDENCE_THRESHOLD_BYTES
  ) {
    return uploadLargeEvidence(
      payload,
      file,
      sessionToken,
      signal,
      keepLeaseAlive,
    );
  }

  return uploadSmallEvidence(
    payload,
    file,
    sessionToken,
    signal,
    keepLeaseAlive,
  );
}

function resultRecord(operation: OutboxRow, result: unknown) {
  const value = result && typeof result === 'object'
    ? result as RecordLike
    : {};
  if (operation.entity_type === 'maintenance') {
    return (
      value.mantenimiento
      || value.maintenance
      || value
    ) as RecordLike;
  }
  return value;
}

async function completeSuccess(
  db: SQLiteDatabase,
  scopeKey: string,
  operation: OutboxRow,
  result: unknown,
) {
  let cleanupLocalUri = '';

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await markOutboxSucceeded(transaction, operation.operation_id);

    if (
      operation.operation_kind === 'CREATE'
      && operation.entity_type === 'equipmentLocation'
    ) {
      await remapCreatedEquipmentLocationTx(
        transaction,
        scopeKey,
        operation.entity_id,
        resultRecord(operation, result),
      );
      return;
    }

    const newerLocalWork = await hasUnresolvedEntityOperations(
      transaction,
      scopeKey,
      operation.entity_type,
      operation.entity_id,
      operation.operation_id,
    );
    if (newerLocalWork) return;

    if (
      operation.operation_kind === 'DELETE'
      && operation.entity_type === 'maintenanceDevice'
    ) {
      await markDeviceDeleteConfirmed(
        transaction,
        scopeKey,
        operation.entity_id,
      );
      return;
    }

    if (
      operation.operation_kind === 'DELETE'
      && operation.entity_type === 'maintenanceEvidence'
    ) {
      cleanupLocalUri = await markEvidenceDeleteConfirmed(
        transaction,
        scopeKey,
        operation.entity_id,
      );
      return;
    }

    const record = resultRecord(operation, result);
    if (operation.entity_type === 'maintenance') {
      await upsertRemoteMaintenance(
        transaction,
        scopeKey,
        record,
      );
      return;
    }

    if (operation.entity_type === 'maintenanceDevice') {
      await upsertRemoteDevice(
        transaction,
        scopeKey,
        {
          ...record,
          MantenimientoRef: operation.aggregate_id,
          MantenimientoID: operation.aggregate_id,
          maintenanceId: operation.aggregate_id,
        },
      );
      return;
    }

    if (operation.entity_type === 'maintenanceEvidence') {
      const payload = parseJsonObject<RecordLike>(
        operation.payload_json,
      );
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

  if (cleanupLocalUri) {
    await FileSystem.deleteAsync(
      cleanupLocalUri,
      { idempotent: true },
    ).catch(() => undefined);
  }
}

function isRetriable(error: unknown) {
  if (!(error instanceof ActionApiError)) {
    const code = String(
      (error as Error & { code?: string })?.code || '',
    ).toUpperCase();
    if ([
      'LOCAL_FILE_MISSING',
    ].includes(code)) return false;
    return true;
  }
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
    onProgress?: (
      detail: {
        processed: number;
        operation: OutboxRow;
      },
    ) => void;
    shouldContinue?: () => boolean;
    keepLeaseAlive?: () => Promise<void>;
  },
) {
  let processed = 0;
  let succeeded = 0;
  let conflicts = 0;
  let blocked = 0;

  for (let loop = 0; loop < 100; loop += 1) {
    const operations = await listReadyOutboxOperations(
      db,
      input.scopeKey,
      25,
    );
    if (!operations.length) break;

    for (const operation of operations) {
      if (input.signal?.aborted) throw abortError();
      if (input.shouldContinue && !input.shouldContinue()) {
        throw automaticSyncWindowClosedError();
      }
      await input.keepLeaseAlive?.();
      await markOutboxInFlight(
        db,
        operation.operation_id,
      );

      try {
        const result = await executeOperation(
          db,
          input.scopeKey,
          operation,
          input.sessionToken,
          input.signal,
          input.keepLeaseAlive,
        );
        await input.keepLeaseAlive?.();
        await completeSuccess(
          db,
          input.scopeKey,
          operation,
          result,
        );
        succeeded += 1;
      } catch (error) {
        const info = errorInfo(error);

        // Si otro proceso adquirió el lease, no tocar la operación:
        // el nuevo propietario recuperará IN_FLIGHT antes de procesarla.
        if (info.code === 'SYNC_LOCK_LOST') {
          throw error;
        }

        if (isAuthenticationError(error)) {
          await markOutboxFailed(
            db,
            operation.operation_id,
            info,
          );
          throw error;
        }

        if (
          error instanceof ActionApiError
          && error.code === 'SYNC_CONFLICT'
        ) {
          const details = (
            error.details
            && typeof error.details === 'object'
              ? error.details as RecordLike
              : {}
          );

          await createSyncConflict(db, {
            scopeKey: input.scopeKey,
            resource: 'maintenance',
            entityType: operation.entity_type,
            entityId: operation.entity_id,
            aggregateId: operation.aggregate_id,
            localPayload: details.localRecord
              || parseJsonObject(operation.payload_json),
            remotePayload: details.serverRecord || {},
            basePayload: details.baseRecord || {},
            reason: JSON.stringify(
              details.conflictFields || ['SYNC_CONFLICT'],
            ),
          });
          await markOutboxConflict(
            db,
            operation.operation_id,
            error.message,
          );
          conflicts += 1;
        } else if (isRetriable(error)) {
          const nextAttempt = new Date(
            Date.now() + 60_000,
          ).toISOString();
          await markOutboxFailed(
            db,
            operation.operation_id,
            info,
            nextAttempt,
          );
          throw error;
        } else {
          await markOutboxBlocked(
            db,
            operation.operation_id,
            info,
          );
          blocked += 1;
        }
      } finally {
        processed += 1;
        input.onProgress?.({
          processed,
          operation,
        });
      }
    }
  }

  await markSyncPushSuccess(
    db,
    input.scopeKey,
    'maintenance',
  );

  return {
    processed,
    succeeded,
    conflicts,
    blocked,
  };
}
