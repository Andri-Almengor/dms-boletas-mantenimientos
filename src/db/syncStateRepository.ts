import type { SQLiteDatabase } from 'expo-sqlite';

export type SyncState = {
  scope_key: string;
  resource: string;
  cursor: number;
  generation: string;
  schema_version: number;
  cache_scope: string;
  full_snapshot_required: number;
  last_pull_at: string;
  last_push_at: string;
  last_success_at: string;
  last_error_code: string;
  last_error_message: string;
  updated_at: string;
};

export async function getSyncState(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
) {
  return db.getFirstAsync<SyncState>(
    'SELECT * FROM sync_state WHERE scope_key = ? AND resource = ?',
    scopeKey,
    resource,
  );
}

export async function ensureSyncState(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
) {
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_state (
       scope_key, resource, cursor, generation, schema_version,
       cache_scope, full_snapshot_required, updated_at
     ) VALUES (?, ?, 0, '', 0, '', 1, ?)
     ON CONFLICT(scope_key, resource) DO NOTHING`,
    scopeKey,
    resource,
    now,
  );
  return getSyncState(db, scopeKey, resource);
}

export async function saveSyncCursor(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    resource: string;
    cursor: number;
    generation: string;
    schemaVersion: number;
    cacheScope?: string;
    fullSnapshotRequired?: boolean;
    pulledAt?: string;
  },
) {
  const now = input.pulledAt || new Date().toISOString();
  await db.runAsync(
    `INSERT INTO sync_state (
       scope_key, resource, cursor, generation, schema_version, cache_scope,
       full_snapshot_required, last_pull_at, last_success_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(scope_key, resource) DO UPDATE SET
       cursor = excluded.cursor,
       generation = excluded.generation,
       schema_version = excluded.schema_version,
       cache_scope = excluded.cache_scope,
       full_snapshot_required = excluded.full_snapshot_required,
       last_pull_at = excluded.last_pull_at,
       last_success_at = excluded.last_success_at,
       last_error_code = '',
       last_error_message = '',
       updated_at = excluded.updated_at`,
    input.scopeKey,
    input.resource,
    Number(input.cursor || 0),
    input.generation,
    Number(input.schemaVersion || 0),
    String(input.cacheScope || ''),
    input.fullSnapshotRequired ? 1 : 0,
    now,
    now,
    now,
  );
}

export async function markSyncPushSuccess(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
) {
  const now = new Date().toISOString();
  await ensureSyncState(db, scopeKey, resource);
  await db.runAsync(
    `UPDATE sync_state
     SET last_push_at = ?, last_success_at = ?,
         last_error_code = '', last_error_message = '', updated_at = ?
     WHERE scope_key = ? AND resource = ?`,
    now,
    now,
    now,
    scopeKey,
    resource,
  );
}

export async function markSyncError(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
  error: { code?: string; message?: string } = {},
) {
  await ensureSyncState(db, scopeKey, resource);
  await db.runAsync(
    `UPDATE sync_state
     SET last_error_code = ?, last_error_message = ?, updated_at = ?
     WHERE scope_key = ? AND resource = ?`,
    String(error.code || ''),
    String(error.message || ''),
    new Date().toISOString(),
    scopeKey,
    resource,
  );
}

export async function requireFullSnapshot(
  db: SQLiteDatabase,
  scopeKey: string,
  resource: string,
) {
  await ensureSyncState(db, scopeKey, resource);
  await db.runAsync(
    `UPDATE sync_state
     SET full_snapshot_required = 1, updated_at = ?
     WHERE scope_key = ? AND resource = ?`,
    new Date().toISOString(),
    scopeKey,
    resource,
  );
}
