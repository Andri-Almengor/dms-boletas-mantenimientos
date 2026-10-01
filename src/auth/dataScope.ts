import type { DmsUser } from '@/auth/sessionStore';

function clean(value: unknown) {
  return String(value ?? '').trim();
}

export function permissionFingerprint(permissions: string[] = []) {
  return [...new Set(permissions.map(String).filter(Boolean))]
    .sort()
    .join('|');
}

/**
 * El almacenamiento operativo se separa por usuario y por la huella EXACTA de
 * permisos. No usamos un hash corto: un cambio de autorización siempre produce
 * un scope distinto y los datos descargados bajo permisos anteriores quedan
 * inaccesibles para el scope actual.
 */
export function buildLocalDataScope(
  user: DmsUser | null,
  permissions: string[] = [],
) {
  const userId = clean(user?.UsuarioID || user?.id);
  if (!userId) return '';
  return `u:${userId}:p:${permissionFingerprint(permissions)}`;
}
