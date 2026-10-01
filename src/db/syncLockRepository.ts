import type { SQLiteDatabase } from 'expo-sqlite';
import { createLocalId } from '@/utils/localId';

const LOCK_NAME = 'global-sync';
const DEFAULT_LEASE_MS = 5 * 60 * 1000;

export type SyncLease = {
  ownerId: string;
  expiresAt: number;
};

export async function acquireSyncLease(
  db: SQLiteDatabase,
  leaseMs = DEFAULT_LEASE_MS,
): Promise<SyncLease | null> {
  const ownerId = createLocalId('sync');
  const now = Date.now();
  const expiresAt = now + Math.max(30_000, Number(leaseMs || DEFAULT_LEASE_MS));
  let acquired = false;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'DELETE FROM sync_runtime_lock WHERE lock_name = ? AND expires_at <= ?',
      LOCK_NAME,
      now,
    );
    await transaction.runAsync(
      `INSERT OR IGNORE INTO sync_runtime_lock
       (lock_name, owner_id, acquired_at, expires_at)
       VALUES (?, ?, ?, ?)`,
      LOCK_NAME,
      ownerId,
      now,
      expiresAt,
    );
    const row = await transaction.getFirstAsync<{ owner_id: string }>(
      'SELECT owner_id FROM sync_runtime_lock WHERE lock_name = ?',
      LOCK_NAME,
    );
    acquired = row?.owner_id === ownerId;
  });

  return acquired ? { ownerId, expiresAt } : null;
}

export async function renewSyncLease(
  db: SQLiteDatabase,
  ownerId: string,
  leaseMs = DEFAULT_LEASE_MS,
) {
  const expiresAt = Date.now() + Math.max(30_000, Number(leaseMs || DEFAULT_LEASE_MS));
  const result = await db.runAsync(
    `UPDATE sync_runtime_lock
     SET expires_at = ?
     WHERE lock_name = ? AND owner_id = ?`,
    expiresAt,
    LOCK_NAME,
    ownerId,
  );
  if (result.changes !== 1) {
    const error = new Error('La exclusión de sincronización expiró.');
    (error as Error & { code?: string }).code = 'SYNC_LOCK_LOST';
    throw error;
  }
  return expiresAt;
}

export async function releaseSyncLease(
  db: SQLiteDatabase,
  ownerId: string,
) {
  await db.runAsync(
    'DELETE FROM sync_runtime_lock WHERE lock_name = ? AND owner_id = ?',
    LOCK_NAME,
    ownerId,
  );
}
