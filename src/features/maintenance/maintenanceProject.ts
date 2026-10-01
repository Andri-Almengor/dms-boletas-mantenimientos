import { createLocalId } from '@/utils/localId';

export const PROJECT_CHECKLIST_RESPONSE_TYPES = Object.freeze({
  YES_NO: 'SI_NO',
  PROGRESS: 'PENDIENTE_REALIZADO',
});

type RecordLike = Record<string, unknown>;

function text(value: unknown) {
  return String(value ?? '').trim();
}

function normalized(value: unknown) {
  return text(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseObject(value: unknown, fallback: RecordLike = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as RecordLike;
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as RecordLike
      : fallback;
  } catch {
    return fallback;
  }
}

function responseType(value: unknown) {
  return text(value).toUpperCase() === PROJECT_CHECKLIST_RESPONSE_TYPES.YES_NO
    ? PROJECT_CHECKLIST_RESPONSE_TYPES.YES_NO
    : PROJECT_CHECKLIST_RESPONSE_TYPES.PROGRESS;
}

export function normalizeMaintenanceType(value: unknown) {
  return text(value).toUpperCase() === 'PROYECTO' ? 'PROYECTO' : 'MANTENIMIENTO';
}

export function isProjectMaintenance(value: unknown) {
  return normalizeMaintenanceType(value) === 'PROYECTO';
}

export function emptyProjectChecklist() {
  return { version: 1, groups: [] as RecordLike[] };
}

export function emptyProjectProgress() {
  return { version: 1, answers: {} as Record<string, { value: string; note: string }> };
}

export function projectChecklistGroupIdentity(input: RecordLike = {}) {
  const typeId = text(input.typeId || input.TipoDispositivoID);
  if (typeId) return `type:${typeId}`;
  const countField = text(input.countField);
  if (countField) return `count:${countField}`;
  return `name:${normalized(input.typeName || input.label || input.key || input.categoria || input.TipoDispositivo)}`;
}

function normalizeQuestion(item: RecordLike = {}, index = 0) {
  return {
    id: text(item.id || item.questionId) || createLocalId('project-check'),
    label: text(item.label || item.Pregunta),
    responseType: responseType(item.responseType || item.TipoRespuesta),
    order: Number(item.order ?? item.Orden ?? (index + 1) * 10),
  };
}

function normalizeGroup(item: RecordLike = {}, index = 0) {
  const typeId = text(item.typeId || item.TipoDispositivoID);
  const typeName = text(item.typeName || item.label || item.key || item.TipoDispositivo);
  const countField = text(item.countField);
  const group = {
    id: text(item.id) || projectChecklistGroupIdentity({ typeId, typeName, countField }),
    typeId,
    typeName,
    countField,
    order: Number(item.order ?? index * 10),
    questions: (Array.isArray(item.questions) ? item.questions : [])
      .map((question, qIndex) => normalizeQuestion(question as RecordLike, qIndex))
      .sort((left, right) => left.order - right.order || left.label.localeCompare(right.label, 'es')),
  };
  return typeId || typeName || countField ? group : null;
}

export function normalizeProjectChecklist(value: unknown) {
  const parsed = parseObject(value, emptyProjectChecklist());
  return {
    version: 1,
    groups: (Array.isArray(parsed.groups) ? parsed.groups : [])
      .map((group, index) => normalizeGroup(group as RecordLike, index))
      .filter(Boolean) as NonNullable<ReturnType<typeof normalizeGroup>>[],
  };
}

export function projectChecklistGroupForCategory(
  checklist: unknown,
  category: RecordLike = {},
) {
  const schema = normalizeProjectChecklist(checklist);
  const target = projectChecklistGroupIdentity(category);
  return schema.groups.find((group) => group.id === target)
    || schema.groups.find((group) => group.typeId && group.typeId === text(category.typeId || category.TipoDispositivoID))
    || schema.groups.find((group) => normalized(group.typeName) === normalized(category.typeName || category.label || category.key))
    || null;
}

export function projectChecklistGroupForDevice(
  checklist: unknown,
  device: RecordLike = {},
) {
  return projectChecklistGroupForCategory(checklist, {
    typeId: device.tipoDispositivoId || device.TipoDispositivoID,
    typeName: device.categoria || device.TipoDispositivo || device.Categoria,
  });
}

export function upsertProjectChecklistGroup(
  checklist: unknown,
  category: RecordLike,
  updater: (group: RecordLike & { questions: RecordLike[] }) => RecordLike & { questions: RecordLike[] },
) {
  const schema = normalizeProjectChecklist(checklist);
  const id = projectChecklistGroupIdentity(category);
  const existing = projectChecklistGroupForCategory(schema, category) || {
    id,
    typeId: text(category.typeId),
    typeName: text(category.label || category.key || category.typeName),
    countField: text(category.countField),
    order: schema.groups.length * 10,
    questions: [],
  };
  const next = updater(existing);
  const groups = schema.groups.filter((group) => group.id !== existing.id && group.id !== id);
  if (next && Array.isArray(next.questions) && next.questions.length) {
    const normalizedGroup = normalizeGroup({ ...next, id }, groups.length);
    if (normalizedGroup) groups.push(normalizedGroup);
  }
  return normalizeProjectChecklist({ version: 1, groups });
}

export function createProjectChecklistQuestion(
  type = PROJECT_CHECKLIST_RESPONSE_TYPES.PROGRESS,
) {
  return {
    id: createLocalId('project-check'),
    label: '',
    responseType: responseType(type),
    order: Date.now(),
  };
}

function normalizeProgressValue(value: unknown, type: string) {
  const current = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  if (type === PROJECT_CHECKLIST_RESPONSE_TYPES.YES_NO) {
    if (['SI', 'YES', 'TRUE', '1'].includes(current)) return 'SI';
    if (['NO', 'FALSE', '0'].includes(current)) return 'NO';
    return '';
  }
  if (['REALIZADO', 'FINALIZADO', 'COMPLETO', 'COMPLETADO', 'DONE'].includes(current)) return 'REALIZADO';
  return 'PENDIENTE';
}

export function normalizeProjectProgress(value: unknown) {
  const parsed = parseObject(value, emptyProjectProgress());
  const answers = parseObject(parsed.answers, {});
  return {
    version: 1,
    answers: Object.fromEntries(Object.entries(answers).map(([key, raw]) => {
      const current = parseObject(raw, { value: raw as unknown });
      return [key, { value: text(current.value), note: text(current.note) }];
    })),
  };
}

export function setProjectProgressAnswer(
  progress: unknown,
  question: RecordLike,
  value: unknown,
  note: unknown,
) {
  const current = normalizeProjectProgress(progress);
  const type = responseType(question.responseType);
  const normalizedValue = normalizeProgressValue(value, type);
  const normalizedNote = type === PROJECT_CHECKLIST_RESPONSE_TYPES.PROGRESS && normalizedValue === 'PENDIENTE'
    ? text(note)
    : '';
  return {
    version: 1,
    answers: {
      ...current.answers,
      [String(question.id)]: { value: normalizedValue, note: normalizedNote },
    },
  };
}

export function projectChecklistProgressForDevice(
  checklist: unknown,
  device: RecordLike = {},
  progress: unknown = device.projectProgress || device.ProyectoProgresoJSON,
) {
  const group = projectChecklistGroupForDevice(checklist, device);
  const current = normalizeProjectProgress(progress);
  const questions = group?.questions || [];
  const items = questions.map((question) => {
    const type = responseType(question.responseType);
    const answer = current.answers[question.id] || {};
    const value = normalizeProgressValue(answer.value, type);
    const completed = type === PROJECT_CHECKLIST_RESPONSE_TYPES.YES_NO
      ? value === 'SI' || value === 'NO'
      : value === 'REALIZADO';
    return {
      ...question,
      value,
      note: type === PROJECT_CHECKLIST_RESPONSE_TYPES.PROGRESS && value === 'PENDIENTE'
        ? text(answer.note)
        : '',
      completed,
    };
  });
  const completed = items.filter((item) => item.completed).length;
  return {
    group,
    items,
    total: items.length,
    completed,
    pending: Math.max(0, items.length - completed),
    percent: items.length ? Math.round((completed / items.length) * 100) : 100,
    complete: items.length === 0 || completed === items.length,
  };
}

export function createProjectRelationItem(input: {
  relatedTypeId?: string;
  relatedTypeName?: string;
  index?: number;
} = {}) {
  const index = Number(input.index || 0);
  return {
    localId: createLocalId('componente'),
    tipoDispositivoId: text(input.relatedTypeId),
    categoria: text(input.relatedTypeName),
    fabricanteId: '',
    fabricante: '',
    modeloId: '',
    modelo: '',
    nombre: text(input.relatedTypeName) ? `${text(input.relatedTypeName)} ${index + 1}` : '',
    serie: '',
    macAddress: '',
    respuestas: {},
    questionDetails: [],
  };
}

export function normalizeProjectRelationValue(
  value: unknown,
  input: { relatedTypeId?: string; relatedTypeName?: string } = {},
) {
  const parsed = parseObject(value, {});
  const enabled = parsed.enabled === true || text(parsed.enabled).toLowerCase() === 'true';
  const sourceItems = Array.isArray(parsed.items) ? parsed.items : [];
  const items = sourceItems.map((raw, index) => {
    const item = raw && typeof raw === 'object' && !Array.isArray(raw)
      ? raw as RecordLike
      : {};
    return {
      ...createProjectRelationItem({ ...input, index }),
      ...item,
      localId: text(item.localId) || createLocalId('componente'),
      tipoDispositivoId: text(item.tipoDispositivoId || item.TipoDispositivoID || input.relatedTypeId),
      categoria: text(item.categoria || item.TipoDispositivo || item.Categoria || input.relatedTypeName),
      respuestas: parseObject(item.respuestas, {}),
      questionDetails: Array.isArray(item.questionDetails) ? item.questionDetails : [],
    };
  });
  const quantity = Math.max(0, Number(parsed.quantity ?? parsed.cantidad ?? items.length) || 0);
  return {
    enabled,
    relatedTypeId: text(parsed.relatedTypeId || input.relatedTypeId),
    relatedTypeName: text(parsed.relatedTypeName || input.relatedTypeName),
    quantity: enabled ? Math.max(quantity, items.length || 1) : 0,
    items: enabled ? items : [],
  };
}

export function resizeProjectRelation(
  value: unknown,
  quantity: number,
  input: { relatedTypeId?: string; relatedTypeName?: string } = {},
) {
  const relation = normalizeProjectRelationValue(value, input);
  const target = Math.max(0, Math.min(100, Number(quantity || 0)));
  const items = relation.items.slice(0, target);
  while (items.length < target) {
    items.push(createProjectRelationItem({
      relatedTypeId: relation.relatedTypeId || input.relatedTypeId,
      relatedTypeName: relation.relatedTypeName || input.relatedTypeName,
      index: items.length,
    }));
  }
  return { ...relation, enabled: target > 0, quantity: target, items };
}

export function toggleProjectRelation(
  value: unknown,
  enabled: boolean,
  input: { relatedTypeId?: string; relatedTypeName?: string } = {},
) {
  const relation = normalizeProjectRelationValue(value, input);
  if (!enabled) return { ...relation, enabled: false, quantity: 0, items: [] };
  return resizeProjectRelation(
    { ...relation, enabled: true },
    Math.max(1, relation.quantity || relation.items.length || 1),
    input,
  );
}

export function projectQuestionConfig(question: RecordLike = {}) {
  return parseObject(question.config || question.ConfiguracionJSON, {});
}

export function projectQuestionRequired(question: RecordLike = {}) {
  const config = projectQuestionConfig(question);
  if (typeof config.required === 'boolean') return config.required;
  return text(question.responseType || question.TipoRespuesta || 'SI_NO').toUpperCase() !== 'RELACION_DISPOSITIVO';
}

export function projectAnswerHasValue(question: RecordLike, value: unknown) {
  const type = text(question.responseType || question.TipoRespuesta || 'SI_NO').toUpperCase();
  if (type === 'RELACION_DISPOSITIVO') {
    const relation = normalizeProjectRelationValue(value, {
      relatedTypeId: text(question.relatedTypeId || question.TipoDispositivoRelacionadoID),
    });
    return relation.enabled && relation.items.length > 0;
  }
  if (type === 'CANTIDAD' || type === 'NUMERO') {
    return value !== '' && value !== null && value !== undefined;
  }
  return text(value) !== '';
}

export function projectQuestionMissing(question: RecordLike, value: unknown) {
  return projectQuestionRequired(question) && !projectAnswerHasValue(question, value);
}
