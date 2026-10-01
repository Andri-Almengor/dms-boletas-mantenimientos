import type { SQLiteDatabase } from 'expo-sqlite';

const LOCAL_SCHEMA_VERSION = 1;

/**
 * Etapa 1 crea únicamente la infraestructura local.
 * Las tablas operativas, outbox e índices se agregan en la Etapa 2.
 */
export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync([
    'PRAGMA journal_mode = WAL;',
    'PRAGMA foreign_keys = ON;',
    'CREATE TABLE IF NOT EXISTS schema_migrations (',
    '  version INTEGER PRIMARY KEY NOT NULL,',
    '  applied_at TEXT NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS app_meta (',
    '  key TEXT PRIMARY KEY NOT NULL,',
    '  value TEXT NOT NULL,',
    '  updated_at TEXT NOT NULL',
    ');',
  ].join('\n'));

  const current = await db.getFirstAsync<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );

  if (Number(current?.version || 0) < LOCAL_SCHEMA_VERSION) {
    await db.runAsync(
      'INSERT OR IGNORE INTO schema_migrations (version, applied_at) VALUES (?, ?)',
      LOCAL_SCHEMA_VERSION,
      new Date().toISOString(),
    );
  }
}
