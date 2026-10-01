import type { SQLiteDatabase } from 'expo-sqlite';
import {
  LOCAL_MIGRATIONS,
  LOCAL_SCHEMA_VERSION,
} from '@/db/schema';

async function ensureMigrationTable(db: SQLiteDatabase) {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
}

async function currentSchemaVersion(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  return Number(row?.version || 0);
}

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await ensureMigrationTable(db);

  let current = await currentSchemaVersion(db);

  for (const migration of LOCAL_MIGRATIONS) {
    if (migration.version <= current) continue;

    await db.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.execAsync(migration.sql);
      await transaction.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        migration.version,
        new Date().toISOString(),
      );
    });

    current = migration.version;
  }

  if (current !== LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `Esquema SQLite inesperado: ${current}. Esperado: ${LOCAL_SCHEMA_VERSION}.`,
    );
  }
}
