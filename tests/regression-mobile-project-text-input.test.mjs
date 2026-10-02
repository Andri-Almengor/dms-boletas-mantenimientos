import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const projectDomain = await readFile(
  new URL('../src/features/maintenance/maintenanceProject.ts', import.meta.url),
  'utf8',
);
const checklistEditor = await readFile(
  new URL('../src/components/maintenance/ProjectChecklistEditor.tsx', import.meta.url),
  'utf8',
);
const dynamicQuestion = await readFile(
  new URL('../src/components/maintenance/DynamicQuestionField.tsx', import.meta.url),
  'utf8',
);
const editorDomain = await readFile(
  new URL('../src/features/maintenance/maintenanceEditorDomain.ts', import.meta.url),
  'utf8',
);
const deviceRepo = await readFile(
  new URL('../src/db/deviceRepository.ts', import.meta.url),
  'utf8',
);

test('labels del checklist conservan espacios mientras el TextInput está activo', () => {
  assert.match(projectDomain, /preserveDraftText/);
  assert.match(projectDomain, /label: options\.preserveDraftText \? inputText\(rawLabel\) : text\(rawLabel\)/);
  assert.match(checklistEditor, /const draftOptions = \{ preserveDraftText: true \}/);
  assert.match(checklistEditor, /normalizeProjectChecklist\(value, draftOptions\)/);
  assert.match(checklistEditor, /upsertProjectChecklistGroup\([\s\S]*draftOptions/);
});

test('campos de texto de componentes relacionados no recortan espacios al renderizar', () => {
  assert.match(dynamicQuestion, /function inputText/);
  assert.match(dynamicQuestion, /value=\{inputText\(item\.nombre\)\}/);
  assert.match(dynamicQuestion, /value=\{inputText\(item\.serie\)\}/);
  assert.doesNotMatch(dynamicQuestion, /value=\{text\(item\.nombre\)\}/);
});

test('nota pendiente conserva espacios y viaja en ProyectoProgresoJSON hasta SQLite', () => {
  assert.match(projectDomain, /note: inputText\(current\.note\)/);
  assert.match(projectDomain, /\? inputText\(note\)\s*: ''/);
  assert.match(projectDomain, /\? inputText\(answer\.note\)\s*: ''/);
  assert.match(editorDomain, /ProyectoProgresoJSON: JSON\.stringify\([\s\S]*normalizeProjectProgress\(form\.projectProgress\)/);
  assert.match(editorDomain, /projectProgress: normalizeProjectProgress\([\s\S]*row\.ProyectoProgresoJSON/);
  assert.match(deviceRepo, /payload_json,[\s\S]*stringifyJson\(record\)/);
});
