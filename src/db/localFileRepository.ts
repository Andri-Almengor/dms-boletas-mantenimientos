import type { SQLiteDatabase } from 'expo-sqlite';
import { createLocalId } from '@/utils/localId';

export type LocalFileInput = {
  fileId?: string;
  scopeKey: string;
  ownerType: string;
  ownerId: string;
  localUri: string;
  fileName?: string;
  mimeType?: string;
  fileSize?: number;
  sha256?: string;
};

export async function registerLocalFile(
  db: SQLiteDatabase,
  input: LocalFileInput,
) {
  const fileId = input.fileId || createLocalId('file');
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO local_files (
       file_id, scope_key, owner_type, owner_id, local_uri, file_name,
       mime_type, file_size, sha256, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET
       local_uri = excluded.local_uri,
       file_name = excluded.file_name,
       mime_type = excluded.mime_type,
       file_size = excluded.file_size,
       sha256 = excluded.sha256,
       updated_at = excluded.updated_at`,
    fileId,
    input.scopeKey,
    input.ownerType,
    input.ownerId,
    input.localUri,
    String(input.fileName || ''),
    String(input.mimeType || ''),
    Number(input.fileSize || 0),
    String(input.sha256 || ''),
    now,
    now,
  );

  return fileId;
}

export async function getLocalFile(
  db: SQLiteDatabase,
  scopeKey: string,
  fileId: string,
) {
  return db.getFirstAsync<{
    file_id: string;
    local_uri: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    sha256: string;
  }>(
    `SELECT file_id, local_uri, file_name, mime_type, file_size, sha256
     FROM local_files
     WHERE scope_key = ? AND file_id = ?`,
    scopeKey,
    fileId,
  );
}


export async function getLocalFileByOwner(
  db: SQLiteDatabase,
  scopeKey: string,
  ownerType: string,
  ownerId: string,
) {
  return db.getFirstAsync<{
    file_id: string;
    local_uri: string;
    file_name: string;
    mime_type: string;
    file_size: number;
    sha256: string;
  }>(
    `SELECT file_id, local_uri, file_name, mime_type, file_size, sha256
     FROM local_files
     WHERE scope_key = ? AND owner_type = ? AND owner_id = ?
     ORDER BY updated_at DESC
     LIMIT 1`,
    scopeKey,
    ownerType,
    ownerId,
  );
}

export async function deleteLocalFileRecord(
  db: SQLiteDatabase,
  scopeKey: string,
  fileId: string,
) {
  const existing = await getLocalFile(db, scopeKey, fileId);
  if (!existing) return null;
  await db.runAsync(
    `DELETE FROM local_files
     WHERE scope_key = ? AND file_id = ?`,
    scopeKey,
    fileId,
  );
  return existing;
}
