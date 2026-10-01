import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const list = await readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');
const deviceDetail = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/[deviceId].tsx', import.meta.url), 'utf8');
const editMaintenance = await readFile(new URL('../src/app/maintenance/[maintenanceId]/edit.tsx', import.meta.url), 'utf8');
const newDevice = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/new.tsx', import.meta.url), 'utf8');
const editDevice = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/[deviceId]/edit.tsx', import.meta.url), 'utf8');

test('crear mantenimiento es exclusivo de la web', async () => {
  assert.doesNotMatch(list, /maintenance\/new|canCreateMaintenance/);
  await assert.rejects(
    readFile(new URL('../src/app/maintenance/new.tsx', import.meta.url), 'utf8'),
  );
});

test('editar mantenimiento existente sigue reutilizando MaintenanceEditorScreen', () => {
  assert.match(editMaintenance, /MaintenanceEditorScreen/);
  assert.match(editMaintenance, /mode="edit"/);
});

test('Agregar y Editar dispositivo reutilizan DeviceEditorScreen', () => {
  assert.match(newDevice, /DeviceEditorScreen/);
  assert.match(newDevice, /mode="create"/);
  assert.match(editDevice, /DeviceEditorScreen/);
  assert.match(editDevice, /mode="edit"/);
});

test('detalle aplica permiso y solo lectura antes de exponer acciones de edición', () => {
  assert.match(detail, /canEditMaintenance\(permissions\)/);
  assert.match(detail, /maintenanceReadOnly\(permissions, maintenance\.Estado\)/);
  assert.match(detail, /Agregar dispositivo/);
  assert.match(deviceDetail, /canEditMaintenance\(permissions\)/);
  assert.match(deviceDetail, /maintenanceReadOnly\(permissions, maintenance\?\.Estado\)/);
});
