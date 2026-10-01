import { actionRequest } from '@/api/actionClient';
import { appConfig } from '@/config/appConfig';
import {
  attachLocalFileToEvidence,
  getLocalEvidence,
} from '@/db/evidenceRepository';
import {
  deleteLocalFileRecord,
  getLocalFile,
  registerLocalFile,
} from '@/db/localFileRepository';
import { createLocalId } from '@/utils/localId';
import {
  evidenceFileExtension,
  validatePickedEvidenceAsset,
} from '@/features/maintenance/maintenanceEvidence';
import type { ImagePickerAsset } from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { SQLiteDatabase } from 'expo-sqlite';

const STORAGE_SAFETY_BYTES = 5 * 1024 * 1024;

type MediaGetResponse = {
  streamUrl?: string;
  dataUrl?: string;
  DataURL?: string;
  url?: string;
  mimeType?: string;
  MimeType?: string;
};

function rootDirectory() {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error('El dispositivo no permite almacenamiento persistente para evidencias.');
  }
  return `${root}dms-maintenance-evidence/`;
}

function safeSegment(value: unknown, fallback = 'archivo') {
  const clean = String(value || '')
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
  return clean || fallback;
}

async function ensureDirectory(uri: string) {
  await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
}

async function assertStorageCapacity(requiredBytes: number) {
  const bytes = Math.max(0, Number(requiredBytes || 0));
  const free = await FileSystem.getFreeDiskStorageAsync().catch(() => 0);
  if (free > 0 && free < bytes + STORAGE_SAFETY_BYTES) {
    const error = new Error(
      'No hay suficiente espacio disponible para guardar esta evidencia sin conexión.',
    );
    (error as Error & { code?: string }).code = 'OFFLINE_STORAGE_FULL';
    throw error;
  }
}

async function fileInfo(uri: string) {
  const info = await FileSystem.getInfoAsync(uri, { md5: false });
  if (!info.exists) {
    throw new Error('No se pudo conservar el archivo de evidencia en el dispositivo.');
  }
  return info;
}

function mediaUrl(relativeOrAbsolute: string) {
  if (/^https?:\/\//i.test(relativeOrAbsolute)) return relativeOrAbsolute;
  return new URL(relativeOrAbsolute, appConfig.apiUrl).toString();
}

function dataUrlParts(value: string) {
  const match = value.match(/^data:([^;,]+)?;base64,(.+)$/s);
  if (!match) return null;
  return {
    mimeType: match[1] || 'application/octet-stream',
    base64: match[2],
  };
}

export async function persistLocalMaintenanceImageFile(
  input: {
    ownerId: string;
    sourceUri: string;
    fileName: string;
    mimeType: string;
    size?: number;
    folder?: string;
  },
) {
  await assertStorageCapacity(Number(input.size || 0));
  const folder = safeSegment(input.folder || 'local', 'local');
  const root = `${rootDirectory()}${folder}/`;
  await ensureDirectory(root);
  const extension = evidenceFileExtension(
    input.mimeType,
    input.fileName,
  );
  const unique = safeSegment(createLocalId('asset'), 'asset');
  const destination = `${root}${safeSegment(input.ownerId)}-${unique}.${extension}`;

  await FileSystem.copyAsync({
    from: input.sourceUri,
    to: destination,
  });

  const info = await fileInfo(destination);
  const size = Math.max(
    Number(input.size || 0),
    Number('size' in info ? info.size || 0 : 0),
  );
  await assertStorageCapacity(0);

  return {
    localUri: destination,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size,
  };
}

export async function persistBase64MaintenanceImageFile(
  input: {
    ownerId: string;
    base64: string;
    fileName: string;
    mimeType: string;
    folder?: string;
  },
) {
  const base64 = String(input.base64 || '')
    .replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, '')
    .replace(/\s+/g, '');
  if (!base64) throw new Error('No se recibió contenido para guardar la imagen.');

  const estimatedBytes = Math.floor(base64.length * 0.75);
  await assertStorageCapacity(estimatedBytes);

  const folder = safeSegment(input.folder || 'local', 'local');
  const root = `${rootDirectory()}${folder}/`;
  await ensureDirectory(root);
  const extension = evidenceFileExtension(
    input.mimeType,
    input.fileName,
  );
  const unique = safeSegment(createLocalId('asset'), 'asset');
  const destination = `${root}${safeSegment(input.ownerId)}-${unique}.${extension}`;

  await FileSystem.writeAsStringAsync(
    destination,
    base64,
    { encoding: FileSystem.EncodingType.Base64 },
  );

  const info = await fileInfo(destination);
  const size = Number('size' in info ? info.size || 0 : 0);
  return {
    localUri: destination,
    fileName: input.fileName,
    mimeType: input.mimeType,
    size,
  };
}

export async function persistPickedEvidenceAsset(
  input: {
    evidenceId: string;
    asset: ImagePickerAsset;
  },
) {
  const metadata = validatePickedEvidenceAsset(input.asset);
  const stored = await persistLocalMaintenanceImageFile({
    ownerId: input.evidenceId,
    sourceUri: input.asset.uri,
    fileName: metadata.fileName,
    mimeType: metadata.mimeType,
    size: metadata.size,
    folder: 'local',
  });

  const localFileId = createLocalId('file');

  return {
    localFileId,
    localUri: stored.localUri,
    metadata: {
      ...metadata,
      size: stored.size,
    },
  };
}

export async function cacheRemoteEvidence(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    evidenceId: string;
    sessionToken: string;
  },
) {
  const local = await getLocalEvidence(
    db,
    input.scopeKey,
    input.evidenceId,
  );
  if (!local) throw new Error('La evidencia no existe en SQLite.');

  if (local.localFileId) {
    const existingFile = await getLocalFile(
      db,
      input.scopeKey,
      local.localFileId,
    );
    if (existingFile?.local_uri) {
      const info = await FileSystem.getInfoAsync(existingFile.local_uri)
        .catch(() => ({ exists: false } as const));
      if (info.exists) return existingFile.local_uri;
    }
  }

  const media = await actionRequest<MediaGetResponse>(
    'maintenance.media.get',
    {
      imageId: input.evidenceId,
      FotoDispositivoID: input.evidenceId,
    },
    input.sessionToken,
  );

  const mimeType = String(
    media.mimeType
      || media.MimeType
      || local.record.MimeType
      || local.record.mimeType
      || 'image/jpeg',
  );
  const fileName = String(
    local.record.Nombre
      || local.record.fileName
      || `evidencia-${input.evidenceId}`,
  );
  const extension = evidenceFileExtension(mimeType, fileName);
  const root = `${rootDirectory()}cache/`;
  await ensureDirectory(root);
  const destination = `${root}${safeSegment(input.evidenceId)}.${extension}`;

  const streamUrl = String(media.streamUrl || media.url || '');
  if (streamUrl) {
    await FileSystem.downloadAsync(
      mediaUrl(streamUrl),
      destination,
    );
  } else {
    const dataUrl = String(media.dataUrl || media.DataURL || '');
    const parsed = dataUrlParts(dataUrl);
    if (!parsed) {
      throw new Error('El servidor no devolvió contenido seguro para la evidencia.');
    }
    await FileSystem.writeAsStringAsync(
      destination,
      parsed.base64,
      { encoding: FileSystem.EncodingType.Base64 },
    );
  }

  const info = await fileInfo(destination);
  const size = Number('size' in info ? info.size || 0 : 0);
  await assertStorageCapacity(0);

  let localFileId = '';
  try {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      localFileId = await registerLocalFile(transaction, {
        scopeKey: input.scopeKey,
        ownerType: 'maintenanceEvidenceCache',
        ownerId: input.evidenceId,
        localUri: destination,
        fileName,
        mimeType,
        fileSize: size,
      });
      await attachLocalFileToEvidence(
        transaction,
        input.scopeKey,
        input.evidenceId,
        localFileId,
      );
    });
  } catch (error) {
    await removeLocalEvidenceFile(destination);
    throw error;
  }

  return destination;
}

export async function removeLocalMaintenanceFile(uri: string) {
  const clean = String(uri || '').trim();
  if (!clean) return;
  await FileSystem.deleteAsync(clean, { idempotent: true }).catch(() => undefined);
}

export async function removeLocalEvidenceFile(uri: string) {
  return removeLocalMaintenanceFile(uri);
}


export async function discardRegisteredEvidenceFile(
  db: SQLiteDatabase,
  scopeKey: string,
  localFileId: string,
  uri: string,
) {
  if (localFileId) {
    await deleteLocalFileRecord(
      db,
      scopeKey,
      localFileId,
    ).catch(() => null);
  }
  await removeLocalEvidenceFile(uri);
}
