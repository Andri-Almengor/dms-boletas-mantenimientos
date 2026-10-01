import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const eas = JSON.parse(await readFile(new URL('../eas.json', import.meta.url), 'utf8'));
const workflow = await readFile(
  new URL('../.github/workflows/android-apk.yml', import.meta.url),
  'utf8',
);
const config = await readFile(new URL('../src/config/appConfig.ts', import.meta.url), 'utf8');

test('Etapa 10 define identidad Android estable y versionCode local', () => {
  assert.equal(app.expo.android.package, 'com.solutionsdms.dmsmantenimientos');
  assert.equal(app.expo.android.versionCode, 1);
  assert.equal(app.expo.slug, 'dms-boletas-mantenimientos');
});

test('EAS preview produce APK interno y production conserva AAB para Play Store', () => {
  assert.equal(eas.build.preview.distribution, 'internal');
  assert.equal(eas.build.preview.android.buildType, 'apk');
  assert.equal(eas.build.production.android.buildType, 'app-bundle');
  assert.match(eas.cli.version, /^>=/);
  assert.equal(eas.cli.appVersionSource, 'local');
});

test('scripts de distribución no requieren instalar eas-cli en dependencies', () => {
  assert.match(pkg.scripts['build:apk'], /npx eas-cli@latest build --platform android --profile preview/);
  assert.match(pkg.scripts['build:aab'], /npx eas-cli@latest build --platform android --profile production/);
  assert.equal(pkg.dependencies?.['eas-cli'], undefined);
  assert.equal(pkg.devDependencies?.['eas-cli'], undefined);
});

test('CI nativo genera proyecto Android y un APK instalable como artefacto', () => {
  assert.match(workflow, /java-version: "17"/);
  assert.match(workflow, /expo prebuild --platform android --clean/);
  assert.match(workflow, /\.\/gradlew assembleDebug --no-daemon/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /app-debug\.apk/);
});

test('workflow APK vuelve a correr regresiones y TypeScript antes de compilar', () => {
  const tests = workflow.indexOf('npm test');
  const typecheck = workflow.indexOf('npm run typecheck');
  const prebuild = workflow.indexOf('expo prebuild');
  const gradle = workflow.indexOf('assembleDebug');
  assert.ok(tests >= 0);
  assert.ok(typecheck > tests);
  assert.ok(prebuild > typecheck);
  assert.ok(gradle > prebuild);
});

test('APK sigue usando backend público configurable sin introducir secretos móviles', () => {
  assert.match(config, /EXPO_PUBLIC_API_URL/);
  assert.match(config, /https:\/\/dms-boletas-mfqj\.onrender\.com\/api\/action/);
  assert.doesNotMatch(config, /DATABASE_URL|API_KEY|PRIVATE_KEY|GOOGLE_APPLICATION_CREDENTIALS/);
});

test('permisos de cámara fotos y micrófono siguen declarados por el plugin existente', () => {
  const imagePicker = app.expo.plugins.find(
    (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker',
  );
  assert.ok(imagePicker);
  const options = imagePicker[1];
  assert.match(options.photosPermission, /fotos/i);
  assert.match(options.cameraPermission, /cámara/i);
  assert.match(options.microphonePermission, /micrófono/i);
});
