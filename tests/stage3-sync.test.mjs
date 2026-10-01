import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
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

test('Etapa 3 mantiene el motor desacoplado de los triggers de plataforma', () => {
  assert.match(coordinator, /runSyncCycle/);
  assert.doesNotMatch(coordinator, /TaskManager\.defineTask|AppState\.addEventListener|addNetworkStateListener/);
});
