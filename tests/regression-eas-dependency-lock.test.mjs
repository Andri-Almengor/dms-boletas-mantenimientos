import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = async (path) => readFile(new URL('../' + path, import.meta.url), 'utf8');

const pkg = JSON.parse(await read('package.json'));
const lock = JSON.parse(await read('package-lock.json'));
const mobileCI = await read('.github/workflows/mobile-ci.yml');
const androidCI = await read('.github/workflows/android-apk.yml');

test('regresión EAS: React y React DOM usan la misma versión compatible con Expo 57', () => {
  assert.equal(pkg.dependencies.expo, '~57.0.26');
  assert.equal(pkg.dependencies.react, '19.2.3');
  assert.equal(pkg.dependencies['react-dom'], pkg.dependencies.react);
  assert.equal(pkg.dependencies['react-native'], '0.86.3');
  assert.equal(lock.packages['node_modules/react-dom'].version, pkg.dependencies.react);
  assert.equal(lock.packages['node_modules/react'].version, pkg.dependencies.react);
});

test('regresión EAS: Worklets y Reanimated fijados en el conjunto soportado por Expo SDK 57', () => {
  assert.equal(pkg.dependencies['react-native-reanimated'], '4.5.1');
  assert.equal(pkg.dependencies['react-native-worklets'], '0.10.1');
  assert.equal(lock.packages['node_modules/react-native-reanimated'].version, '4.5.1');
  assert.equal(lock.packages['node_modules/react-native-worklets'].version, '0.10.1');
});

test('regresión EAS: lockfile npm version 3 coincide con package.json exactamente', () => {
  assert.equal(lock.lockfileVersion, 3);
  assert.equal(lock.name, pkg.name);
  assert.equal(lock.version, pkg.version);
  assert.deepEqual(lock.packages[''].dependencies, pkg.dependencies);
  assert.deepEqual(lock.packages[''].devDependencies, pkg.devDependencies);
  for (const name of ['react', 'react-dom', 'react-native-reanimated', 'react-native-worklets']) {
    assert.ok(lock.packages[`node_modules/${name}`]?.integrity);
  }
});

test('regresión EAS: ambas validaciones ejecutan npm ci sin saltarse errores de peer deps', () => {
  for (const workflow of [mobileCI, androidCI]) {
    assert.match(workflow, /npm ci --include=dev --no-audit --no-fund/);
    assert.doesNotMatch(workflow, /npm install --no-audit --no-fund/);
    assert.doesNotMatch(workflow, /--force|--legacy-peer-deps/);
  }
});
