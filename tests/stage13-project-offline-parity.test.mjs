import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadModule(path, modules = {}) {
  const source = await readFile(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const exports = {};
  new Function('require', 'exports', code)(
    (name) => {
      if (Object.hasOwn(modules, name)) return modules[name];
      throw new Error(`Import inesperado: ${name}`);
    },
    exports,
  );
  return { exports, source };
}

let id = 0;
const localIds = { createLocalId: (type) => `local-${type}-${++id}` };
const categories = await loadModule('../src/features/maintenance/maintenanceCategories.ts');
const project = await loadModule('../src/features/maintenance/maintenanceProject.ts', {
  '@/utils/localId': localIds,
});
const questions = await loadModule('../src/features/maintenance/maintenanceQuestions.ts', {
  '@/features/maintenance/maintenanceCategories': categories.exports,
  '@/features/maintenance/maintenanceProject': project.exports,
});
const evidence = await loadModule('../src/features/maintenance/maintenanceEvidence.ts', {
  '@/features/maintenance/maintenanceProject': project.exports,
  '@/features/maintenance/maintenanceQuestions': questions.exports,
});

const {
  normalizeMaintenanceQuestion,
  questionsForDevice,
  questionDetailsForDevice,
  parseAnswers,
} = questions.exports;
const {
  toggleProjectRelation,
  resizeProjectRelation,
  normalizeProjectRelationValue,
  setProjectProgressAnswer,
  projectChecklistProgressForDevice,
} = project.exports;

const camera = {
  TipoDispositivoID: 'cam1',
  TipoDispositivo: 'Cámara',
};
const door = {
  TipoDispositivoID: 'door1',
  TipoDispositivo: 'Puertas',
};
const relationQuestion = normalizeMaintenanceQuestion({
  PreguntaDispositivoID: 'q1',
  TipoDispositivoID: 'door1',
  TipoDispositivo: 'Puertas',
  Clave: 'lectores',
  Pregunta: '¿La puerta tiene lectores?',
  TipoRespuesta: 'RELACION_DISPOSITIVO',
  TipoDispositivoRelacionadoID: 'reader1',
  AplicaModo: 'PROYECTO',
  ConfiguracionJSON: JSON.stringify({ required: false, fields: ['cantidad', 'nombre', 'modelo'] }),
});
const childQuestion = normalizeMaintenanceQuestion({
  PreguntaDispositivoID: 'q2',
  TipoDispositivoID: 'reader1',
  TipoDispositivo: 'Lector',
  Clave: 'tipo',
  Pregunta: 'Tipo de lector',
  TipoRespuesta: 'OPCIONES',
  AplicaModo: 'PROYECTO',
  ConfiguracionJSON: JSON.stringify({ required: false, options: ['Entrada', 'Salida'] }),
});

test('etapa 13: relación activa crea componentes estables con mismo contrato web', () => {
  const initial = toggleProjectRelation(null, true, {
    relatedTypeId: 'reader1',
    relatedTypeName: 'Lector',
  });
  const relation = resizeProjectRelation(initial, 2, {
    relatedTypeId: 'reader1',
    relatedTypeName: 'Lector',
  });
  assert.equal(relation.enabled, true);
  assert.equal(relation.items.length, 2);
  assert.equal(relation.items[0].categoria, 'Lector');
  assert.equal(relation.items[0].tipoDispositivoId, 'reader1');
  assert.notEqual(relation.items[0].localId, relation.items[1].localId);
  const normalized = normalizeProjectRelationValue(relation);
  assert.equal(normalized.items[0].localId, relation.items[0].localId);
  assert.equal(normalized.items[1].localId, relation.items[1].localId);
});

test('etapa 13: preguntas específicas de dispositivo y relaciones comparten el catálogo', () => {
  assert.equal(questionsForDevice([relationQuestion, childQuestion], door, 'PROYECTO')[0].key, 'lectores');
  assert.equal(questionsForDevice([relationQuestion, childQuestion], {
    tipoDispositivoId: 'reader1', categoria: 'Lector',
  }, 'PROYECTO')[0].key, 'tipo');
  assert.equal(questionsForDevice([relationQuestion, childQuestion], camera, 'PROYECTO').length, 0);
  assert.equal(questionsForDevice([relationQuestion, childQuestion], door, 'MANTENIMIENTO').length, 4);
});

test('etapa 13: conserva preguntas históricas en snapshots sin catálogo offline', () => {
  const snapshot = [{
    questionId: 'qold', key: 'lector_emergencia', label: '¿Puerta de emergencia?',
    responseType: 'SI_NO', appliesTo: 'PROYECTO', activeAtSave: true,
  }];
  const saved = {
    ...door,
    respuestas: {},
    RespuestasJSON: JSON.stringify({
      lector_emergencia: 'Sí',
      __preguntas: snapshot,
    }),
  };
  assert.deepEqual(questionDetailsForDevice(saved), snapshot);
  assert.equal(questionsForDevice([], saved, 'PROYECTO')[0].label, '¿Puerta de emergencia?');
  assert.equal(questions.exports.deviceSavedAnswers(saved).lector_emergencia, 'Sí');
  assert.equal(questionsForDevice([], saved, 'PROYECTO')[0].historical, true);
  assert.equal(parseAnswers(saved.RespuestasJSON).lector_emergencia, 'Sí');
  const usingDetail = { ...saved, respuestasDetalle: snapshot };
  assert.deepEqual(questionDetailsForDevice(usingDetail), snapshot);
});

test('etapa 13: asignación de fotos distingue dispositivo principal y componentes', () => {
  const relation = resizeProjectRelation(toggleProjectRelation(null, true, {
    relatedTypeId: 'reader1', relatedTypeName: 'Lector',
  }), 2);
  const saved = {
    ...door,
    respuestas: { lectores: relation, __preguntas: [relationQuestion] },
  };
  const targets = evidence.exports.projectEvidenceTargets(saved);
  assert.equal(targets.length, 3);
  assert.equal(targets[0].value, 'DISPOSITIVO');
  assert.equal(targets[1].componentLocalId, relation.items[0].localId);
  const image = evidence.exports.projectEvidenceTargetPatch(targets[1]);
  assert.equal(evidence.exports.projectEvidenceTargetValue(image), targets[1].value);
  assert.equal(evidence.exports.projectEvidenceTargetValue({ Tipo: 'Proyecto' }), 'DISPOSITIVO');
});

test('etapa 13: las notas de checklist PENDIENTE sobreviven a normalización y regreso offline', () => {
  const checklist = { version: 1, groups: [{
    id: 'type:door1', typeId: 'door1', typeName: 'Puertas', questions: [
      { id: 'q-a', label: '¿Está instalado?', responseType: 'SI_NO' },
      { id: 'q-b', label: 'Configuración de lectora', responseType: 'PENDIENTE_REALIZADO' },
    ],
  }] };
  let progress = setProjectProgressAnswer(null, { id: 'q-a', responseType: 'SI_NO' }, 'Sí', '');
  progress = setProjectProgressAnswer(progress, { id: 'q-b', responseType: 'PENDIENTE_REALIZADO' }, 'PENDIENTE', 'Falta conectar cable de red');
  const saved = JSON.stringify(progress);
  const current = projectChecklistProgressForDevice(checklist, {
    tipoDispositivoId: 'door1', categoria: 'Puertas', ProyectoProgresoJSON: saved,
  });
  assert.equal(current.total, 2);
  assert.equal(current.completed, 1);
  assert.equal(current.items[1].value, 'PENDIENTE');
  assert.equal(current.items[1].note, 'Falta conectar cable de red');
  assert.equal(current.percent, 50);
});

test('etapa 13: componente visual solo consulta caché y muestra relaciones/checklist', async () => {
  const component = await readFile(
    new URL('../src/components/maintenance/ProjectDeviceSections.tsx', import.meta.url), 'utf8',
  );
  const detail = await readFile(
    new URL('../src/app/maintenance/[maintenanceId]/device/[deviceId].tsx', import.meta.url), 'utf8',
  );
  const editor = await readFile(
    new URL('../src/components/maintenance/DeviceEditorScreen.tsx', import.meta.url), 'utf8',
  );
  const domain = await readFile(
    new URL('../src/features/maintenance/maintenanceEditorDomain.ts', import.meta.url), 'utf8',
  );

  assert.match(component, /questionsForDevice\(/);
  assert.match(component, /projectChecklistProgressForDevice\(/);
  assert.match(component, /normalizeProjectRelationValue\(/);
  assert.match(component, /projectEvidenceTargetValue\(/);
  assert.match(component, /item\.questionDetails|questionsForDevice\(\s*questions,\s*item/s);
  assert.match(component, /accessibilityState=\{\{ expanded/);
  assert.match(detail, /readLocalDeviceDetail\(/);
  assert.match(detail, /listResourceItems\(db, dataScope, 'maintenanceConfig'\)/);
  assert.match(detail, /listResourceItems\(db, dataScope, 'maintenanceQuestion'\)/);
  assert.match(detail, /useFocusEffect\(/);
  assert.match(detail, /<ProjectDeviceSections/);
  assert.match(detail, /<MaintenanceEvidenceManager/);
  assert.match(detail, /onChanged=\\{load\\}/);
  const manager = await readFile(
    new URL('../src/components/maintenance/MaintenanceEvidenceManager.tsx', import.meta.url), 'utf8',
  );
  assert.match(manager, /onChanged\\?: \\(\\) => void \\| Promise<void>/);
  assert.match(manager, /Promise\\.resolve\\(onChanged\\?\\.\\(\\)\\)/);
  assert.match(editor, /configuredQuestions\.length/);
  assert.match(editor, /'maintenanceQuestion'/);
  assert.match(domain, /questionDetailsForDevice\(row\)/);
  assert.doesNotMatch(component, /fetch\(|actionRequest\(|saveLocalDevice|deleteLocalDevice/);
  assert.doesNotMatch(detail, /maintenance\.finalize|maintenance\.signature/);
});

test('etapa 13: el PR anterior conserva creación masiva y progreso', async () => {
  const detail = await readFile(
    new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8',
  );
  assert.match(detail, /<MaintenanceProgressSummary/);
  assert.match(detail, /openBulkDevices\(section\)/);
  assert.match(detail, /openBulkDevices\(\)/);
});
