export type MaintenanceCategory = {
  key: string;
  countField: string;
  questions: [string, string][];
};

export const MAINTENANCE_CATEGORIES: MaintenanceCategory[] = [
  { key: 'Cámara', countField: 'CantCámaras', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión de red o video está correcta?'],['montaje','¿El montaje se encuentra firme y en buen estado?'],['visualizacion','¿La visualización y grabación son correctas?']] },
  { key: 'Puertas', countField: 'CantPuertas', questions: [['lector','¿El lector funciona correctamente?'],['cerradura','¿La cerradura funciona correctamente?'],['funcion','¿La apertura y cierre funcionan correctamente?'],['contactos','¿Los contactos y sensores reportan correctamente?']] },
  { key: 'Servidor', countField: 'CantServidores', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación y UPS están correctas?'],['conexiones','¿Las conexiones están correctas?'],['servicios','¿Los servicios del sistema están activos?'],['almacenamiento','¿El almacenamiento tiene capacidad disponible?'],['respaldo','¿El respaldo funciona correctamente?']] },
  { key: 'Grabador', countField: 'CantGrabadores', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexiones','¿Las conexiones están correctas?'],['grabacion','¿La grabación funciona correctamente?'],['visualizacion','¿La visualización es correcta?'],['almacenamiento','¿El almacenamiento está en buen estado?']] },
  { key: 'Bocinas', countField: 'CantBocinas', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión está correcta?'],['montaje','¿El montaje está firme y en buen estado?'],['pruebaSonido','¿La prueba de sonido fue satisfactoria?']] },
  { key: 'Sensor Perimetral', countField: 'CantSensoresPerimetrales', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión está correcta?'],['montaje','¿El montaje está firme?'],['pruebaDeteccion','¿La prueba de detección fue satisfactoria?']] },
  { key: 'Sensor Movimiento', countField: 'CantSensoresMovimiento', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión está correcta?'],['montaje','¿El montaje está firme?'],['pruebaDeteccion','¿La prueba de movimiento fue satisfactoria?']] },
  { key: 'Sensor de Ruptura', countField: 'CantSensorRuptura', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión está correcta?'],['montaje','¿El montaje está firme?'],['pruebaDeteccion','¿La prueba de ruptura o simulación fue satisfactoria?']] },
  { key: 'Impresora', countField: 'CantImpresora', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión está correcta?'],['consumibles','¿Los consumibles están en buen estado?'],['pruebaImpresion','¿La prueba de impresión fue satisfactoria?']] },
  { key: 'Gabinete', countField: 'CantGabinetes', questions: [['limpieza','¿Se realizó la limpieza?'],['conexiones','¿Las conexiones están ordenadas y correctas?'],['mediciones','¿Se realizaron las mediciones?'],['respaldo','¿El respaldo eléctrico funciona correctamente?']] },
  { key: 'VideoWall', countField: 'CantVideoWall', questions: [['limpieza','¿Se realizó la limpieza?'],['alimentacion','¿La alimentación funciona correctamente?'],['conexion','¿La conexión de video está correcta?'],['montaje','¿El montaje está firme y alineado?'],['visualizacion','¿La visualización es correcta?'],['calibracion','¿La calibración y el mosaico están correctos?']] },
];

const ALIASES = new Map([
  ['camara','Cámara'],['camaras','Cámara'],
  ['puerta','Puertas'],['puertas','Puertas'],
  ['control de acceso','Puertas'],['controles de acceso','Puertas'],
  ['servidor','Servidor'],['servidores','Servidor'],
  ['grabador','Grabador'],['grabadores','Grabador'],['nvr','Grabador'],['dvr','Grabador'],
  ['bocina','Bocinas'],['bocinas','Bocinas'],['altavoz','Bocinas'],['altavoces','Bocinas'],
  ['sensor perimetral','Sensor Perimetral'],['sensores perimetrales','Sensor Perimetral'],
  ['sensor movimiento','Sensor Movimiento'],['sensor de movimiento','Sensor Movimiento'],
  ['sensor ruptura','Sensor de Ruptura'],['sensor de ruptura','Sensor de Ruptura'],
  ['impresora','Impresora'],['impresoras','Impresora'],
  ['gabinete','Gabinete'],['gabinetes','Gabinete'],
  ['videowall','VideoWall'],['video wall','VideoWall'],
]);

export function normalizeText(value: unknown) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function canonicalMaintenanceCategoryName(value: unknown) {
  const normalized = normalizeText(value);
  const alias = ALIASES.get(normalized);
  const exact = MAINTENANCE_CATEGORIES.find((item) => normalizeText(item.key) === normalized);
  return alias || exact?.key || String(value || '').trim() || 'Dispositivo';
}

export function getMaintenanceCategory(value: unknown) {
  const key = canonicalMaintenanceCategoryName(value);
  return MAINTENANCE_CATEGORIES.find((item) => item.key === key)
    || { key, countField: '', questions: [] };
}

export function createEmptyMaintenanceCounts() {
  return Object.fromEntries(MAINTENANCE_CATEGORIES.map((item) => [item.countField, 0]));
}

export function createEmptyChecklist(category: unknown) {
  return Object.fromEntries(getMaintenanceCategory(category).questions.map(([key]) => [key, '']));
}
