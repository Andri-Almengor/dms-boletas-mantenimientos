import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const list = await readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
const detail = await readFile(
  new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url),
  'utf8',
);
const editor = await readFile(
  new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url),
  'utf8',
);
const maintenanceEditor = await readFile(
  new URL('../src/components/maintenance/MaintenanceEditorScreen.tsx', import.meta.url),
  'utf8',
);
const deviceRepo = await readFile(
  new URL('../src/db/deviceRepository.ts', import.meta.url),
  'utf8',
);

test('la app móvil no ofrece crear mantenimientos', async () => {
  assert.doesNotMatch(list, /canCreateMaintenance|\+ Nuevo|maintenance\/new/);
  await assert.rejects(
    readFile(new URL('../src/app/maintenance/new.tsx', import.meta.url), 'utf8'),
  );
  assert.doesNotMatch(maintenanceEditor, /mode:\s*'create'|canCreateMaintenance|createMaintenanceEditorForm/);
  assert.match(maintenanceEditor, /const allowed = canEditMaintenance\(permissions\)/);
});

test('firma y finalización siguen fuera de la app móvil', () => {
  assert.doesNotMatch(detail, /Firma|Signature|Finalizar|FINALIZE_PENDING/);
  assert.doesNotMatch(editor, /Firma|Signature|Finalizar|FINALIZE_PENDING/);
});

test('alta de dispositivo incluye ubicación de equipo y creación inline reutilizando rutas existentes', () => {
  assert.match(editor, /label="Ubicación del equipo \*"/);
  assert.match(editor, /\+ Agregar ubicación del equipo/);
  assert.match(editor, /Nueva ubicación del equipo/);
  assert.match(editor, /Ubicación principal \*/);
  assert.match(deviceRepo, /equipmentLocations\.operational\.create/);
  assert.match(deviceRepo, /dependsOnOperationId/);
});

test('evidencias se agregan dentro del mismo flujo de creación del dispositivo', () => {
  assert.match(editor, /mode === 'create'[\s\S]*MaintenanceEvidenceDraftSection/);
  assert.match(editor, /saveLocalDeviceWithEvidence/);
  assert.match(editor, /evidence: preparedEvidence/);
  assert.match(editor, /Complete ubicación, datos del dispositivo y evidencias en una sola pantalla/);
});

test('orden del formulario sigue el flujo operativo de la web', () => {
  const location = editor.indexOf('label="Ubicación del equipo *"');
  const type = editor.indexOf('label="Tipo de dispositivo *"');
  const workDate = editor.indexOf('label="Fecha de trabajo"');
  const observations = editor.indexOf('<Section title="Observaciones">');
  const evidence = editor.indexOf('<MaintenanceEvidenceDraftSection');
  assert.ok(location >= 0);
  assert.ok(type > location);
  assert.ok(workDate > type);
  assert.ok(observations > workDate);
  assert.ok(evidence > observations);
});

test('guardar y agregar otro conserva solo datos de grupo y limpia el dispositivo anterior', () => {
  assert.match(editor, /Guardar y agregar otro/);
  assert.match(editor, /createDeviceEditorForm\(maintenanceType\)/);
  assert.match(editor, /equipmentLocationId: currentForm\.equipmentLocationId/);
  assert.match(editor, /workDate: currentForm\.workDate/);
  assert.match(editor, /technicianIds: \[\.\.\.currentForm\.technicianIds\]/);
  assert.match(editor, /setDraftEvidence\(\[\]\)/);
  assert.match(editor, /draftDeviceIdRef\.current = createLocalId\('dispositivo'\)/);
  assert.match(editor, /setLocationDraft\(null\)/);
});

test('guardar y agregar otro no crea servicios ni escritura remota paralela', () => {
  assert.doesNotMatch(editor, /actionRequest\(|fetch\(/);
  assert.match(editor, /saveLocalDeviceWithEvidence/);
  assert.match(deviceRepo, /enqueueOutboxOperationTx/);
});
