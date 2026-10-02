import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile(
  new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url),
  'utf8',
);
const database = await readFile(
  new URL('../src/db/database.ts', import.meta.url),
  'utf8',
);
const resources = await readFile(
  new URL('../src/db/resourceRepository.ts', import.meta.url),
  'utf8',
);
const detail = await readFile(
  new URL('../src/db/maintenanceDetailRepository.ts', import.meta.url),
  'utf8',
);
const maintenance = await readFile(
  new URL('../src/db/maintenanceRepository.ts', import.meta.url),
  'utf8',
);
const devices = await readFile(
  new URL('../src/db/deviceRepository.ts', import.meta.url),
  'utf8',
);

test('editor de dispositivo no abre statements SQLite en paralelo', () => {
  assert.doesNotMatch(editor, /Promise\.all\(/);

  const maintenanceRead = editor.indexOf('const maintenanceRow = await getLocalMaintenance');
  const detailRead = editor.indexOf('const localDetail = await readLocalMaintenanceDetail');
  const typeRead = editor.indexOf("const deviceTypes = await listResourceItems");
  const manufacturerRead = editor.indexOf("const manufacturers = await listResourceItems");
  const deviceRead = editor.indexOf('const localDevice = await readLocalDeviceDetail');

  assert.ok(maintenanceRead >= 0);
  assert.ok(detailRead > maintenanceRead);
  assert.ok(typeRead > detailRead);
  assert.ok(manufacturerRead > typeRead);
  assert.ok(deviceRead > manufacturerRead);
});

test('lecturas del editor reutilizan retry acotado solo para locks transitorios', () => {
  assert.match(database, /export async function withDatabaseLockRetry/);
  assert.match(database, /if \(!isDatabaseLockedError\(error\)/);

  assert.match(resources, /withDatabaseLockRetry\(\(\) => db\.getAllAsync/);
  assert.match(maintenance, /withDatabaseLockRetry\(\(\) => db\.getFirstAsync/);
  assert.match(detail, /withDatabaseLockRetry\(\(\) => db\.getFirstAsync/);
  assert.match(detail, /withDatabaseLockRetry\(\(\) => db\.getAllAsync/);
});

test('guardar o eliminar un dispositivo tolera un lock transitorio de otra transacción', () => {
  const save = devices.indexOf('export async function saveLocalDeviceWithEvidence');
  const remove = devices.indexOf('export async function deleteLocalDevice');

  assert.ok(save >= 0);
  assert.ok(remove > save);
  assert.match(
    devices.slice(save, remove),
    /withDatabaseLockRetry\(\(\) => db\.withExclusiveTransactionAsync/,
  );
  assert.match(
    devices.slice(remove),
    /withDatabaseLockRetry\(\(\) => db\.withExclusiveTransactionAsync/,
  );
});
