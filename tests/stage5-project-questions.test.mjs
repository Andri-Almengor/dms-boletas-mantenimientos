import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const questions = await readFile(new URL('../src/features/maintenance/maintenanceQuestions.ts', import.meta.url), 'utf8');
const project = await readFile(new URL('../src/features/maintenance/maintenanceProject.ts', import.meta.url), 'utf8');
const domain = await readFile(new URL('../src/features/maintenance/maintenanceEditorDomain.ts', import.meta.url), 'utf8');
const dynamicField = await readFile(new URL('../src/components/maintenance/DynamicQuestionField.tsx', import.meta.url), 'utf8');
const projectChecklist = await readFile(new URL('../src/components/maintenance/ProjectChecklistEditor.tsx', import.meta.url), 'utf8');
const projectProgress = await readFile(new URL('../src/components/maintenance/ProjectProgressEditor.tsx', import.meta.url), 'utf8');

test('preguntas dinámicas conservan modos, históricos y fallback compatible', () => {
  assert.match(questions, /MANTENIMIENTO.*PROYECTO.*AMBOS/s);
  assert.match(questions, /historical/);
  assert.match(questions, /activeAtSave/);
  assert.match(questions, /legacy:/);
  assert.match(questions, /canonicalMaintenanceCategoryName/);
});

test('campos de proyecto soportan los tipos configurables del backend', () => {
  for (const type of [
    'SI_NO',
    'OPCIONES',
    'MAC',
    'NUMERO',
    'CANTIDAD',
    'RELACION_DISPOSITIVO',
  ]) {
    assert.match(dynamicField + questions + project, new RegExp(type));
  }
  assert.match(dynamicField, /questionsForDevice/);
  assert.match(dynamicField, /relatedTypeId/);
  assert.match(dynamicField, /questionDetails/);
});

test('payload de dispositivo conserva snapshot de preguntas y progreso de proyecto', () => {
  assert.match(domain, /questionDetails/);
  assert.match(domain, /respuestasDetalle/);
  assert.match(domain, /RespuestasJSON/);
  assert.match(domain, /ProyectoProgresoJSON/);
  assert.match(domain, /projectProgress/);
});

test('checklist de proyecto y progreso usan componentes compartidos', () => {
  assert.match(projectChecklist, /upsertProjectChecklistGroup/);
  assert.match(projectChecklist, /PROJECT_CHECKLIST_RESPONSE_TYPES/);
  assert.match(projectProgress, /projectChecklistProgressForDevice/);
  assert.match(projectProgress, /setProjectProgressAnswer/);
});
