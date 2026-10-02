import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const policy = await readFile(new URL('../src/sync/syncPolicy.ts', import.meta.url), 'utf8');
const provider = await readFile(new URL('../src/sync/SyncProvider.tsx', import.meta.url), 'utf8');
const background = await readFile(new URL('../src/sync/backgroundSyncTask.ts', import.meta.url), 'utf8');
const events = await readFile(new URL('../src/sync/syncEvents.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/db/outboxRepository.ts', import.meta.url), 'utf8');
const coordinator = await readFile(new URL('../src/sync/SyncCoordinator.ts', import.meta.url), 'utf8');
const pull = await readFile(new URL('../src/sync/syncPull.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const layout = await readFile(new URL('../src/app/_layout.tsx', import.meta.url), 'utf8');

test('Etapa 8 instala BackgroundTask y TaskManager para Expo 57', () => {
  assert.equal(pkg.dependencies['expo-background-task'], '~57.0.16');
  assert.equal(pkg.dependencies['expo-task-manager'], '~57.0.21');
  assert.match(background, /BackgroundTask\.registerTaskAsync/);
  assert.match(background, /TaskManager\.defineTask/);
});

test('política central conserva AUTO 07-17 y MANUAL 24\/7', () => {
  assert.match(policy, /isAutomaticSyncWindow/);
  assert.match(policy, /trigger === 'manual' \|\| isAutomaticSyncWindow/);
  assert.match(provider, /trigger: 'manual'/);
  assert.match(coordinator, /input\.trigger !== 'manual'/);
});

test('apertura, foreground, recuperación de red y cambios locales reutilizan SyncCoordinator', () => {
  assert.match(provider, /runAutomaticSync\('foreground'\)/);
  assert.match(provider, /AppState\.addEventListener\('change'/);
  assert.match(provider, /Network\.addNetworkStateListener/);
  assert.match(provider, /runAutomaticSync\('network'\)/);
  assert.match(provider, /subscribeLocalSyncNeeded/);
  assert.match(provider, /runAutomaticSync\('local-change'\)/);
  assert.match(provider, /runSyncCycle\(db/);
  assert.doesNotMatch(outbox, /actionRequest\(|fetch\(/);
});

test('cambios locales solo emiten señal y no ejecutan red en repositorios', () => {
  assert.match(outbox, /emitLocalSyncNeeded\(\)/);
  assert.match(events, /setTimeout/);
  assert.match(events, /SyncProvider decide/);
  assert.doesNotMatch(events, /actionRequest\(|fetch\(|runSyncCycle/);
});

test('fuera de horario un trigger automático se detiene antes de consultar red', () => {
  const policyCheck = provider.indexOf("if (!isSyncAllowed(trigger))");
  const networkCheck = provider.indexOf("await networkAvailable()");
  assert.ok(policyCheck >= 0);
  assert.ok(networkCheck > policyCheck);
  assert.match(background, /if \(!isSyncAllowed\('background'\)\)/);
});

test('al llegar las 17 no se inicia otra unidad automática', () => {
  assert.match(coordinator, /const shouldContinue = \(\) => input\.trigger === 'manual'/);
  assert.match(pull, /assertNetworkUnitAllowed\(shouldContinue\)/);
  assert.match(push, /if \(input\.shouldContinue && !input\.shouldContinue\(\)\)/);
});

test('sync.delta y snapshots vuelven a comprobar horario antes de cada nueva solicitud', () => {
  assert.match(pull, /prepareNetworkUnit[\s\S]*assertNetworkUnitAllowed\(shouldContinue\)/);
  assert.match(pull, /for \(let page = 1; page <= 100; page \+= 1\) \{\s*await prepareNetworkUnit\(shouldContinue, keepLeaseAlive\)/);
  assert.match(pull, /for \(let page = 0; page < 20; page \+= 1\) \{\s*await prepareNetworkUnit\(shouldContinue, keepLeaseAlive\)/);
  assert.match(pull, /input\.shouldContinue,\s*input\.keepLeaseAlive/);
});

test('una operación de outbox ya iniciada puede completar su unidad atómica', () => {
  const guard = push.indexOf('if (input.shouldContinue && !input.shouldContinue())');
  const execute = push.indexOf('const result = await executeOperation(', guard);
  assert.ok(guard >= 0);
  assert.ok(execute > guard);
  const nextGuard = push.indexOf('if (input.shouldContinue && !input.shouldContinue())', execute + 1);
  assert.equal(nextGuard, -1);
});

test('BackgroundTask abre la misma SQLite, sesión y scope, y usa el mismo ciclo', () => {
  assert.match(background, /AppState\.currentState === 'active'/);
  assert.match(background, /DATABASE_NAME/);
  assert.match(background, /readStoredSession/);
  assert.match(background, /buildLocalDataScope/);
  assert.match(background, /initializeDatabase/);
  assert.match(background, /trigger: 'background'/);
  assert.match(background, /runSyncCycle\(db/);
  assert.match(background, /closeAsync/);
});

test('background es apoyo inexacto y no polling agresivo', () => {
  assert.match(background, /BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 60/);
  assert.doesNotMatch(provider, /setInterval\(/);
  assert.match(provider, /millisecondsUntilAutomaticWindowBoundary/);
  assert.match(provider, /setTimeout/);
});

test('registro background degrada sin romper Expo Go o restricciones del SO', () => {
  assert.match(background, /TaskManager\.isAvailableAsync/);
  assert.match(background, /BackgroundTask\.getStatusAsync/);
  assert.match(background, /catch \{/);
  assert.match(layout, /backgroundSyncTask/);
});
