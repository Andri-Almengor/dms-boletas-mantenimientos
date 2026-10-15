import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadActualModule(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  const require = (name) => {
    if (Object.hasOwn(dependencies, name)) return dependencies[name];
    throw new Error(`Importación de test inesperada: ${name}`);
  };
  new Function('require', 'exports', js)(require, exports);
  return { exports, source };
}

const categories = await loadActualModule('../src/features/maintenance/maintenanceCategories.ts');
const progressModule = await loadActualModule('../src/features/maintenance/maintenanceProgress.ts', {
  '@/features/maintenance/maintenanceCategories': categories.exports,
});
const evidenceModule = await loadActualModule('../src/features/maintenance/maintenanceEvidence.ts', {
  '@/features/maintenance/maintenanceProject': {
    normalizeProjectRelationValue: () => ({}),
  },
});

const build = progressModule.exports.buildLocalMaintenanceProgress;
const dates = evidenceModule.exports.evidenceDateLabels;
const dateFormat = evidenceModule.exports.formatCostaRicaEvidenceDate;

function device(id, type, images = [], additional = {}) {
  return {
    EvidenciaMantenimientoID: id,
    TipoDispositivo: type,
    Imagenes: images.map((e, i) => ({ FotoDispositivoID: `${id}-${i}`, ...e })),
    ...additional,
  };
}

test('progreso: fuentes JSON/columnas no duplican cantidades históricas', () => {
  const result = build({
    CantidadesJSON: JSON.stringify({ CantCámaras: 54, CantPuertas: 2 }),
    CantCámaras: 54,
    CantPuertas: 2,
  }, [device('cam-1', 'Cámara'), device('cam-2', 'Cámaras')]);
  assert.equal(result.expected, 56);
  assert.equal(result.registered, 2);
  assert.equal(result.remaining, 54);
  assert.equal(result.items.find(i => i.label === 'Cámara').registered, 2);
  assert.equal(result.inventoryComplete, false);
});

test('progreso: ANTES sin DESPUÉS cuenta UN dispositivo, ambas evidencias completan el par', () => {
  const result = build({
    CantidadesJSON: JSON.stringify({ CantCámaras: 5 }),
  }, [
    device('d1', 'Cámara', [{ Tipo: 'Antes' }, { Tipo: 'Antes' }]),
    device('d2', 'Cámara', [{ Tipo: 'Antes' }, { Tipo: 'Despues' }]),
    device('d3', 'Cámara', []),
    device('d4', 'Cámara', [{ Tipo: 'Después' }]),
    device('d5', 'Cámara', [{ Tipo: 'Proyecto' }, { Tipo: 'Antes', Activo: false }]),
  ]);
  assert.equal(result.expected, 5);
  assert.equal(result.registered, 5);
  assert.equal(result.evidenceTotal, 6);
  assert.equal(result.withEvidence, 4);
  assert.equal(result.missingEvidence, 1);
  assert.equal(result.pendingAfter, 1);
  assert.equal(result.completeEvidencePairs, 1);
  assert.equal(result.onlyAfter, 1);
  assert.equal(result.unclassifiedOnly, 1);
  assert.equal(result.inventoryComplete, true);
});

test('progreso: al eliminar DESPUÉS del detalle, vuelve a pendiente', () => {
  const initial = device('d1', 'Cámara', [{ Tipo: 'Antes' }, { Tipo: 'Despues' }]);
  const beforeDelete = build({ CantCámaras: 1 }, [initial]);
  const afterDelete = build({ CantCámaras: 1 }, [
    device('d1', 'Cámara', [{ Tipo: 'Antes' }]),
  ]);
  assert.equal(beforeDelete.completeEvidencePairs, 1);
  assert.equal(afterDelete.pendingAfter, 1);
  assert.equal(afterDelete.completeEvidencePairs, 0);
});

test('progreso: un tipo excedido no compensa la falta de otro', () => {
  const result = build({ CantCámaras: 1, CantPuertas: 2 }, [
    device('1', 'Cámaras'),
    device('2', 'Cámaras'),
    device('3', 'Puertas'),
  ]);
  assert.equal(result.registered, 3);
  assert.equal(result.expected, 3);
  assert.equal(result.remaining, 0);
  assert.equal(result.inventoryComplete, false);
  assert.equal(result.items.find(i => i.label === 'Puertas').remaining, 1);
});

test('progreso: resuelve tipos dinámicos por ID y nombre sin contarlos doble', () => {
  const result = build({
    CantidadesJSON: {
      'TipoDispositivo:t-p': 3,
      'TipoDispositivoNombre:panel de acceso': 3,
      CantCámaras: 1,
    },
  }, [
    device('p1', 'Panel de acceso', [{ Tipo: 'Proyecto' }], { TipoDispositivoID: 't-p' }),
    device('p2', 'Panel de acceso', [], { TipoDispositivoID: 't-p' }),
    device('c1', 'Cámara', [{ Tipo: 'Antes' }, { Tipo: 'Despues' }]),
  ], [
    { TipoDispositivoID: 't-p', Nombre: 'Panel de acceso' },
  ]);
  assert.equal(result.expected, 4);
  assert.equal(result.registered, 3);
  assert.equal(result.items.find(i => i.label === 'Panel de acceso').expected, 3);
  assert.equal(result.items.find(i => i.label === 'Panel de acceso').registered, 2);
});

test('progreso: solo se usan evidencias activas ya disponibles en SQLite', () => {
  const result = build({ CantPuertas: 1 }, [
    device('p1', 'Puertas', [{ Tipo: 'Antes', Activo: 'INACTIVO' }]),
  ]);
  assert.equal(result.evidenceTotal, 0);
  assert.equal(result.withEvidence, 0);
  assert.equal(result.missingEvidence, 1);
});

test('fechas: nunca confundir captura con subida y siempre usar hora Costa Rica', () => {
  const both = dates({
    FechaCaptura: '2026-10-15T16:10:00.000Z',
    FechaCreacion: '2026-10-15T18:30:00.000Z',
  }, 'SYNCED');
  assert.match(both.capture, /Capturada:/);
  assert.match(both.upload, /Cargada:/);
  assert.notEqual(both.capture, both.upload);
  assert.match(dateFormat('2026-10-15T18:30:00.000Z'), /12:30/);
  assert.equal(dateFormat('no es una fecha'), 'Sin fecha');
  const offline = dates({ FechaCaptura: '2026-10-15T16:10:00.000Z' }, 'LOCAL_ONLY');
  assert.equal(offline.upload, 'Carga pendiente de sincronización');
  assert.match(offline.capture, /Capturada:/);
  assert.equal(dates({}, 'SYNCED').upload, 'Fecha de carga no disponible');
});

test('regresión: UI lee SQLite, actualiza al regresar y no envía notificaciones', async () => {
  const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');
  const manager = await readFile(new URL('../src/components/maintenance/MaintenanceEvidenceManager.tsx', import.meta.url), 'utf8');
  const summary = await readFile(new URL('../src/components/maintenance/MaintenanceProgressSummary.tsx', import.meta.url), 'utf8');
  const repository = await readFile(new URL('../src/db/maintenanceDetailRepository.ts', import.meta.url), 'utf8');

  assert.match(detail, /readLocalMaintenanceDetail/);
  assert.match(detail, /listResourceItems\(db, dataScope, 'deviceType'\)/);
  assert.match(detail, /useFocusEffect\(/);
  assert.match(detail, /<MaintenanceProgressSummary/);
  assert.match(summary, /progress\.inventoryComplete/);
  assert.match(summary, /progress\.pendingAfter/);
  assert.match(summary, /projectMode/);
  assert.match(manager, /evidenceDateLabels\(item, meta\.syncStatus\)/);
  assert.match(repository, /WHERE e\.scope_key = \? AND e\.maintenance_id = \? AND e\.tombstone = 0/);
  assert.doesNotMatch(summary, /fetch\(|actionRequest\(|Google Chat|maintenance\.finalize/);
  assert.doesNotMatch(progressModule.source, /fetch\(|actionRequest\(|SELECT /);
});
