import type { ImagePickerAsset } from 'expo-image-picker';
import {
  normalizeProjectRelationValue,
} from '@/features/maintenance/maintenanceProject';

export const EVIDENCE_VIDEO_MAX_SECONDS = 90;
export const EVIDENCE_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const EVIDENCE_VIDEO_MAX_BYTES = 300 * 1024 * 1024;
export const LARGE_EVIDENCE_THRESHOLD_BYTES = 6 * 1024 * 1024;
export const LARGE_EVIDENCE_CHUNK_BYTES = 6 * 1024 * 1024;

type RecordLike = Record<string, unknown>;

export type ProjectEvidenceTarget = {
  value: string;
  targetType: 'DISPOSITIVO' | 'COMPONENTE';
  relationKey: string;
  componentLocalId: string;
  componentTypeId: string;
  componentName: string;
  label: string;
  main: boolean;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function extension(value: unknown) {
  const clean = text(value).toLowerCase().split('?')[0];
  const parts = clean.split('.');
  return parts.length > 1 ? parts.pop() || '' : '';
}

export function inferEvidenceMimeType(value: RecordLike = {}) {
  const direct = text(
    value.mimeType
      || value.MimeType
      || value.type,
  ).toLowerCase();
  if (direct.includes('/')) return direct;

  const ext = extension(
    value.fileName
      || value.NombreArchivo
      || value.Nombre
      || value.uri,
  );
  if (ext === 'mp4' || ext === 'm4v') return 'video/mp4';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'webm') return 'video/webm';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'heic') return 'image/heic';
  if (ext === 'heif') return 'image/heif';
  return 'application/octet-stream';
}

export function evidenceMediaKind(value: RecordLike = {}) {
  const declared = text(
    value.mediaType
      || value.TipoMedio,
  ).toLowerCase();
  if (declared === 'image' || declared === 'video') return declared;

  const mime = inferEvidenceMimeType(value);
  return mime.startsWith('video/') ? 'video' : 'image';
}

export function evidenceFileExtension(
  mimeType: unknown,
  fileName: unknown = '',
) {
  const original = extension(fileName);
  if (original && /^[a-z0-9]{1,8}$/.test(original)) return original;

  switch (text(mimeType).toLowerCase()) {
    case 'image/png': return 'png';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'image/heic': return 'heic';
    case 'image/heif': return 'heif';
    case 'video/quicktime': return 'mov';
    case 'video/webm': return 'webm';
    case 'video/mp4': return 'mp4';
    default: return 'jpg';
  }
}

export function normalizeEvidenceType(value: unknown) {
  return text(value).toLowerCase().includes('desp') ? 'Despues' : 'Antes';
}

export function validatePickedEvidenceAsset(asset: ImagePickerAsset) {
  const mediaType = asset.type === 'video' ? 'video' : 'image';
  const size = Math.max(0, Number(asset.fileSize || 0));
  const durationSeconds = mediaType === 'video'
    ? Math.max(0, Number(asset.duration || 0) / 1000)
    : 0;

  if (mediaType === 'image' && size > EVIDENCE_IMAGE_MAX_BYTES) {
    throw new Error('La imagen supera el límite actual de 15 MB.');
  }
  if (mediaType === 'video' && size > EVIDENCE_VIDEO_MAX_BYTES) {
    throw new Error('El video supera el límite actual de 300 MB.');
  }
  if (
    mediaType === 'video'
    && durationSeconds > EVIDENCE_VIDEO_MAX_SECONDS + 0.25
  ) {
    throw new Error(
      `El video dura ${Math.ceil(durationSeconds)} segundos. El máximo permitido es ${EVIDENCE_VIDEO_MAX_SECONDS} segundos.`,
    );
  }

  const mimeType = inferEvidenceMimeType({
    mimeType: asset.mimeType,
    fileName: asset.fileName,
    uri: asset.uri,
    mediaType,
  });

  return {
    mediaType,
    mimeType,
    size,
    durationSeconds,
    fileName: text(asset.fileName)
      || `evidencia-${Date.now()}.${evidenceFileExtension(mimeType)}`,
  };
}

function parseAnswers(device: RecordLike = {}) {
  const direct = device.respuestas;
  if (direct && typeof direct === 'object' && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  try {
    const parsed = JSON.parse(text(device.RespuestasJSON) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function questionLabelMap(device: RecordLike, answers: Record<string, unknown>) {
  const details = Array.isArray(device.questionDetails)
    ? device.questionDetails as RecordLike[]
    : Array.isArray(answers.__preguntas)
      ? answers.__preguntas as RecordLike[]
      : [];
  return new Map<string, string>(
    details
      .map((question): [string, string] => [
        text(question.key || question.Clave),
        text(question.label || question.Pregunta || question.key || question.Clave),
      ])
      .filter(([key]) => Boolean(key)),
  );
}

export function projectEvidenceTargets(
  device: RecordLike = {},
): ProjectEvidenceTarget[] {
  const answers = parseAnswers(device);
  const labels = questionLabelMap(device, answers);
  const deviceName = text(
    device.nombre
      || device.NombreDispositivo
      || device.name,
  ) || 'Dispositivo';
  const category = text(
    device.categoria
      || device.Categoria
      || device.TipoDispositivo,
  ) || 'Dispositivo';

  const targets: ProjectEvidenceTarget[] = [{
    value: 'DISPOSITIVO',
    targetType: 'DISPOSITIVO',
    relationKey: '',
    componentLocalId: '',
    componentTypeId: text(device.tipoDispositivoId || device.TipoDispositivoID),
    componentName: deviceName,
    label: `${category} · ${deviceName}`,
    main: true,
  }];

  for (const [key, raw] of Object.entries(answers)) {
    if (key === '__preguntas') continue;
    const relation = normalizeProjectRelationValue(raw);
    if (!relation.enabled || !relation.items.length) continue;

    relation.items.forEach((item, index) => {
      const relationItem = item as unknown as RecordLike;
      const localId = text(relationItem.localId || relationItem.id);
      if (!localId) return;
      const itemCategory = text(
        relationItem.categoria
          || relationItem.TipoDispositivo
          || relation.relatedTypeName,
      ) || 'Componente';
      const itemName = text(
        relationItem.nombre
          || relationItem.NombreDispositivo
          || relationItem.modelo
          || relationItem.Modelo,
      ) || `${itemCategory} ${index + 1}`;
      const relationLabel = labels.get(key);

      targets.push({
        value: `COMPONENTE:${key}:${localId}`,
        targetType: 'COMPONENTE',
        relationKey: key,
        componentLocalId: localId,
        componentTypeId: text(
          relationItem.tipoDispositivoId
            || relationItem.TipoDispositivoID
            || relation.relatedTypeId,
        ),
        componentName: itemName,
        label: relationLabel
          ? `${itemCategory} · ${itemName} · ${relationLabel}`
          : `${itemCategory} · ${itemName}`,
        main: false,
      });
    });
  }

  return targets;
}

export function projectEvidenceTargetValue(
  evidence: RecordLike = {},
) {
  const targetType = text(
    evidence.ProyectoDestinoTipo
      || evidence.projectTargetType
      || evidence.targetType,
  ).toUpperCase();
  if (targetType !== 'COMPONENTE') return 'DISPOSITIVO';

  const relationKey = text(
    evidence.ProyectoRelacionClave
      || evidence.projectRelationKey
      || evidence.relationKey,
  );
  const componentLocalId = text(
    evidence.ProyectoComponenteLocalID
      || evidence.projectComponentLocalId
      || evidence.componentLocalId,
  );
  return relationKey && componentLocalId
    ? `COMPONENTE:${relationKey}:${componentLocalId}`
    : 'DISPOSITIVO';
}

export function projectEvidenceTargetPatch(
  target: ProjectEvidenceTarget | null | undefined,
) {
  const component = target?.targetType === 'COMPONENTE';
  return {
    ProyectoDestinoTipo: component ? 'COMPONENTE' : 'DISPOSITIVO',
    projectTargetType: component ? 'COMPONENTE' : 'DISPOSITIVO',
    ProyectoRelacionClave: component ? target?.relationKey || '' : '',
    projectRelationKey: component ? target?.relationKey || '' : '',
    ProyectoComponenteLocalID: component ? target?.componentLocalId || '' : '',
    projectComponentLocalId: component ? target?.componentLocalId || '' : '',
    ProyectoComponenteTipoDispositivoID: component
      ? target?.componentTypeId || ''
      : '',
    projectComponentTypeId: component
      ? target?.componentTypeId || ''
      : '',
    ProyectoComponenteNombre: component ? target?.componentName || '' : '',
    projectComponentName: component ? target?.componentName || '' : '',
  };
}

export function createEvidencePayload(input: {
  evidenceId: string;
  maintenanceId: string;
  deviceId: string;
  asset: ImagePickerAsset;
  type?: string;
  note?: string;
  projectMode?: boolean;
  target?: ProjectEvidenceTarget | null;
  capturedAt?: string;
}) {
  const metadata = validatePickedEvidenceAsset(input.asset);
  const projectMode = Boolean(input.projectMode);
  const capturedAt = input.capturedAt || new Date().toISOString();

  return {
    FotoDispositivoID: input.evidenceId,
    imageId: input.evidenceId,
    MantenimientoID: input.maintenanceId,
    maintenanceId: input.maintenanceId,
    DispositivoMantenimientoRef: input.deviceId,
    deviceId: input.deviceId,
    ContextoEvidencia: projectMode ? 'PROYECTO' : 'MANTENIMIENTO',
    contextoEvidencia: projectMode ? 'PROYECTO' : 'MANTENIMIENTO',
    Tipo: projectMode ? 'Proyecto' : normalizeEvidenceType(input.type),
    tipo: projectMode ? 'Proyecto' : normalizeEvidenceType(input.type),
    Nota: text(input.note),
    nota: text(input.note),
    FechaCaptura: capturedAt,
    fechaCaptura: capturedAt,
    capturedAt,
    TipoMedio: metadata.mediaType,
    mediaType: metadata.mediaType,
    MimeType: metadata.mimeType,
    mimeType: metadata.mimeType,
    Nombre: metadata.fileName,
    fileName: metadata.fileName,
    Size: metadata.size,
    size: metadata.size,
    DuracionSegundos: metadata.durationSeconds,
    durationSeconds: metadata.durationSeconds,
    ...(projectMode
      ? projectEvidenceTargetPatch(input.target)
      : {
          ProyectoDestinoTipo: '',
          projectTargetType: '',
          ProyectoRelacionClave: '',
          projectRelationKey: '',
          ProyectoComponenteLocalID: '',
          projectComponentLocalId: '',
          ProyectoComponenteTipoDispositivoID: '',
          projectComponentTypeId: '',
          ProyectoComponenteNombre: '',
          projectComponentName: '',
        }),
  };
}
