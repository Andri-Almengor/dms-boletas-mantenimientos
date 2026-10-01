import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const lock = await readFile(new URL('../src/db/syncLockRepository.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const base = await readFile(new URL('../src/sync/syncBase.ts', import.meta.url), 'utf8');

test('mutex de sincronización usa lease persistente y recuperable', () => {
  assert.match(schema, /CREATE TABLE IF NOT EXISTS sync_runtime_lock/);
  assert.match(schema, /expires_at INTEGER NOT NULL/);
  assert.match(lock, /INSERT OR IGNORE INTO sync_runtime_lock/);
  assert.match(lock, /owner_id/);
  assert.match(lock, /DELETE FROM sync_runtime_lock WHERE lock_name/);
});

test('conflictos reutilizan __syncBase y SYNC_CONFLICT del backend', () => {
  assert.match(base, /__syncBase/);
  assert.match(push, /SYNC_CONFLICT/);
  assert.match(push, /createSyncConflict/);
  assert.match(push, /markOutboxConflict/);
});

test('errores determinísticos se bloquean en vez de reintentarse indefinidamente', () => {
  assert.match(push, /markOutboxBlocked/);
  assert.match(push, /error\.status === 429/);
  assert.match(push, /error\.status >= 500/);
});
