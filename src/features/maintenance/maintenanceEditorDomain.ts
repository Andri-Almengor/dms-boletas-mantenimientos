import {
  canonicalMaintenanceCategoryName,
  createEmptyChecklist,
  createEmptyMaintenanceCounts,
  getMaintenanceCategory,
  MAINTENANCE_CATEGORIES,
} from '@/features/maintenance/maintenanceCategories';
import {
  emptyProjectChecklist,
  emptyProjectProgress,
  isProjectMaintenance,
  normalizeMaintenanceType,
  normalizeProjectChecklist,
  normalizeProjectProgress,
  projectChecklistProgressForDevice,
  projectQuestionMissing,
} from '@/features/maintenance/maintenanceProject';
import {
  MaintenanceQuestion,
  parseAnswers,
} from '@/features/maintenance/maintenanceQuestions';
import {
  macAddressError,
  normalizeMacAddress,
} from '@/utils/macAddress';
import { createLocalId } from '@/utils/localId';

type RecordLike = Record<string, unknown>;

export type MaintenanceEditorForm = {
  id: string;
  title: string;
  maintenanceType: 'MANTENIMIENTO' | 'PROYECTO';
  clientId: string;
  clientName: string;
  locationId: string;
  locationName: string;
  status: string;
  date: string;
  finalizationDate: string;
  responsibleIds: string[];
  description: string;
  counts: Record<string, number>;
  projectChecklist: ReturnType<typeof normalizeProjectChecklist>;
};

export type DeviceEditorForm = {
  id: string;
  maintenanceType: 'MANTENIMIENTO' | 'PROYECTO';
  equipmentLocationId: string;
  equipmentLocationName: string;
  workDate: string;
  technicianIds: string[];
  deviceTypeId: string;
  category: string;
  manufacturerId: string;
  manufacturerName: string;
  modelId: string;
  modelName: string;
  name: string;
  serial: string;
  macAddress: string;
  functionality: string;
  inUse: string;
  status: string;
  observation: string;
  answers: Record<string, unknown>;
  questionDetails: RecordLike[];
  projectProgress: ReturnType<typeof normalizeProjectProgress>;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function parseArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(String(value || '[]'));
    if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
  } catch {
    return text(value).split(/[;,]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function parseObject(value: unknown): Record<string, unknown> {
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

export function todayInCostaRica() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Costa_Rica',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

export function createMaintenanceEditorForm(userId = ''): MaintenanceEditorForm {
  const today = todayInCostaRica();
  return {
    id: '',
    title: '',
    maintenanceType: 'MANTENIMIENTO',
    clientId: '',
    clientName: '',
    locationId: '',
    locationName: '',
    status: 'PENDIENTE',
    date: today,
    finalizationDate: today,
    responsibleIds: userId ? [userId] : [],
    description: '',
    counts: createEmptyMaintenanceCounts(),
    projectChecklist: emptyProjectChecklist(),
  };
}

export function mapMaintenanceToEditor(
  row: RecordLike,
  userId = '',
): MaintenanceEditorForm {
  const base = createMaintenanceEditorForm(userId);
  const counts = {
    ...base.counts,
    ...parseObject(row.CantidadesJSON || row.counts),
  };
  for (const category of MAINTENANCE_CATEGORIES) {
    const direct = row[category.countField];
    if (direct !== undefined && direct !== null && direct !== '') {
      counts[category.countField] = Math.max(0, Number(direct || 0));
    }
  }

  return {
    ...base,
    id: text(row.MantenimientoID || row.maintenanceId || row.id),
    title: text(row.TituloMantenimiento || row.titulo),
    maintenanceType: normalizeMaintenanceType(
      row.TipoMantenimiento || row.tipoMantenimiento,
    ) as 'MANTENIMIENTO' | 'PROYECTO',
    clientId: text(row.ClienteID || row.ClienteRef || row.clienteId),
    clientName: text(row.Cliente || row.cliente),
    locationId: text(row.UbicacionID || row.ubicacionId),
    locationName: text(row.Ubicacion || row.ubicacion),
    status: text(row.Estado || row.estado || 'PENDIENTE').toUpperCase(),
    date: text(row.Fecha || row.fecha).slice(0, 10) || base.date,
    finalizationDate: text(row.FechaFinalizacion || row.fechaFinalizacion).slice(0, 10) || base.finalizationDate,
    responsibleIds: parseArray(
      row.ResponsableIDs
        || row.responsables
        || row.ResponsableIDsJSON,
    ),
    description: text(row.DescripcionGeneral || row.descripcion),
    counts,
    projectChecklist: normalizeProjectChecklist(
      row.ProyectoChecklistJSON || row.projectChecklist,
    ),
  };
}

export function validateMaintenanceEditor(form: MaintenanceEditorForm) {
  if (!form.title.trim()) return 'El título es obligatorio.';
  if (!form.clientId) return 'Seleccione un cliente.';
  if (!form.responsibleIds.length) return 'Seleccione al menos un responsable.';
  if (isProjectMaintenance(form.maintenanceType)) {
    const blank = form.projectChecklist.groups
      .flatMap((group) => group.questions)
      .find((question) => !text(question.label));
    if (blank) {
      return 'Complete el texto de todas las preguntas del checklist de progreso o elimine las filas vacías.';
    }
  }
  return '';
}

export function maintenanceEditorPayload(
  form: MaintenanceEditorForm,
  id = form.id,
) {
  return {
    maintenanceId: id,
    MantenimientoID: id,
    TituloMantenimiento: form.title.trim(),
    TipoMantenimiento: form.maintenanceType,
    tipoMantenimiento: form.maintenanceType,
    ClienteID: form.clientId,
    ClienteRef: form.clientId,
    Cliente: form.clientName,
    UbicacionID: form.locationId,
    Ubicacion: form.locationName,
    Estado: form.status || 'PENDIENTE',
    Fecha: form.date,
    FechaFinalizacion: form.finalizationDate,
    ResponsableIDs: form.responsibleIds,
    responsables: form.responsibleIds,
    ResponsableIDsJSON: JSON.stringify(form.responsibleIds),
    DescripcionGeneral: form.description,
    CantidadesJSON: JSON.stringify(form.counts),
    counts: form.counts,
    ProyectoChecklistJSON: JSON.stringify(
      normalizeProjectChecklist(form.projectChecklist),
    ),
    projectChecklist: normalizeProjectChecklist(form.projectChecklist),
    ...form.counts,
  };
}

export function selectedMaintenanceCategories(
  counts: Record<string, number>,
) {
  return MAINTENANCE_CATEGORIES.filter(
    (category) => Number(counts[category.countField] || 0) > 0,
  );
}

export function expectedMaintenanceTotal(counts: Record<string, number>) {
  return Object.values(counts).reduce(
    (sum, value) => sum + Math.max(0, Number(value || 0)),
    0,
  );
}

export function createDeviceEditorForm(
  maintenanceType: unknown,
): DeviceEditorForm {
  const normalizedType = normalizeMaintenanceType(maintenanceType) as 'MANTENIMIENTO' | 'PROYECTO';
  const category = 'Cámara';
  return {
    id: '',
    maintenanceType: normalizedType,
    equipmentLocationId: '',
    equipmentLocationName: '',
    workDate: todayInCostaRica(),
    technicianIds: [],
    deviceTypeId: '',
    category,
    manufacturerId: '',
    manufacturerName: '',
    modelId: '',
    modelName: '',
    name: '',
    serial: '',
    macAddress: '',
    functionality: normalizedType === 'PROYECTO' ? 'No aplica' : '',
    inUse: normalizedType === 'PROYECTO' ? 'No aplica' : '',
    status: 'Pendiente',
    observation: '',
    answers: normalizedType === 'PROYECTO' ? {} : createEmptyChecklist(category),
    questionDetails: [],
    projectProgress: emptyProjectProgress(),
  };
}

export function mapDeviceToEditor(
  row: RecordLike,
  maintenanceType: unknown,
): DeviceEditorForm {
  const base = createDeviceEditorForm(maintenanceType);
  const category = canonicalMaintenanceCategoryName(
    row.TipoDispositivo || row.Categoria || row.categoria,
  );
  return {
    ...base,
    id: text(row.EvidenciaMantenimientoID || row.deviceId || row.id),
    equipmentLocationId: text(row.UbicacionEquipoID || row.ubicacionEquipoId),
    equipmentLocationName: text(
      row.UbicacionEquipoNombre || row.ubicacionEquipoNombre || row.Zona || row.zona,
    ),
    workDate: text(row.FechaTrabajo || row.fechaTrabajo).slice(0, 10) || base.workDate,
    technicianIds: parseArray(row.TecnicoIDs || row.tecnicoIds || row.TecnicoIDsJSON),
    deviceTypeId: text(row.TipoDispositivoID || row.tipoDispositivoId),
    category,
    manufacturerId: text(row.FabricanteID || row.fabricanteId),
    manufacturerName: text(row.Fabricante || row.fabricante),
    modelId: text(row.ModeloID || row.modeloId),
    modelName: text(row.Modelo || row.modelo),
    name: text(row.NombreDispositivo || row.nombre),
    serial: text(row.Serie || row.serie),
    macAddress: normalizeMacAddress(row.DireccionMAC || row.macAddress),
    functionality: text(row.Funcionamiento || row.funcionamiento || base.functionality),
    inUse: text(row.EnUso || row.enUso || base.inUse),
    status: text(row.Estado || row.estado || 'Pendiente'),
    observation: text(row.Observacion || row.observacion),
    answers: parseAnswers(row.respuestas || row.RespuestasJSON),
    questionDetails: Array.isArray(row.questionDetails)
      ? row.questionDetails as RecordLike[]
      : (() => {
          const raw = parseObject(row.RespuestasJSON);
          return Array.isArray(raw.__preguntas) ? raw.__preguntas as RecordLike[] : [];
        })(),
    projectProgress: normalizeProjectProgress(
      row.ProyectoProgresoJSON || row.projectProgress,
    ),
  };
}

function activeRequiredQuestion(question: MaintenanceQuestion) {
  if (question.historical || question.activeAtSave === false) return false;
  const required = typeof question.config.required === 'boolean'
    ? question.config.required
    : true;
  return required;
}

function questionHasValue(question: MaintenanceQuestion, value: unknown) {
  if (question.responseType === 'RELACION_DISPOSITIVO') {
    return !projectQuestionMissing(question as unknown as RecordLike, value);
  }
  if (question.responseType === 'NUMERO' || question.responseType === 'CANTIDAD') {
    return value !== '' && value !== null && value !== undefined;
  }
  return Boolean(text(value));
}

export function deviceCompletion(
  form: DeviceEditorForm,
  questions: MaintenanceQuestion[],
  projectChecklist: unknown,
) {
  const missing: string[] = [];
  for (const question of questions.filter(activeRequiredQuestion)) {
    if (!questionHasValue(question, form.answers[question.key])) {
      missing.push(question.label || question.key);
    }
  }

  if (isProjectMaintenance(form.maintenanceType)) {
    const progress = projectChecklistProgressForDevice(
      projectChecklist,
      {
        tipoDispositivoId: form.deviceTypeId,
        categoria: form.category,
        projectProgress: form.projectProgress,
      },
    );
    if (!progress.complete) missing.push('Checklist de progreso');
  } else {
    if (!form.functionality) missing.push('Funcionamiento');
    if (!form.inUse) missing.push('En uso');
  }

  return { complete: missing.length === 0, missing };
}

export function effectiveDeviceState(
  form: DeviceEditorForm,
  questions: MaintenanceQuestion[],
  projectChecklist: unknown,
) {
  if (text(form.status) === 'PENDIENTE') return 'PENDIENTE';
  const completion = deviceCompletion(form, questions, projectChecklist);
  if (!completion.complete) return 'Pendiente';
  const current = text(form.status);
  if (!current || current.toLowerCase() === 'pendiente') return 'Correcto';
  return current;
}

export function validateDeviceEditor(
  form: DeviceEditorForm,
  questions: MaintenanceQuestion[],
  projectChecklist: unknown,
) {
  if (!form.equipmentLocationId) return 'Seleccione la ubicación del equipo.';
  if (!form.category) return 'Seleccione el tipo de dispositivo.';
  if (!form.name.trim()) return 'El nombre del dispositivo es obligatorio.';
  const macError = macAddressError(form.macAddress);
  if (macError) return macError;

  if (isProjectMaintenance(form.maintenanceType)) {
    const missing = questions
      .filter((question) => question.activeAtSave !== false)
      .filter((question) => projectQuestionMissing(
        question as unknown as RecordLike,
        form.answers[question.key],
      ));
    if (missing.length) {
      return `Complete el campo obligatorio “${missing[0].label || missing[0].key}”.`;
    }
    const progress = projectChecklistProgressForDevice(
      projectChecklist,
      {
        tipoDispositivoId: form.deviceTypeId,
        categoria: form.category,
        projectProgress: form.projectProgress,
      },
    );
    if (!progress.complete) {
      return 'Complete el checklist de progreso configurado para este dispositivo.';
    }
  }
  return '';
}

export function deviceEditorPayload(
  form: DeviceEditorForm,
  maintenanceId: string,
  questions: MaintenanceQuestion[],
  projectChecklist: unknown,
) {
  const state = effectiveDeviceState(form, questions, projectChecklist);
  const questionDetails = questions.map((question) => ({
    questionId: question.questionId,
    typeId: question.typeId || form.deviceTypeId,
    key: question.key,
    label: question.label,
    order: question.order,
    responseType: question.responseType,
    appliesTo: question.appliesTo,
    relatedTypeId: question.relatedTypeId,
    config: question.config,
    value: form.answers[question.key] ?? '',
    activeAtSave: question.activeAtSave !== false && !question.historical,
    historical: Boolean(question.historical),
  }));
  const answers = {
    ...form.answers,
    __preguntas: questionDetails,
  };

  return {
    maintenanceId,
    MantenimientoID: maintenanceId,
    MantenimientoRef: maintenanceId,
    deviceId: form.id,
    EvidenciaMantenimientoID: form.id,
    TipoMantenimiento: form.maintenanceType,
    tipoMantenimiento: form.maintenanceType,
    UbicacionEquipoID: form.equipmentLocationId,
    ubicacionEquipoId: form.equipmentLocationId,
    UbicacionEquipoNombre: form.equipmentLocationName,
    ubicacionEquipoNombre: form.equipmentLocationName,
    Zona: form.equipmentLocationName,
    zona: form.equipmentLocationName,
    FechaTrabajo: form.workDate,
    fechaTrabajo: form.workDate,
    TecnicoIDs: form.technicianIds,
    tecnicoIds: form.technicianIds,
    TecnicoIDsJSON: JSON.stringify(form.technicianIds),
    TipoDispositivoID: form.deviceTypeId,
    TipoDispositivo: form.category,
    Categoria: form.category,
    FabricanteID: form.manufacturerId,
    Fabricante: form.manufacturerName,
    ModeloID: form.modelId,
    Modelo: form.modelName,
    NombreDispositivo: form.name.trim(),
    Serie: form.serial.trim(),
    DireccionMAC: normalizeMacAddress(form.macAddress),
    macAddress: normalizeMacAddress(form.macAddress),
    Funcionamiento: form.functionality,
    EnUso: form.inUse,
    Estado: state,
    Observacion: form.observation,
    respuestas: answers,
    answers,
    questionDetails,
    respuestasDetalle: questionDetails,
    RespuestasJSON: JSON.stringify(answers),
    ProyectoProgresoJSON: JSON.stringify(
      normalizeProjectProgress(form.projectProgress),
    ),
    projectProgress: normalizeProjectProgress(form.projectProgress),
  };
}

export function categoryCountForDevice(
  counts: Record<string, number>,
  category: string,
) {
  const field = getMaintenanceCategory(category).countField;
  return field ? Number(counts[field] || 0) : 0;
}

export function newDeviceId() {
  return createLocalId('dispositivo');
}
