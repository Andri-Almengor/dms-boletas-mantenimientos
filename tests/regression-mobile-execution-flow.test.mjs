import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const list = await readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');
const editor = await readFile(new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url), 'utf8');
const picker = await readFile(new URL('../src/components/maintenance/MaintenanceEvidencePickerControls.tsx', import.meta.url), 'utf8');
const draft = await readFile(new URL('../src/components/maintenance/MaintenanceEvidenceDraftSection.tsx', import.meta.url), 'utf8');
const deviceRepo = await readFile(new URL('../src/db/deviceRepository.ts', import.meta.url), 'utf8');
const evidenceRepo = await readFile(new URL('../src/db/evidenceRepository.ts', import.meta.url), 'utf8');
const resourceRepo = await readFile(new URL('../src/db/resourceRepository.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');

test('móvil ejecuta mantenimientos existentes pero no crea mantenimientos', async () => {
  assert.doesNotMatch(list, /maintenance\/new|\+ Nuevo/);
  await assert.rejects(
    readFile(new URL('../src/app/maintenance/new.tsx', import.meta.url), 'utf8'),
  );
});

test('firma y finalización no existen en la superficie móvil', () => {
  assert.doesNotMatch(detail, /MaintenanceCompletionCard|SignaturePad|Finalizar|Firma/);
  assert.doesNotMatch(push, /SIGNATURE_UPLOAD|FINALIZE_PENDING/);
  assert.match(schema, /MIGRATION_7/);
});

test('editor sigue el flujo web: ubicación, identificación, grupo, checklist, observaciones y evidencia', () => {
  const identification = editor.indexOf('Identificación y ubicación');
  const team = editor.indexOf('Fecha y grupo de trabajo');
  const checklist = editor.indexOf('<Section title="Checklist">');
  const observations = editor.indexOf('<Section title="Observaciones">');
  const evidence = editor.indexOf('<MaintenanceEvidenceDraftSection');
  assert.ok(identification >= 0);
  assert.ok(team > identification);
  assert.ok(checklist > team);
  assert.ok(observations > checklist);
  assert.ok(evidence > observations);
});

test('ubicación de equipo se puede preparar inline con ruta operacional existente', () => {
  assert.match(editor, /\+ Agregar ubicación/);
  assert.match(editor, /Ubicación principal \*/);
  assert.match(editor, /canCreateOperationalClientData/);
  assert.match(deviceRepo, /equipmentLocations\.operational\.create/);
  assert.match(deviceRepo, /entityType: 'equipmentLocation'/);
  assert.doesNotMatch(deviceRepo, /equipmentLocations\.mobile|v2/);
});

test('ubicación → dispositivo → evidencias quedan encadenados en una transacción SQLite', () => {
  assert.match(deviceRepo, /saveLocalDeviceWithEvidence/);
  assert.match(deviceRepo, /withExclusiveTransactionAsync/);
  assert.match(deviceRepo, /equipmentDependencyId/);
  assert.match(deviceRepo, /dependsOnOperationId: equipmentDependencyId/);
  assert.match(deviceRepo, /saveLocalEvidenceTx/);
  assert.match(evidenceRepo, /findPendingEntityCreateOperation[\s\S]*'maintenanceDevice'/);
  assert.match(evidenceRepo, /dependsOnOperationId: localOnly[\s\S]*deviceCreate\?\.operation_id/);
});

test('ID local de ubicación se remapea al UUID del servidor antes de enviar el dispositivo', () => {
  assert.match(resourceRepo, /remapCreatedEquipmentLocationTx/);
  assert.match(resourceRepo, /equipment_location_id = \?/);
  assert.match(resourceRepo, /entity_type = 'maintenanceDevice'/);
  assert.match(push, /entity_type === 'equipmentLocation'/);
  assert.match(push, /remapCreatedEquipmentLocationTx/);
});

test('evidencias se pueden capturar antes de guardar el dispositivo y reutilizan el picker compartido', () => {
  assert.match(editor, /MaintenanceEvidenceDraftSection/);
  assert.match(draft, /persistPickedEvidenceAsset/);
  assert.match(draft, /MaintenanceEvidencePickerControls/);
  assert.match(picker, /Tomar foto/);
  assert.match(picker, /Foto galería/);
  assert.match(picker, /Seleccionar varios/);
  assert.match(picker, /Grabar video/);
  assert.doesNotMatch(draft, /actionRequest\(|fetch\(/);
});
