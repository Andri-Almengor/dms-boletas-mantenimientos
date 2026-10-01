import * as SecureStore from 'expo-secure-store';

const SESSION_KEY = 'dms_maintenance_session_v1';

export type DmsUser = {
  UsuarioID?: string;
  Nombre?: string;
  Correo?: string;
  CambioPasswordObligatorio?: boolean;
  [key: string]: unknown;
};

export type StoredSession = {
  sessionToken: string;
  user: DmsUser | null;
  permissions: string[];
  savedAt: number;
};

function normalizeSession(value: Partial<StoredSession> | null | undefined): StoredSession {
  return {
    sessionToken: String(value?.sessionToken || ''),
    user: value?.user && typeof value.user === 'object' ? value.user as DmsUser : null,
    permissions: Array.isArray(value?.permissions)
      ? value.permissions.map(String).filter(Boolean)
      : [],
    savedAt: Number(value?.savedAt || 0),
  };
}

export async function readStoredSession(): Promise<StoredSession> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return normalizeSession(raw ? JSON.parse(raw) as Partial<StoredSession> : null);
  } catch {
    return normalizeSession(null);
  }
}

export async function saveStoredSession(
  sessionToken: string,
  user: DmsUser | null,
  permissions: string[],
) {
  const value = normalizeSession({
    sessionToken,
    user,
    permissions,
    savedAt: Date.now(),
  });

  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(value));
  return value;
}

export async function clearStoredSession() {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}
