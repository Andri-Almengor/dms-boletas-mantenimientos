type RecordLike = Record<string, unknown>;

const MAINTENANCE_FIELDS: Record<string, string[]> = {
  TituloMantenimiento: ['titulo'],
  TipoMantenimiento: ['tipoMantenimiento', 'maintenanceType'],
  ClienteID: ['ClienteRef', 'clienteId'],
  Cliente: ['cliente'],
  UbicacionID: ['ubicacionId'],
  Ubicacion: ['ubicacion'],
  Estado: ['estado'],
  Fecha: ['fecha'],
  FechaFinalizacion: ['fechaFinalizacion'],
  ResponsableIDsJSON: ['ResponsableIDs', 'responsables'],
  DescripcionGeneral: ['descripcion'],
  CantidadesJSON: ['counts', 'cantidades'],
  ProyectoChecklistJSON: ['projectChecklist'],
  'CantCámaras': [],
  CantPuertas: [],
  CantServidores: [],
  CantGrabadores: [],
  CantBocinas: [],
  CantSensoresPerimetrales: [],
  CantSensoresMovimiento: [],
  CantSensorRuptura: [],
  CantImpresora: [],
  CantGabinetes: [],
  CantVideoWall: [],
};

const DEVICE_FIELDS: Record<string, string[]> = {
  UbicacionEquipoID: ['ubicacionEquipoId'],
  UbicacionEquipoNombre: ['ubicacionEquipoNombre'],
  Zona: ['zona'],
  Categoria: ['TipoDispositivo', 'categoria'],
  NombreDispositivo: ['nombre'],
  TipoDispositivoID: ['tipoDispositivoId'],
  FabricanteID: ['fabricanteId'],
  Fabricante: ['fabricante'],
  ModeloID: ['modeloId'],
  Modelo: ['modelo'],
  Serie: ['serie'],
  Funcionamiento: ['funcionamiento'],
  EnUso: ['enUso'],
  Estado: ['estado'],
  Observacion: ['observacion'],
  RespuestasJSON: ['respuestas', 'answers'],
  ProyectoProgresoJSON: ['projectProgress', 'proyectoProgreso'],
  FechaTrabajo: ['fechaTrabajo'],
  TecnicoIDsJSON: ['TecnicoIDs', 'tecnicoIds'],
};

const IMAGE_FIELDS: Record<string, string[]> = {
  Tipo: ['tipo', 'type'],
  Nota: ['nota', 'note'],
  ContextoEvidencia: ['contextoEvidencia', 'evidenceContext'],
  FechaCaptura: ['fechaCaptura', 'capturedAt'],
  ProyectoDestinoTipo: ['proyectoDestinoTipo', 'projectTargetType', 'targetType'],
  ProyectoRelacionClave: ['proyectoRelacionClave', 'projectRelationKey', 'relationKey'],
  ProyectoComponenteLocalID: ['proyectoComponenteLocalId', 'projectComponentLocalId', 'componentLocalId'],
  ProyectoComponenteTipoDispositivoID: ['proyectoComponenteTipoDispositivoId', 'projectComponentTypeId'],
  ProyectoComponenteNombre: ['proyectoComponenteNombre', 'projectComponentName'],
};

function own(record: RecordLike, key: string) {
  return Object.prototype.hasOwnProperty.call(record || {}, key);
}

function read(record: RecordLike, field: string, aliases: string[] = []) {
  for (const key of [field, ...aliases]) {
    if (own(record, key)) return record[key];
  }
  return undefined;
}

function snapshot(record: RecordLike, fields: Record<string, string[]>) {
  const result: RecordLike = {};
  for (const [field, aliases] of Object.entries(fields)) {
    const value = read(record, field, aliases);
    if (value !== undefined) result[field] = value;
  }
  return result;
}

function build(
  record: RecordLike,
  entityType: string,
  entityId: string,
  maintenanceId: string,
  fields: Record<string, string[]>,
) {
  const updatedAt = String(
    record.FechaActualizacion || record.updatedAt || record.FechaCreacion || '',
  ).trim();
  if (!entityId || !updatedAt) return null;

  return {
    entityType,
    entityId,
    maintenanceId,
    updatedAt,
    snapshot: {
      ...snapshot(record, fields),
      FechaActualizacion: updatedAt,
      ActualizadoPor: record.ActualizadoPor || '',
    },
  };
}

export function maintenanceSyncBase(record: RecordLike) {
  const id = String(record.MantenimientoID || record.maintenanceId || record.id || '');
  return build(record, 'maintenance', id, id, MAINTENANCE_FIELDS);
}

export function maintenanceDeviceSyncBase(record: RecordLike, maintenanceId = '') {
  const id = String(record.EvidenciaMantenimientoID || record.deviceId || record.id || '');
  const aggregate = String(maintenanceId || record.MantenimientoRef || record.maintenanceId || '');
  return build(record, 'maintenanceDevice', id, aggregate, DEVICE_FIELDS);
}

export function maintenanceEvidenceSyncBase(record: RecordLike, maintenanceId = '') {
  const id = String(record.FotoDispositivoID || record.imageId || record.id || '');
  return build(record, 'maintenanceImage', id, String(maintenanceId || record.maintenanceId || ''), IMAGE_FIELDS);
}

export function withSyncBase(
  payload: RecordLike,
  base: RecordLike | null,
) {
  return base ? { ...payload, __syncBase: base } : payload;
}
