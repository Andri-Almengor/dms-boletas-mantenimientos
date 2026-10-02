const ADMIN_PERMISSIONS = new Set([
  'USUARIOS_GESTIONAR',
  'MANTENIMIENTOS_GESTIONAR',
  'MANTENIMIENTOS_ELIMINAR',
]);

export function hasAnyPermission(
  permissions: string[],
  codes: string[],
) {
  return codes.some((code) => permissions.includes(code));
}

export function isMaintenanceAdministrator(permissions: string[]) {
  return permissions.some((code) => ADMIN_PERMISSIONS.has(code));
}

export function canCreateMaintenance(permissions: string[]) {
  return hasAnyPermission(permissions, [
    'MANTENIMIENTOS_CREAR',
    'MANTENIMIENTOS_GESTIONAR',
    'USUARIOS_GESTIONAR',
    'BOLETAS_CREAR',
  ]);
}

export function canEditMaintenance(permissions: string[]) {
  return hasAnyPermission(permissions, [
    'MANTENIMIENTOS_EDITAR',
    'MANTENIMIENTOS_GESTIONAR',
    'USUARIOS_GESTIONAR',
    'BOLETAS_EDITAR',
  ]);
}

export function canCreateOperationalClientData(permissions: string[]) {
  return hasAnyPermission(permissions, [
    'CLIENTES_DATOS_OPERATIVOS_CREAR',
    'CLIENTES_EDITAR',
    'MANTENIMIENTOS_CREAR',
    'MANTENIMIENTOS_EDITAR',
    'MANTENIMIENTOS_GESTIONAR',
    'USUARIOS_GESTIONAR',
    'BOLETAS_CREAR',
    'BOLETAS_EDITAR',
  ]);
}

export function canDeleteMaintenanceDevice(
  permissions: string[],
  maintenanceStatus: unknown,
) {
  if (isMaintenanceAdministrator(permissions)) return true;
  const canTechnicianDelete = hasAnyPermission(permissions, [
    'MANTENIMIENTOS_EDITAR',
    'BOLETAS_EDITAR',
  ]);
  return canTechnicianDelete
    && String(maintenanceStatus || 'PENDIENTE').trim().toUpperCase() === 'PENDIENTE';
}

export function maintenanceReadOnly(
  permissions: string[],
  maintenanceStatus: unknown,
) {
  const status = String(maintenanceStatus || '').trim().toUpperCase();
  return ['FINALIZADO', 'FINALIZADA'].includes(status)
    && !isMaintenanceAdministrator(permissions);
}

