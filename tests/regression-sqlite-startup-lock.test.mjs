import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const database = await readFile(
  new URL('../src/db/database.ts', import.meta.url),
  'utf8',
);
const background = await readFile(
  new URL('../src/sync/backgroundSyncTask.ts', import.meta.url),
  'utf8',
);

test('SQLiteProvider no intenta cambiar WAL antes de instalar busy_timeout', () => {
  const busy = database.indexOf('PRAGMA busy_timeout');
  const readMode = database.indexOf('PRAGMA journal_mode;');
  const writeMode = database.indexOf('PRAGMA journal_mode = WAL');

  assert.ok(busy >= 0);
  assert.ok(readMode > busy);
  assert.ok(writeMode > readMode);
  assert.match(database, /if \(currentMode !== 'wal'\)/);
});

test('locks transitorios de SQLite tienen retry acotado y no esconden otros errores', () => {
  assert.match(database, /INITIALIZATION_RETRY_DELAYS_MS = \[0, 120, 300, 700, 1_200\]/);
  assert.match(database, /database\(\?: table\)\? is locked\|SQLITE_BUSY\|SQLITE_LOCKED/);
  assert.match(database, /if \(!isDatabaseLockedError\(error\) \|\| attempt === delays\.length - 1\)/);
  assert.match(database, /throw error/);
});

test('migraciones revalidan versión dentro de la transacción exclusiva', () => {
  const transaction = database.indexOf('withExclusiveTransactionAsync');
  const recheck = database.indexOf('SELECT version FROM schema_migrations WHERE version = ?');
  const insert = database.indexOf('INSERT INTO schema_migrations', recheck);

  assert.ok(transaction >= 0);
  assert.ok(recheck > transaction);
  assert.ok(insert > recheck);
});

test('housekeeping bloqueado no impide abrir y background cede al foreground activo', () => {
  assert.match(database, /optimize es housekeeping opcional/);
  assert.match(database, /if \(!isDatabaseLockedError\(error\)\) throw error/);
  assert.match(background, /AppState\.currentState === 'active'/);
  const activeGuard = background.indexOf("AppState.currentState === 'active'");
  const open = background.indexOf('SQLite.openDatabaseAsync');
  assert.ok(activeGuard >= 0);
  assert.ok(open > activeGuard);
});
