import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function read(path) {
  return readFile(new URL('../' + path, import.meta.url), 'utf8');
}

const app = JSON.parse(await read('app.json'));
const pkg = JSON.parse(await read('package.json'));
const workflow = await read('.github/workflows/android-apk.yml');
const verifier = await read('scripts/verify-android-apk.sh');
const smoke = await read('scripts/android-emulator-smoke.sh');
const policySource = await read('src/sync/syncPolicy.ts');
const configSource = await read('src/config/appConfig.ts');

function loadSyncPolicy() {
  const transpiled = ts.transpileModule(policySource, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
    },
  }).outputText;
  const exports = {};
  const config = {
    operationalTimeZone: 'America/Costa_Rica',
    autoSyncStartHour: 7,
    autoSyncEndHour: 17,
  };
  new Function('require', 'exports', transpiled)((specifier) => {
    assert.equal(specifier, '@/config/appConfig');
    return { appConfig: config };
  }, exports);
  return exports;
}

test('etapa 15: identidad original y versionCode incremental instalable', () => {
  assert.equal(app.expo.android.package, 'com.solutionsdms.dmsmantenimientos');
  assert.equal(app.expo.slug, 'dms-boletas-mantenimientos');
  assert.equal(app.expo.version, pkg.version);
  assert.ok(app.expo.android.versionCode >= 2);
  assert.equal(app.expo.android.predictiveBackGestureEnabled, false);
});

test('etapa 15: compilación autónoma entrega bundle, firma, paquete y checksum', () => {
  assert.match(workflow, /assembleRelease --no-daemon/);
  assert.doesNotMatch(workflow, /gradlew assembleDebug/);
  assert.match(workflow, /bash scripts\/verify-android-apk\.sh/);
  assert.match(workflow, /dms-mantenimientos-android-standalone/);
  assert.match(workflow, /app-release\.apk/);
  assert.match(workflow, /if-no-files-found: error/);
  assert.match(verifier, /assets\/index\[\.\]android\[\.\]bundle/);
  assert.match(verifier, /apksigner.*verify --verbose/);
  assert.match(verifier, /aapt.*dump badging/);
  assert.match(verifier, /sha256sum/);
  assert.match(verifier, /versionCode/);
  assert.match(verifier, /app\.json/);
  assert.match(verifier, /com\.solutionsdms\.dmsmantenimientos/);
});

test('etapa 15: smoke instala release en emulador, arranca offline y adjunta evidencia', () => {
  assert.match(workflow, /reactivecircus\/android-emulator-runner@v2/);
  assert.match(workflow, /needs: apk/);
  assert.match(workflow, /actions\/download-artifact@v4/);
  assert.match(workflow, /scripts\/android-emulator-smoke\.sh/);
  assert.match(workflow, /android-smoke\//);
  assert.match(smoke, /adb install -r/);
  assert.match(smoke, /adb shell monkey -p/);
  assert.match(smoke, /adb shell pidof/);
  assert.match(smoke, /adb shell svc wifi disable/);
  assert.match(smoke, /adb exec-out screencap -p/);
  assert.match(smoke, /trap dump_on_error ERR/);
  assert.doesNotMatch(smoke, /password|DATABASE_URL|GOOGLE_API_KEY|keytool|private_key/i);
});

test('etapa 15: política horaria real aplica límites Costa Rica a los 4 tipos de disparador', () => {
  const { isSyncAllowed, isAutomaticSyncWindow } = loadSyncPolicy();
  const before = new Date('2026-10-15T12:59:59Z'); // CR 06:59:59
  const start = new Date('2026-10-15T13:00:00Z');  // CR 07:00
  const last = new Date('2026-10-15T22:59:59Z');   // CR 16:59:59
  const closed = new Date('2026-10-15T23:00:00Z'); // CR 17:00
  assert.equal(isAutomaticSyncWindow(before), false);
  assert.equal(isAutomaticSyncWindow(start), true);
  assert.equal(isAutomaticSyncWindow(last), true);
  assert.equal(isAutomaticSyncWindow(closed), false);
  for (const type of ['background', 'foreground', 'network', 'local-change']) {
    assert.equal(isSyncAllowed(type, before), false);
    assert.equal(isSyncAllowed(type, start), true);
    assert.equal(isSyncAllowed(type, closed), false);
  }
  assert.equal(isSyncAllowed('manual', before), true);
  assert.equal(isSyncAllowed('manual', closed), true);
  assert.match(configSource, /America\/Costa_Rica/);
});

test('etapa 15: garantías de seguridad y negocio sin nuevos endpoints/firmas', async () => {
  const repo = await read('src/db/deviceRepository.ts');
  const files = await read('src/db/localFileRepository.ts');
  const deviceEditor = await read('src/components/maintenance/DeviceEditorScreen.tsx');
  const detail = await read('src/app/maintenance/[maintenanceId].tsx');
  const deviceDetail = await read('src/app/maintenance/[maintenanceId]/device/[deviceId].tsx');
  const background = await read('src/sync/backgroundSyncTask.ts');
  const pull = await read('src/sync/syncPull.ts');
  const push = await read('src/sync/syncPush.ts');
  assert.match(deviceEditor, /saveMaintenanceEvidenceDrafts/);
  assert.match(deviceEditor, /listMaintenanceEvidenceDrafts/);
  assert.match(repo, /withExclusiveTransactionAsync/);
  assert.match(repo, /clearEvidenceDrafts/);
  assert.match(files, /local_resource_items/);
  assert.match(files, /local_files/);
  assert.match(detail, /openBulkDevices\(section\)/);
  assert.match(detail, /MaintenanceProgressSummary/);
  assert.match(deviceDetail, /ProjectDeviceSections/);
  assert.match(push, /LOCAL_FILE_MISSING/);
  assert.match(push, /SYNC_CONFLICT/);
  assert.match(push, /markOutboxBlocked/);
  assert.match(pull, /fullSnapshotRequired/);
  assert.match(background, /isSyncAllowed\('background'\)/);
  assert.doesNotMatch(deviceEditor, /maintenance\.finalize|signature\.upload/);
});
