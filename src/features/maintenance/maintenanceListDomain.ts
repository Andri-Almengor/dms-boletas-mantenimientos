export const MAINTENANCE_LIST_PAGE_SIZE = 40;

export type MaintenanceStatus = 'PENDIENTE' | 'FINALIZADO';

export type MaintenanceListFilters = {
  client: string;
  dateFrom: string;
  dateTo: string;
};

export function normalizeMaintenanceStatus(value: unknown): MaintenanceStatus {
  const normalized = String(value || '').trim().toUpperCase();
  return ['FINALIZADO', 'FINALIZADA'].includes(normalized)
    ? 'FINALIZADO'
    : 'PENDIENTE';
}

export function maintenanceDateKey(value: unknown) {
  if (!value) return '';
  const text = String(value);
  const isoMatch = text.match(/^\d{4}-\d{2}-\d{2}/);
  if (isoMatch) return isoMatch[0];
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function formatMaintenanceDate(value: unknown) {
  if (!value) return 'Sin fecha';
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('es-CR', { dateStyle: 'medium' }).format(date);
}

function safeCount(value: unknown) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.max(0, amount) : 0;
}

const COUNT_FIELDS = [
  'CantCámaras',
  'CantPuertas',
  'CantServidores',
  'CantGrabadores',
  'CantBocinas',
  'CantSensoresPerimetrales',
  'CantSensoresMovimiento',
  'CantSensorRuptura',
  'CantImpresora',
  'CantGabinetes',
  'CantVideoWall',
];

export function expectedDeviceTotal(row: Record<string, unknown>) {
  let storedCounts: Record<string, unknown> = {};
  try {
    const raw = row.CantidadesJSON;
    const parsed = typeof raw === 'string' ? JSON.parse(raw || '{}') : raw;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      storedCounts = parsed as Record<string, unknown>;
    }
  } catch {
    storedCounts = {};
  }

  const entries = Object.entries(storedCounts);
  let hasCounts = entries.length > 0;
  let total = entries.reduce((sum, [, value]) => sum + safeCount(value), 0);

  for (const field of COUNT_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(storedCounts, field)) continue;
    const source = row[field];
    if (source === undefined || source === null || source === '') continue;
    hasCounts = true;
    total += safeCount(source);
  }

  if (hasCounts) return total;
  for (const key of ['DispositivosEsperados', 'CantidadEsperada']) {
    const direct = Number(row[key]);
    if (Number.isFinite(direct)) return Math.max(0, direct);
  }
  return 0;
}

export function maintenanceRecordId(
  row: Record<string, unknown>,
  fallback = '',
) {
  return String(row.MantenimientoID || row.maintenanceId || row.id || fallback);
}

export function maintenanceTitle(row: Record<string, unknown>) {
  return String(row.TituloMantenimiento || row.titulo || 'Mantenimiento sin título');
}

export function maintenanceClient(row: Record<string, unknown>) {
  return String(row.Cliente || row.ClienteRef || 'Sin cliente');
}

export function maintenanceLocation(row: Record<string, unknown>) {
  return String(row.Ubicacion || 'Sin ubicación');
}

export function maintenanceResponsible(row: Record<string, unknown>) {
  return String(row.Responsables || row.Responsable || 'Sin responsables');
}
