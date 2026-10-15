import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const bulk = await readFile(new URL('../src/features/maintenance/maintenanceBulkDevices.ts', import.meta.url), 'utf8');
const repository = await readFile(new URL('../src/db/deviceRepository.ts', import.meta.url), 'utf8');
const screen = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/bulk.tsx', import.meta.url), 'utf8');
const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');

// Ejecuta la implementación real de parseo sin requerir Metro/Expo para pruebas Node.
function parseWithSource(value) {
  const match = bulk.match(/export function parseBulkMaintenanceDeviceNames\(value: unknown\): string\[\] \{([\s\S]*?)\n\}/);
  assert.ok(match, 'El parser reutilizable debe existir');
  return new Function('value', match[1])(value);
}

test('etapa 11: mismo límite y parseo de listas que el cliente web', () => {
  assert.match(bulk, /MAX_BULK_MAINTENANCE_DEVICES = 100/);
  assert.deepEqual(
    parseWithSource('  Cámara uno\tcamara dos\r\ncamara tres\n\n\tPuerta de emergencia  '),
    ['Cámara uno', 'camara dos', 'camara tres', 'Puerta de emergencia'],
  );
  assert.deepEqual(parseWithSource(' \t\r\n '), []);
  assert.deepEqual(parseWithSource(null), []);
  assert.deepEqual(parseWithSource('Cámara uno\tCámara uno'), ['Cámara uno', 'Cámara uno']);
});

test('etapa 11: crea pendientes con la misma serialización del editor individual', () => {
  assert.match(bulk, /createDeviceEditorForm\(maintenanceType\)/);
  assert.match(bulk, /deviceEditorPayload\(/);
  assert.match(bulk, /status: 'PENDIENTE'/);
  assert.match(bulk, /id: createLocalId\('dispositivo'\)/);
  assert.match(bulk, /deviceTypeId: type\.typeId/);
  assert.match(bulk, /equipmentLocationId: location\.id/);
  assert.doesNotMatch(bulk, /maintenance\.devices\.bulk/);
});

test('etapa 11: transacción única, IDs estables y outbox original por dispositivo', () => {
  const batch = repository.slice(repository.indexOf('export async function saveLocalDevicesBulk('));
  const beforeEvidence = batch.split('export async function saveLocalDeviceWithEvidence(')[0];
  assert.match(beforeEvidence, /patches\.length > 100/);
  assert.match(beforeEvidence, /new Set\(ids\)\.size !== ids\.length/);
  assert.ok(beforeEvidence.indexOf('const prepared = patches.map') < beforeEvidence.indexOf('withDatabaseLockRetry'));
  assert.match(beforeEvidence, /withExclusiveTransactionAsync/);
  assert.match(beforeEvidence, /state\?\.complete !== 1/);
  assert.match(beforeEvidence, /saveLocalDeviceTx\(/);
  assert.match(beforeEvidence, /deferDetailCounts: true/);
  assert.match(beforeEvidence, /refreshDetailCountsTx\(transaction, scopeKey, maintenanceId\)/);
  assert.match(repository, /'maintenance\.devices\.create'/);
  assert.match(repository, /enqueueOutboxOperationTx\(db/);
  assert.match(repository, /findPendingEntityCreateOperation/);
  assert.doesNotMatch(beforeEvidence, /actionRequest\(|fetch\(/);
});

test('etapa 11: acceso solo con detalle local completo y permisos existentes', () => {
  assert.match(screen, /canEditMaintenance\(permissions\)/);
  assert.match(screen, /maintenanceReadOnly\(permissions, maintenance\.Estado\)/);
  assert.match(screen, /!detail\?\.detailComplete/);
  assert.match(screen, /saveLocalDevicesBulk\(db, dataScope, maintenanceId, patches\)/);
  assert.match(screen, /refreshStatus\(\)/);
  assert.match(screen, /OptionSheet/);
  assert.match(screen, /onChangeText=\{setRawNames\}/);
  assert.match(screen, /MAX_BULK_MAINTENANCE_DEVICES/);
  assert.match(detail, /pathname: '\/maintenance\/\[maintenanceId\]\/device\/bulk'/);
  assert.match(detail, /openBulkDevices\(section\)/);
  assert.match(detail, /openBulkDevices\(\)/);
  assert.doesNotMatch(screen, /actionRequest\(|fetch\(|sync\.delta|maintenance\.signature|maintenance\.finalize/);
});
