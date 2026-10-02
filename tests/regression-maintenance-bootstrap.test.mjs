import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const registry = await readFile(
  new URL('../src/sync/resourceRegistry.ts', import.meta.url),
  'utf8',
);
const pull = await readFile(
  new URL('../src/sync/syncPull.ts', import.meta.url),
  'utf8',
);
const backendPatchReference = `
maintenanceHandlers.list = async ({ payload }) => {
  const page = await queryPage('Mantenimiento', request, {
    statusNormalized: true,
    excludeInactive: true,
  });
};
`;

test('maintenance.list no fuerza activo=true porque backend ya aplica excludeInactive', () => {
  assert.match(
    registry,
    /resource: 'maintenance'[\s\S]*route: 'maintenance\.list'[\s\S]*forceActiveFilter: false/,
  );
  assert.match(pull, /if \(config\.forceActiveFilter !== false\)/);
  assert.match(backendPatchReference, /excludeInactive: true/);
});

test('catálogos que sí dependían del filtro activo conservan el comportamiento', () => {
  assert.match(
    registry,
    /resource: 'client'[\s\S]*forceActiveFilter: true/,
  );
  assert.match(
    registry,
    /resource: 'deviceType'[\s\S]*forceActiveFilter: true/,
  );
});

test('si incremental está deshabilitado o unsafe se conserva snapshot autoritativo', () => {
  assert.match(
    pull,
    /function incrementalUnavailable[\s\S]*delta\.enabled === false[\s\S]*delta\.reason === 'sync_unsafe'/,
  );
  assert.match(
    pull,
    /if \(incrementalUnavailable\(probe\)\)[\s\S]*replaceSnapshotOnly/,
  );
  assert.match(
    pull,
    /if \(incrementalUnavailable\(delta\)\)[\s\S]*replaceSnapshotOnly/,
  );
  assert.doesNotMatch(pull, /SYNC_DISABLED/);
});

test('fallo de bootstrap incremental usa endpoint autoritativo sin inventar cursor', () => {
  assert.match(
    pull,
    /catch \(error\)[\s\S]*isAuthenticationError\(error\)[\s\S]*replaceSnapshotOnly/,
  );
  assert.match(
    pull,
    /replaceSnapshotOnly[\s\S]*requireFullSnapshot\(db, scopeKey, config\.resource\)/,
  );
  assert.match(
    pull,
    /SQLite conserva el snapshot autoritativo para uso offline/,
  );
});

test('fallback sigue pasando por actionRequest y por permisos del backend', () => {
  assert.match(
    pull,
    /actionRequest<unknown>\(\s*config\.route/,
  );
  assert.doesNotMatch(pull, /Google Drive|DATABASE_URL|postgres/i);
});
