import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const detail = await readFile(
  new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url),
  'utf8',
);
const newDevice = await readFile(
  new URL('../src/app/maintenance/[maintenanceId]/device/new.tsx', import.meta.url),
  'utf8',
);
const editor = await readFile(
  new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url),
  'utf8',
);
const deviceRepo = await readFile(
  new URL('../src/db/deviceRepository.ts', import.meta.url),
  'utf8',
);
const resources = await readFile(
  new URL('../src/db/resourceRepository.ts', import.meta.url),
  'utf8',
);
const syncProvider = await readFile(
  new URL('../src/sync/SyncProvider.tsx', import.meta.url),
  'utf8',
);
const tokens = await readFile(
  new URL('../src/theme/tokens.ts', import.meta.url),
  'utf8',
);

test('detalle organiza inventario por ubicación y permite alta rápida de dispositivo en esa zona', () => {
  assert.match(detail, /Ubicaciones y dispositivos/);
  assert.match(detail, /locationAddButton/);
  assert.match(detail, />Dispositivo<\/Text>/);
  assert.match(detail, /equipmentLocationId: location\.locationId/);
  assert.match(detail, /equipmentLocationName: location\.title/);
  assert.match(newDevice, /initialEquipmentLocationId/);
  assert.match(newDevice, /initialEquipmentLocationName/);
  assert.match(editor, /initialEquipmentLocationId/);
  assert.match(editor, /equipmentLocationId: initialEquipmentLocationId/);
});

test('alta rápida de ubicación reutiliza la misma ruta operacional y outbox', () => {
  assert.match(detail, /saveLocalEquipmentLocation/);
  assert.match(deviceRepo, /saveLocalEquipmentLocationTx/);
  assert.match(deviceRepo, /route: 'equipmentLocations\.operational\.create'/);
  assert.match(deviceRepo, /entityType: 'equipmentLocation'/);
  assert.doesNotMatch(deviceRepo, /MobileEquipmentLocation|equipmentLocations\.v2/);
});

test('catálogo de ubicaciones se carga en lote y evita consulta por cada sede', () => {
  assert.match(resources, /listResourceItemsByParents/);
  assert.match(resources, /parent_id IN/);
  assert.match(editor, /listResourceItemsByParents/);
  assert.doesNotMatch(editor, /clientLocations\.map\([\s\S]*listResourceItems\([\s\S]*equipmentLocation/);
});

test('estado inactivo de sync siempre limpia syncing y BUSY no deja spinner permanente', () => {
  assert.match(syncProvider, /if \(syncingRef\.current\) return;/);
  assert.match(syncProvider, /syncing: false,[\s\S]*status,/);
  const busyBranches = syncProvider.match(/result\.status === 'BUSY'/g) || [];
  assert.ok(busyBranches.length >= 3);
  assert.match(syncProvider, /result\.status === 'BUSY'[\s\S]*syncingRef\.current = false;[\s\S]*refreshStatus/);
  assert.doesNotMatch(detail, /syncProgressText/);
});

test('tema móvil reutiliza exactamente la familia visual light y dark de DMS Boletas', () => {
  assert.match(tokens, /darkColors/);
  assert.match(tokens, /primary: '#ff6b73'/);
  assert.match(tokens, /surface: '#121010'/);
  assert.match(tokens, /surfaceCard: '#211d1d'/);
  assert.match(tokens, /lightColors/);
  assert.match(tokens, /primary: '#af101a'/);
  assert.match(tokens, /Appearance\.getColorScheme/);
});
