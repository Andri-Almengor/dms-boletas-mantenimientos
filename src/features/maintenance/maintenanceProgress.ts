import {
  canonicalMaintenanceCategoryName,
  getMaintenanceCategory,
  MAINTENANCE_CATEGORIES,
  normalizeText,
} from '@/features/maintenance/maintenanceCategories';

type Row = Record<string, unknown>;

export type MaintenanceProgressRow = {
  key: string;
  label: string;
  expected: number;
  registered: number;
  remaining: number;
  evidenceTotal: number;
  withEvidence: number;
  missingEvidence: number;
  completeEvidencePairs: number;
  pendingAfter: number;
  onlyAfter: number;
  unclassifiedOnly: number;
};

export type MaintenanceLocalProgress = {
  items: MaintenanceProgressRow[];
  expected: number;
  registered: number;
  remaining: number;
  percentage: number;
  evidenceTotal: number;
  withEvidence: number;
  missingEvidence: number;
  completeEvidencePairs: number;
  pendingAfter: number;
  onlyAfter: number;
  unclassifiedOnly: number;
  inventoryComplete: boolean;
};

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function count(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function countsObject(value: unknown): Row {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Row;
  try {
    const parsed: unknown = JSON.parse(clean(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Row : {};
  } catch {
    return {};
  }
}

function active(row: Row) {
  const value = normalizeText(row.Activo);
  return row.Activo !== false
    && !['false', '0', 'no', 'inactivo', 'inactive'].includes(value);
}

type Counter = MaintenanceProgressRow & { order: number };

function empty(key: string, label: string, order: number): Counter {
  return {
    key, label, order, expected: 0, registered: 0, remaining: 0,
    evidenceTotal: 0, withEvidence: 0, missingEvidence: 0,
    completeEvidencePairs: 0, pendingAfter: 0, onlyAfter: 0, unclassifiedOnly: 0,
  };
}

/**
 * Solo lectura: proyección local del contrato buildMaintenanceProgress del backend.
 * No sustituye validaciones, finalización ni notificaciones del servidor.
 * Recibe el detalle SQLite ya leído en lote (Imagenes no incluye tombstones).
 */
export function buildLocalMaintenanceProgress(
  maintenance: Row,
  devices: Row[],
  deviceTypes: Row[] = [],
): MaintenanceLocalProgress {
  const definitions = new Map<string, Counter>();
  const byTypeId = new Map<string, string>();
  const byTypeName = new Map<string, { id: string; name: string }>();

  for (const row of deviceTypes) {
    const id = clean(row.TipoDispositivoID || row.id);
    const name = clean(row.Nombre || row.TipoDispositivo || row.name);
    if (id) byTypeId.set(id, name || id);
    if (name) byTypeName.set(normalizeText(name), { id, name });
  }

  function definition(key: string, label: string, order = 1000) {
    let item = definitions.get(key);
    if (!item) {
      item = empty(key, label, order);
      definitions.set(key, item);
    }
    return item;
  }

  function resolveType(typeId: string, typeName: string) {
    const name = typeName || byTypeId.get(typeId) || '';
    const fixed = getMaintenanceCategory(name);
    if (fixed.countField) {
      const index = MAINTENANCE_CATEGORIES.findIndex((category) => category.key === fixed.key);
      return definition(`fixed:${fixed.key}`, fixed.key, index);
    }
    const key = typeId ? `type:${typeId}` : `name:${normalizeText(name)}`;
    return definition(key, name || typeId || 'Dispositivo');
  }

  const planned = countsObject(maintenance.CantidadesJSON);
  // JSON y columnas históricas pueden coexistir para el mismo tipo:
  // misma política del backend, MAX y nunca SUM de fuentes duplicadas.
  MAINTENANCE_CATEGORIES.forEach((category, index) => {
    const item = definition(`fixed:${category.key}`, category.key, index);
    item.expected = Math.max(
      item.expected,
      count(planned[category.countField]),
      count(maintenance[category.countField]),
    );
  });

  for (const [key, value] of Object.entries(planned)) {
    const typeId = key.match(/^TipoDispositivo:(.+)$/i);
    if (typeId) {
      const id = clean(typeId[1]);
      const item = resolveType(id, byTypeId.get(id) || id);
      item.expected = Math.max(item.expected, count(value));
      continue;
    }
    const typeName = key.match(/^TipoDispositivoNombre:(.+)$/i);
    if (!typeName) continue;
    const configuredName = clean(typeName[1]).replace(/[_-]+/g, ' ');
    const known = byTypeName.get(normalizeText(configuredName));
    const item = resolveType(known?.id || '', known?.name || configuredName);
    item.expected = Math.max(item.expected, count(value));
  }

  for (const device of devices) {
    if (!active(device)) continue;
    const typeId = clean(device.TipoDispositivoID || device.tipoDispositivoId);
    const typeName = clean(device.TipoDispositivo || device.Categoria || device.categoria);
    const item = resolveType(typeId, canonicalMaintenanceCategoryName(typeName || byTypeId.get(typeId)));
    item.registered += 1;
    const evidence = (Array.isArray(device.Imagenes)
      ? device.Imagenes : []) as Row[];
    let total = 0;
    let before = 0;
    let after = 0;
    for (const image of evidence) {
      if (!active(image)) continue;
      total += 1;
      const phase = normalizeText(image.Tipo || image.tipo);
      if (phase.includes('antes') || phase.includes('before')) before += 1;
      if (phase.includes('desp') || phase.includes('after')) after += 1;
    }
    item.evidenceTotal += total;
    if (total) item.withEvidence += 1;
    if (before && after) item.completeEvidencePairs += 1;
    else if (before) item.pendingAfter += 1;
    else if (after) item.onlyAfter += 1;
    else if (total) item.unclassifiedOnly += 1;
  }

  const items: MaintenanceProgressRow[] = [...definitions.values()]
    .filter((item) => item.expected > 0 || item.registered > 0)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, 'es'))
    .map(({ order: _order, ...item }) => ({
      ...item,
      remaining: Math.max(0, item.expected - item.registered),
      missingEvidence: Math.max(0, item.registered - item.withEvidence),
    }));

  const sum = (field: keyof MaintenanceProgressRow) => items.reduce(
    (total, item) => total + Number(item[field] || 0), 0,
  );
  const expected = sum('expected');
  const registered = sum('registered');
  return {
    items, expected, registered,
    remaining: Math.max(0, expected - registered),
    percentage: expected ? Math.min(100, Math.round(registered / expected * 100)) : 0,
    evidenceTotal: sum('evidenceTotal'),
    withEvidence: sum('withEvidence'),
    missingEvidence: sum('missingEvidence'),
    completeEvidencePairs: sum('completeEvidencePairs'),
    pendingAfter: sum('pendingAfter'),
    onlyAfter: sum('onlyAfter'),
    unclassifiedOnly: sum('unclassifiedOnly'),
    inventoryComplete: expected > 0 && items.every(
      (item) => item.registered >= item.expected,
    ),
  };
}
