import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const coordinator = await readFile(new URL('../src/sync/SyncCoordinator.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../src/sync/SyncProvider.tsx', import.meta.url), 'utf8');
const registry = await readFile(new URL('../src/sync/resourceRegistry.ts', import.meta.url), 'utf8');
const pull = await readFile(new URL('../src/sync/syncPull.ts', import.meta.url), 'utf8');

test('SyncCoordinator conserva PULL -> reconciliación -> PUSH -> PULL final', () => {
  const pullIndex = coordinator.indexOf("'pull'");
  const reconcileIndex = coordinator.indexOf("'reconcile'");
  const pushIndex = coordinator.indexOf("'push'");
  const finalPullIndex = coordinator.indexOf("'final-pull'");
  assert.ok(pullIndex >= 0);
  assert.ok(reconcileIndex > pullIndex);
  assert.ok(pushIndex > reconcileIndex);
  assert.ok(finalPullIndex > pushIndex);
});

test('sincronización manual usa el mismo coordinador y no aplica restricción horaria', () => {
  assert.match(provider, /trigger:\s*'manual'/);
  assert.match(coordinator, /input\.trigger !== 'manual'/);
});

test('cliente incremental usa schema 2 y contrato sync.delta existente', () => {
  assert.match(registry, /CLIENT_SYNC_SCHEMA_VERSION = 2/);
  assert.match(pull, /'sync\.delta'/);
  assert.match(pull, /generation:/);
  assert.match(pull, /cacheScope:/);
  assert.match(pull, /schemaVersion:/);
});

async function filesUnder(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...await filesUnder(full));
    else results.push(full);
  }
  return results;
}

test('Etapa 3 todavía no registra BackgroundTask', async () => {
  const src = path.resolve(new URL('../src/', import.meta.url).pathname);
  const files = await filesUnder(src);
  for (const file of files.filter((item) => /\.(ts|tsx)$/.test(item))) {
    const content = await readFile(file, 'utf8');
    assert.doesNotMatch(content, /expo-background-task|TaskManager\.defineTask/);
  }
});
