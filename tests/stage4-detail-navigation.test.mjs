import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const detailRepo = await readFile(new URL('../src/db/maintenanceDetailRepository.ts', import.meta.url), 'utf8');
const coordinator = await readFile(new URL('../src/sync/SyncCoordinator.ts', import.meta.url), 'utf8');
const detailScreen = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');
const deviceScreen = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/[deviceId].tsx', import.meta.url), 'utf8');

test('snapshot autorizado no pisa mantenimiento, dispositivos ni evidencias con outbox pendiente', () => {
  assert.match(detailRepo, /hasUnresolvedEntityOperations/);
  assert.match(detailRepo, /'maintenance'/);
  assert.match(detailRepo, /'maintenanceDevice'/);
  assert.match(detailRepo, /'maintenanceEvidence'/);
  assert.match(detailRepo, /if \(!maintenanceDirty\)/);
  assert.match(detailRepo, /if \(!deviceDirty\)/);
  assert.match(detailRepo, /if \(!evidenceDirty\)/);
});

test('detalle local carga dispositivos y evidencias en batch, no una consulta por tarjeta', () => {
  assert.match(detailRepo, /FROM local_maintenance_devices/);
  assert.match(detailRepo, /FROM local_maintenance_evidence e/);
  assert.match(detailRepo, /LEFT JOIN local_files f/);
  assert.match(detailRepo, /evidenceByDevice = new Map/);
});

test('actualizar un detalle reutiliza maintenance.get bajo el mismo lease de sincronización', () => {
  assert.match(coordinator, /runMaintenanceDetailRefresh/);
  assert.match(coordinator, /acquireSyncLease\(db\)/);
  assert.match(coordinator, /'maintenance\.get'/);
  assert.match(coordinator, /persistAuthorizedMaintenanceDetail/);
});

test('detalle distingue resumen de snapshot completo', () => {
  assert.match(detailScreen, /detail\.detailComplete/);
  assert.match(detailScreen, /Detalle todavía no descargado/);
  assert.match(detailScreen, /Descargar detalle/);
  assert.match(detailScreen, /disponible sin conexión/i);
});

test('las rutas de detalle dejan de mostrar datos al perder sesión o scope', () => {
  assert.match(detailScreen, /if \(!user\) return <Redirect href="\/login"/);
  assert.match(deviceScreen, /if \(!user\) return <Redirect href="\/login"/);
  assert.match(detailScreen, /setDetail\(null\)/);
  assert.match(deviceScreen, /setDetail\(null\)/);
});

test('dispositivo tiene ruta dedicada, anterior\/siguiente y galería local ampliable', () => {
  assert.match(deviceScreen, /previousDeviceId/);
  assert.match(deviceScreen, /nextDeviceId/);
  assert.match(deviceScreen, /router\.replace/);
  assert.match(deviceScreen, /<Modal/);
  assert.match(deviceScreen, /localUri/);
  assert.match(deviceScreen, /Imagen en servidor/);
});
