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
const maintenanceRepo = await readFile(
  new URL('../src/db/maintenanceRepository.ts', import.meta.url),
  'utf8',
);
const syncButton = await readFile(
  new URL('../src/components/SyncStatusCard.tsx', import.meta.url),
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

test('detalle vincula solo ubicaciones elegidas al mantenimiento y conserva alta inline del catálogo', () => {
  assert.match(detail, /maintenanceEquipmentLocationsFromRecord/);
  assert.match(detail, /saveLocalMaintenanceLocations/);
  assert.match(maintenanceRepo, /route: 'maintenance\.update\.locations'/);
  assert.match(maintenanceRepo, /maintenance:update-locations/);
  assert.match(maintenanceRepo, /local_maintenance_detail_state/);
  assert.match(maintenanceRepo, /if \(!detailState\?\.complete\)/);
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

test('estado inactivo de sync siempre limpia syncing y la UI queda reducida a un botón redondo fuera del detalle', () => {
  assert.match(syncProvider, /if \(syncingRef\.current\) return;/);
  assert.match(syncProvider, /syncing: false,[\s\S]*status,/);
  const busyBranches = syncProvider.match(/result\.status === 'BUSY'/g) || [];
  assert.ok(busyBranches.length >= 3);
  assert.match(syncProvider, /result\.status === 'BUSY'[\s\S]*syncingRef\.current = false;[\s\S]*refreshStatus/);
  assert.doesNotMatch(detail, /SyncStatusCard|syncProgressText/);
  assert.match(syncButton, /Sincronizar ahora/);
  assert.match(syncButton, /width: sizing\.touchTargetMin/);
  assert.match(syncButton, /borderRadius: sizing\.touchTargetMin \/ 2/);
});

test('ubicaciones del mantenimiento son plegables y el editor no expone todo el catálogo del cliente', () => {
  assert.match(detail, /openLocations/);
  assert.match(detail, /toggleLocation\(section\.key\)/);
  assert.match(detail, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(editor, /maintenanceEquipmentLocationsFromRecord/);
  assert.match(editor, /linkedEquipmentLocationIds/);
  assert.match(editor, /equipment: maintenanceEquipment/);
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
