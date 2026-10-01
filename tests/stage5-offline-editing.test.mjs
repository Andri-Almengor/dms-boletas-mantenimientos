import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const permissions = await readFile(new URL('../src/features/maintenance/maintenancePermissions.ts', import.meta.url), 'utf8');
const maintenanceRepo = await readFile(new URL('../src/db/maintenanceRepository.ts', import.meta.url), 'utf8');
const deviceRepo = await readFile(new URL('../src/db/deviceRepository.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const maintenanceEditor = await readFile(new URL('../src/components/maintenance/MaintenanceEditorScreen.tsx', import.meta.url), 'utf8');
const deviceEditor = await readFile(new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url), 'utf8');

test('Etapa 5 reutiliza los permisos existentes de crear y editar mantenimientos', () => {
  for (const code of [
    'MANTENIMIENTOS_CREAR',
    'MANTENIMIENTOS_GESTIONAR',
    'USUARIOS_GESTIONAR',
    'BOLETAS_CREAR',
    'MANTENIMIENTOS_EDITAR',
    'BOLETAS_EDITAR',
  ]) {
    assert.match(permissions, new RegExp(code));
  }
  assert.doesNotMatch(permissions, /MANTENIMIENTOS_MOVIL|OFFLINE_EDITAR|MOBILE_EDIT/);
});

test('editores escriben en repositorios SQLite y no llaman directamente a red', () => {
  assert.match(maintenanceEditor, /saveLocalMaintenance/);
  assert.match(deviceEditor, /saveLocalDevice/);
  assert.doesNotMatch(maintenanceEditor, /actionRequest\(|fetch\(|expo-network/);
  assert.doesNotMatch(deviceEditor, /actionRequest\(|fetch\(|expo-network/);
});

test('guardar mantenimiento bloquea cambio Mantenimiento-Proyecto cuando ya existen dispositivos', () => {
  assert.match(maintenanceRepo, /SELECT COUNT\(\*\) AS total/);
  assert.match(maintenanceRepo, /No se puede cambiar entre Mantenimiento y Proyecto después de registrar dispositivos/);
  assert.match(maintenanceRepo, /withExclusiveTransactionAsync/);
});

test('nuevo mantenimiento queda inmediatamente disponible como detalle local completo', () => {
  assert.match(maintenanceRepo, /local_maintenance_detail_state/);
  assert.match(maintenanceRepo, /VALUES \(\?, \?, 1,/);
});

test('crear o editar dispositivo usa la misma outbox y respeta dependencia con mantenimiento local', () => {
  assert.match(deviceRepo, /maintenance\.devices\.create/);
  assert.match(deviceRepo, /maintenance\.devices\.update/);
  assert.match(deviceRepo, /findPendingEntityCreateOperation/);
  assert.match(deviceRepo, /dependsOnOperationId: maintenanceCreate\?\.operation_id/);
  assert.match(deviceRepo, /withExclusiveTransactionAsync/);
});

test('borrado local reutiliza maintenance.devices.delete y protege CREATE in-flight', () => {
  assert.match(deviceRepo, /maintenance\.devices\.delete/);
  assert.match(deviceRepo, /createInFlight = pendingCreate\?\.status === 'IN_FLIGHT'/);
  assert.match(deviceRepo, /dependsOnOperationId: createInFlight/);
  assert.match(deviceRepo, /tombstone = 1/);
});

test('confirmar DELETE no vuelve a insertar el dispositivo', () => {
  const deleteGuard = push.indexOf("operation.operation_kind === 'DELETE'");
  const upsert = push.indexOf("operation.entity_type === 'maintenanceDevice'");
  assert.ok(deleteGuard >= 0);
  assert.ok(upsert > deleteGuard);
  assert.match(push, /markDeviceDeleteConfirmed/);
});
