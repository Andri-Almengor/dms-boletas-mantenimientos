import type { SQLiteDatabase } from 'expo-sqlite';
import {
  LOCAL_MIGRATIONS,
  LOCAL_SCHEMA_VERSION,
} from '@/db/schema';

export const DATABASE_NAME = 'dms-boletas-mantenimientos.db';

const SQLITE_BUSY_TIMEOUT_MS = 5_000;
const INITIALIZATION_RETRY_DELAYS_MS = [0, 120, 300, 700, 1_200];

function databaseErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error ?? '');
}

export function isDatabaseLockedError(error: unknown) {
  return /database(?: table)? is locked|SQLITE_BUSY|SQLITE_LOCKED/i.test(
    databaseErrorMessage(error),
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds));
  });
}

export async function withDatabaseLockRetry<T>(
  operation: () => Promise<T>,
  delays = INITIALIZATION_RETRY_DELAYS_MS,
) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (attempt > 0) await wait(delays[attempt]);

    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isDatabaseLockedError(error) || attempt === delays.length - 1) {
        throw error;
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('No se pudo inicializar SQLite.');
}

async function configureConnection(db: SQLiteDatabase) {
  // busy_timeout debe quedar activo antes de cualquier PRAGMA que pueda
  // necesitar cambiar estado del archivo compartido. En Android puede existir
  // otra conexión del BackgroundTask mientras el proceso foreground arranca.
  await db.execAsync(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS};`);
  await db.execAsync('PRAGMA foreign_keys = ON;');

  // WAL persiste en el archivo. Evitar escribir journal_mode en cada apertura
  // reduce una contención innecesaria entre SQLiteProvider y BackgroundTask.
  const row = await withDatabaseLockRetry(
    () => db.getFirstAsync<{ journal_mode?: string }>('PRAGMA journal_mode;'),
  );
  const currentMode = String(row?.journal_mode || '').trim().toLowerCase();

  if (currentMode !== 'wal') {
    await withDatabaseLockRetry(
      () => db.execAsync('PRAGMA journal_mode = WAL;'),
    );
  }
}

async function ensureMigrationTable(db: SQLiteDatabase) {
  await withDatabaseLockRetry(() => db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `));
}

async function currentSchemaVersion(db: SQLiteDatabase) {
  const row = await withDatabaseLockRetry(
    () => db.getFirstAsync<{ version: number }>(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    ),
  );
  return Number(row?.version || 0);
}

async function runMigration(
  db: SQLiteDatabase,
  migration: (typeof LOCAL_MIGRATIONS)[number],
) {
  await withDatabaseLockRetry(async () => {
    await db.withExclusiveTransactionAsync(async (transaction) => {
      // Dos runtimes pueden haber leído la misma versión antes de que uno
      // consiga el write lock. Revalidar dentro de la transacción evita
      // ejecutar/registrar dos veces la misma migración.
      const alreadyApplied = await transaction.getFirstAsync<{ version: number }>(
        'SELECT version FROM schema_migrations WHERE version = ? LIMIT 1',
        migration.version,
      );
      if (alreadyApplied) return;

      await transaction.execAsync(migration.sql);
      await transaction.runAsync(
        'INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)',
        migration.version,
        new Date().toISOString(),
      );
    });
  });
}

async function optimizeDatabase(db: SQLiteDatabase) {
  try {
    await withDatabaseLockRetry(
      () => db.execAsync('PRAGMA optimize;'),
      [0, 120],
    );
  } catch (error) {
    // optimize es housekeeping opcional. Un lock transitorio nunca debe
    // impedir que la aplicación abra; cualquier otro error sí se propaga.
    if (!isDatabaseLockedError(error)) throw error;
  }
}

export async function initializeDatabase(db: SQLiteDatabase) {
  await configureConnection(db);
  await ensureMigrationTable(db);

  let current = await currentSchemaVersion(db);

  for (const migration of LOCAL_MIGRATIONS) {
    if (migration.version <= current) continue;

    await runMigration(db, migration);
    current = await currentSchemaVersion(db);
  }

  if (current !== LOCAL_SCHEMA_VERSION) {
    throw new Error(
      `Esquema SQLite inesperado: ${current}. Esperado: ${LOCAL_SCHEMA_VERSION}.`,
    );
  }

  // Mantiene estadísticas/índices de SQLite sin VACUUM ni bloqueos prolongados.
  await optimizeDatabase(db);
}
