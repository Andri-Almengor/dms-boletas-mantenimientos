import type { DmsUser } from '@/auth/sessionStore';

function clean(value: unknown) {
  return String(value ?? '').trim();
}

function hashText(value = '') {
  let hash = 2166136261;
  const text = String(value);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function permissionFingerprint(permissions: string[] = []) {
  return [...new Set(permissions.map(String).filter(Boolean))]
    .sort()
    .join(',');
}

/**
 * Igual que la caché web, el almacenamiento operativo se separa por usuario y
 * huella de permisos. Un cambio de permisos crea un scope nuevo y evita exponer
 * datos descargados bajo una autorización anterior.
 */
export function buildLocalDataScope(
  user: DmsUser | null,
  permissions: string[] = [],
) {
  const userId = clean(user?.UsuarioID || user?.id);
  if (!userId) return '';
  return `u:${userId}:${hashText(permissionFingerprint(permissions))}`;
}
