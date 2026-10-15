import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleAt(path, mocks = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', transpiled)(
    (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      throw new Error('Dependencia inesperada: ' + name);
    },
    exports,
  );
  return { exports, source };
}

const draftsByMaintenance = new Map();
const fileRows = new Map();
const statements = [];

function key(scopeKey, maintenanceId) {
  return scopeKey + ':' + maintenanceId;
}
function fakeDb() {
  const tx = {
    runAsync: async (sql, ...params) => {
      statements.push({ sql, params });
      if (sql.includes('DELETE FROM local_resource_items')) {
        draftsByMaintenance.delete(key(params[0], params[2]));
      } else if (sql.includes('INSERT INTO local_files')) {
        fileRows.set(params[0], { scopeKey: params[1], localUri: params[4] });
      }
      return { changes: 1 };
    },
  };
  return {
    ...tx,
    withExclusiveTransactionAsync: async (cb) => cb(tx),
  };
}

const localFiles = await moduleAt('../src/db/localFileRepository.ts', {
  '@/utils/localId': { createLocalId: () => 'not-used' },
  '@/db/database': { withDatabaseLockRetry: (fn) => fn() },
  '@/db/resourceRepository': {
    upsertResourceItemTx: async (_db, scopeKey, resource, item) => {
      assert.equal(resource, 'maintenanceEvidenceDraft');
      const recordKey = key(scopeKey, item.maintenanceId);
      const existing = draftsByMaintenance.get(recordKey) || [];
      draftsByMaintenance.set(recordKey, [...existing, item]);
    },
    listResourceItemsByParents: async (_db, scopeKey, resource, ids) => {
      assert.equal(resource, 'maintenanceEvidenceDraft');
      return draftsByMaintenance.get(key(scopeKey, ids[0])) || [];
    },
  },
});

const sample = (evidenceId, fileId, uri) => ({
  evidenceId,
  localFileId: fileId,
  localUri: uri,
  fileName: 'foto.jpg',
  mimeType: 'image/jpeg',
  size: 1250,
  asset: { uri, type: 'image', width: 100, height: 100 },
  capturedAt: '2026-10-15T17:10:00Z',
  type: 'Antes',
  targetValue: 'DISPOSITIVO',
});

test('etapa 14: las fotos de borrador sobreviven a una pantalla recreada y están aisladas por mantenimiento y cuenta', async () => {
  const db = fakeDb();
  const one = sample('e1', 'file-e1', 'file:///documents/e1.jpg');
  const two = sample('e2', 'file-e2', 'file:///documents/e2.jpg');
  await localFiles.exports.saveMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm1', [one, two]);
  const restored = await localFiles.exports.listMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm1');
  assert.deepEqual(restored.map((item) => item.evidenceId), ['e1', 'e2']);
  assert.equal((await localFiles.exports.listMaintenanceEvidenceDrafts(db, 'cuenta-B', 'm1')).length, 0);
  assert.equal((await localFiles.exports.listMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm2')).length, 0);
  assert.equal(fileRows.get('file-e1').localUri, one.localUri);
  assert.equal(fileRows.get('file-e2').localUri, two.localUri);
});

test('etapa 14: un borrador actualizado no deja fotos borradas visibles', async () => {
  const db = fakeDb();
  await localFiles.exports.saveMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm1', [
    sample('e2', 'file-e2', 'file:///documents/e2.jpg'),
  ]);
  const restored = await localFiles.exports.listMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm1');
  assert.deepEqual(restored.map((item) => item.evidenceId), ['e2']);
  assert.equal(fileRows.has('file-e1'), true, 'La limpieza de huérfanos controla la eliminación posterior');
});

test('etapa 14: solo limpiar el manifiesto después del guardado atómico, conservar el archivo para subir', async () => {
  const db = fakeDb();
  await localFiles.exports.clearMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm1');
  assert.equal((await localFiles.exports.listMaintenanceEvidenceDrafts(db, 'cuenta-A', 'm1')).length, 0);
  assert.equal(fileRows.has('file-e2'), true);
  const dbDevice = await readFile(new URL('../src/db/deviceRepository.ts', import.meta.url), 'utf8');
  const txSave = dbDevice.slice(dbDevice.indexOf('export async function saveLocalDeviceWithEvidence('));
  assert.match(txSave, /await saveLocalEvidenceTx\(/);
  assert.match(txSave, /if \(input\.clearEvidenceDrafts\)/);
  assert.match(txSave, /DELETE FROM local_resource_items/);
  assert.match(txSave, /withExclusiveTransactionAsync/);
});

test('etapa 14: limpieza de huérfanos no borra fotos del borrador mientras no se guarde', async () => {
  assert.match(localFiles.source, /d\.resource = 'maintenanceEvidenceDraft'/);
  assert.match(localFiles.source, /d\.entity_id = f\.owner_id/);
  assert.match(localFiles.source, /f\.owner_type = 'maintenanceEvidenceDraft'/);
  assert.match(localFiles.source, /o\.status IN \('PENDING','IN_FLIGHT','FAILED','CONFLICT','BLOCKED'\)/);
});

test('etapa 14: Android consume la cámara una sola vez y no depende de referencias cambiantes', async () => {
  const picker = await readFile(new URL('../src/components/maintenance/MaintenanceEvidencePickerControls.tsx', import.meta.url), 'utf8');
  assert.match(picker, /getPendingResultAsync\(\)/);
  assert.match(picker, /\[disabled, consumeAssets\]/);
  assert.doesNotMatch(picker, /\[disabled, onAssets\]/);
  assert.match(picker, /consumedUrisRef\.current\.has\(uri\)/);
  assert.match(picker, /launchInProgressRef\.current/);
  assert.match(picker, /const pickerDisabled = disabled \|\| processing/);
  assert.match(picker, /await assetsRef\.current\(unique\)/);
});

test('etapa 14: formulario no elimina fotos al desmontarse ni abandona borradores al fallar SQLite', async () => {
  const editor = await readFile(new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url), 'utf8');
  const draftUI = await readFile(new URL('../src/components/maintenance/MaintenanceEvidenceDraftSection.tsx', import.meta.url), 'utf8');
  assert.match(editor, /listMaintenanceEvidenceDrafts\(/);
  assert.match(editor, /draftWritesRef\.current/);
  assert.match(editor, /saveMaintenanceEvidenceDrafts\(/);
  assert.match(editor, /clearEvidenceDrafts: mode === 'create'/);
  assert.doesNotMatch(editor, /if \(savedDraftRef\.current\) return;/);
  assert.doesNotMatch(editor, /removeLocalEvidenceFile\(item\.localUri\)/);
  assert.match(draftUI, /sourceUri: asset\.uri/);
  assert.match(draftUI, /seen\.has\(asset\.uri\)/);
  assert.match(draftUI, /await onChange\(next\)/);
});

test('etapa 14: políticas y etapas previas siguen activas', async () => {
  const policy = await readFile(new URL('../src/sync/syncPolicy.ts', import.meta.url), 'utf8');
  const config = await readFile(new URL('../src/config/appConfig.ts', import.meta.url), 'utf8');
  const summary = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');
  const project = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/[deviceId].tsx', import.meta.url), 'utf8');
  assert.match(config, /autoSyncStartHour: 7/);
  assert.match(config, /autoSyncEndHour: 17/);
  assert.match(config, /America\\/Costa_Rica/);
  assert.match(policy, /trigger === 'manual' \\|\\| isAutomaticSyncWindow\\(now\\)/);
  assert.match(summary, /openBulkDevices\(section\)/);
  assert.match(summary, /MaintenanceProgressSummary/);
  assert.match(project, /ProjectDeviceSections/);
  assert.match(project, /MaintenanceEvidenceManager/);
});
