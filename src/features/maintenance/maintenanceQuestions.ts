import {
  canonicalMaintenanceCategoryName,
  getMaintenanceCategory,
  normalizeText,
} from '@/features/maintenance/maintenanceCategories';
import { isProjectMaintenance } from '@/features/maintenance/maintenanceProject';

export type MaintenanceQuestion = {
  questionId: string;
  typeId: string;
  typeName: string;
  key: string;
  label: string;
  order: number;
  responseType: string;
  appliesTo: string;
  relatedTypeId: string;
  config: Record<string, unknown>;
  value?: unknown;
  activeAtSave?: boolean;
  historical?: boolean;
};

type RecordLike = Record<string, unknown>;

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function parseConfig(value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(String(value || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function normalizeMode(value: unknown) {
  const mode = clean(value || 'MANTENIMIENTO').toUpperCase();
  return ['MANTENIMIENTO', 'PROYECTO', 'AMBOS'].includes(mode)
    ? mode
    : 'MANTENIMIENTO';
}

export function normalizeMaintenanceQuestion(
  row: RecordLike = {},
  index = 0,
): MaintenanceQuestion {
  return {
    questionId: clean(row.questionId || row.id || row.PreguntaDispositivoID),
    typeId: clean(row.typeId || row.TipoDispositivoID),
    typeName: clean(row.typeName || row.TipoDispositivo),
    key: clean(row.key || row.Clave),
    label: clean(row.label || row.Pregunta || row.key || row.Clave),
    order: Number(row.order ?? row.Orden ?? (index + 1) * 10),
    responseType: clean(row.responseType || row.TipoRespuesta || 'SI_NO').toUpperCase(),
    appliesTo: normalizeMode(row.appliesTo || row.AplicaModo),
    relatedTypeId: clean(row.relatedTypeId || row.TipoDispositivoRelacionadoID),
    config: parseConfig(row.config || row.ConfiguracionJSON),
    value: row.value,
    activeAtSave: row.activeAtSave !== false,
    historical: Boolean(row.historical || row.activeAtSave === false),
  };
}

export function questionsForDevice(
  questions: MaintenanceQuestion[],
  device: RecordLike,
  maintenanceType: unknown,
) {
  const typeId = clean(device.tipoDispositivoId || device.TipoDispositivoID);
  const category = canonicalMaintenanceCategoryName(
    device.categoria || device.TipoDispositivo || device.Categoria,
  );
  const identity = normalizeText(category);
  const mode = isProjectMaintenance(maintenanceType) ? 'PROYECTO' : 'MANTENIMIENTO';

  const candidates = questions.filter((question) => {
    const exact = Boolean(typeId && question.typeId === typeId);
    const equivalent = Boolean(
      question.typeName
      && normalizeText(canonicalMaintenanceCategoryName(question.typeName)) === identity,
    );
    const applies = question.appliesTo === 'AMBOS' || question.appliesTo === mode;
    return applies && (exact || equivalent);
  });

  const seen = new Set<string>();
  const active = candidates
    .filter((question) => {
      if (!question.key || seen.has(question.key)) return false;
      seen.add(question.key);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'es'));

  const historical = Array.isArray(device.questionDetails)
    ? (device.questionDetails as RecordLike[])
      .map(normalizeMaintenanceQuestion)
      .filter((question) => question.key && !active.some((entry) => entry.key === question.key))
    : [];

  if (active.length || historical.length) {
    const answers = parseAnswers(device.respuestas || device.RespuestasJSON);
    return [...active.map((question) => ({
      ...question,
      value: answers[question.key] ?? question.value ?? '',
      historical: false,
      activeAtSave: true,
    })), ...historical.map((question) => ({
      ...question,
      value: answers[question.key] ?? question.value ?? '',
      historical: true,
      activeAtSave: false,
    }))];
  }

  if (isProjectMaintenance(maintenanceType)) return [];

  return getMaintenanceCategory(category).questions.map(([key, label], index) => ({
    questionId: `legacy:${key}`,
    typeId,
    typeName: category,
    key,
    label,
    order: (index + 1) * 10,
    responseType: 'SI_NO',
    appliesTo: 'MANTENIMIENTO',
    relatedTypeId: '',
    config: { required: true },
    value: parseAnswers(device.respuestas || device.RespuestasJSON)[key] ?? '',
    activeAtSave: true,
    historical: false,
  }));
}

export function parseAnswers(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const { __preguntas: _ignored, ...answers } = value as Record<string, unknown>;
    return answers;
  }
  try {
    const parsed = JSON.parse(String(value || '{}'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const { __preguntas: _ignored, ...answers } = parsed as Record<string, unknown>;
    return answers;
  } catch {
    return {};
  }
}

export function updateQuestionAnswer(
  device: RecordLike,
  question: MaintenanceQuestion,
  value: unknown,
) {
  const answers = {
    ...parseAnswers(device.respuestas || device.RespuestasJSON),
    [question.key]: value,
  };
  const details = Array.isArray(device.questionDetails)
    ? [...device.questionDetails as RecordLike[]]
    : [];
  const index = details.findIndex((item) => clean(item.key || item.Clave) === question.key);
  const next = {
    questionId: question.questionId,
    typeId: question.typeId || clean(device.tipoDispositivoId),
    key: question.key,
    label: question.label,
    order: question.order,
    responseType: question.responseType,
    appliesTo: question.appliesTo,
    relatedTypeId: question.relatedTypeId,
    config: question.config,
    value,
    activeAtSave: !question.historical,
    historical: Boolean(question.historical),
  };
  if (index >= 0) details[index] = { ...details[index], ...next };
  else details.push(next);
  return { ...device, respuestas: answers, questionDetails: details };
}
