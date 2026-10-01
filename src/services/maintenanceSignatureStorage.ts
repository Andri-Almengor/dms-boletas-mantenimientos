import { registerLocalFile } from '@/db/localFileRepository';
import {
  saveLocalMaintenanceSignatureTx,
} from '@/db/maintenanceSignatureRepository';
import {
  normalizeSignatureMimeType,
  SIGNATURE_MAX_BYTES,
  SignatureDraft,
  signatureDrawingPngBase64,
} from '@/features/maintenance/maintenanceSignature';
import {
  persistBase64MaintenanceImageFile,
  persistLocalMaintenanceImageFile,
  removeLocalMaintenanceFile,
} from '@/services/maintenanceEvidenceStorage';
import { createLocalId } from '@/utils/localId';
import type { SQLiteDatabase } from 'expo-sqlite';

export async function persistMaintenanceSignatureDraft(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    maintenanceId: string;
    draft: SignatureDraft;
  },
) {
  const capturedAt = new Date().toISOString();
  let stored: {
    localUri: string;
    fileName: string;
    mimeType: string;
    size: number;
  };

  if (input.draft.kind === 'drawing') {
    const base64 = signatureDrawingPngBase64(input.draft.strokes);
    stored = await persistBase64MaintenanceImageFile({
      ownerId: input.maintenanceId,
      base64,
      fileName: `firma-${input.maintenanceId}.png`,
      mimeType: 'image/png',
      folder: 'signatures',
    });
  } else {
    const mimeType = normalizeSignatureMimeType(
      input.draft.mimeType,
      input.draft.fileName,
    );
    if (Number(input.draft.fileSize || 0) > SIGNATURE_MAX_BYTES) {
      throw new Error('La firma supera el tamaño máximo permitido de 4 MB.');
    }
    stored = await persistLocalMaintenanceImageFile({
      ownerId: input.maintenanceId,
      sourceUri: input.draft.uri,
      fileName: input.draft.fileName || `firma-${input.maintenanceId}`,
      mimeType,
      size: input.draft.fileSize,
      folder: 'signatures',
    });
  }

  if (stored.size > SIGNATURE_MAX_BYTES) {
    await removeLocalMaintenanceFile(stored.localUri);
    throw new Error('La firma supera el tamaño máximo permitido de 4 MB.');
  }

  const localFileId = createLocalId('file');
  let previousLocalUri = '';

  try {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      await registerLocalFile(transaction, {
        fileId: localFileId,
        scopeKey: input.scopeKey,
        ownerType: 'maintenanceSignature',
        ownerId: input.maintenanceId,
        localUri: stored.localUri,
        fileName: stored.fileName,
        mimeType: stored.mimeType,
        fileSize: stored.size,
      });

      const saved = await saveLocalMaintenanceSignatureTx(transaction, {
        scopeKey: input.scopeKey,
        maintenanceId: input.maintenanceId,
        localFileId,
        mimeType: stored.mimeType,
        capturedAt,
      });
      previousLocalUri = saved.previousLocalUri;
    });
  } catch (error) {
    await removeLocalMaintenanceFile(stored.localUri);
    throw error;
  }

  if (previousLocalUri && previousLocalUri !== stored.localUri) {
    await removeLocalMaintenanceFile(previousLocalUri);
  }

  return {
    localFileId,
    localUri: stored.localUri,
    mimeType: stored.mimeType,
    size: stored.size,
    capturedAt,
  };
}
