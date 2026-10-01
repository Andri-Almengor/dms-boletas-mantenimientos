import {
  actionRequest,
  isAuthenticationError,
} from '@/api/actionClient';
import {
  clearStoredSession,
  DmsUser,
  readStoredSession,
  saveStoredSession,
} from '@/auth/sessionStore';
import React, {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type LoginResponse = {
  sessionToken: string;
  user: DmsUser;
  permissions?: string[];
  mustChangePassword?: boolean;
};

type MeResponse = {
  user: DmsUser;
  permissions?: string[];
};

type AuthContextValue = {
  sessionToken: string;
  user: DmsUser | null;
  permissions: string[];
  loading: boolean;
  login: (username: string, password: string) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<MeResponse>;
  clearSession: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function normalizedPermissions(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function effectivePermission(permissions: string[], code: string) {
  if (!code) return true;
  if (permissions.includes('USUARIOS_GESTIONAR')) return true;
  return permissions.includes(code);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [sessionToken, setSessionToken] = useState('');
  const [user, setUser] = useState<DmsUser | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  async function acceptSession(
    token: string,
    nextUser: DmsUser,
    nextPermissions: string[],
  ) {
    setSessionToken(token);
    setUser(nextUser);
    setPermissions(nextPermissions);
    await saveStoredSession(token, nextUser, nextPermissions);
  }

  async function clearSession() {
    await clearStoredSession().catch(() => undefined);
    setSessionToken('');
    setUser(null);
    setPermissions([]);
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();

    async function restore() {
      const cached = await readStoredSession();
      if (!active) return;

      if (!cached.sessionToken) {
        setLoading(false);
        return;
      }

      setSessionToken(cached.sessionToken);
      setUser(cached.user);
      setPermissions(cached.permissions);

      try {
        const data = await actionRequest<MeResponse>(
          'auth.me',
          {},
          cached.sessionToken,
          { signal: controller.signal },
        );
        if (!active) return;
        await acceptSession(
          cached.sessionToken,
          data.user,
          normalizedPermissions(data.permissions),
        );
      } catch (error) {
        if (!active) return;

        // Igual que la web: una caída de red/backend NO elimina la sesión local.
        // Solo una respuesta de autenticación autoritativa la invalida.
        if (isAuthenticationError(error)) {
          await clearSession();
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    restore().catch(() => {
      if (active) setLoading(false);
    });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  async function login(username: string, password: string) {
    const data = await actionRequest<LoginResponse>('auth.login', {
      username,
      password,
    });
    const nextPermissions = normalizedPermissions(data.permissions);
    await acceptSession(data.sessionToken, data.user, nextPermissions);
    return { ...data, permissions: nextPermissions };
  }

  async function logout() {
    const token = sessionToken;
    try {
      if (token) await actionRequest('auth.logout', {}, token);
    } catch {
      // Cerrar sesión es una decisión explícita del usuario.
      // Aunque no haya conexión, el dispositivo debe borrar la sesión local.
    } finally {
      await clearSession();
    }
  }

  async function refreshMe() {
    const data = await actionRequest<MeResponse>('auth.me', {}, sessionToken);
    const nextPermissions = normalizedPermissions(data.permissions);
    await acceptSession(sessionToken, data.user, nextPermissions);
    return { ...data, permissions: nextPermissions };
  }

  const value = useMemo<AuthContextValue>(() => ({
    sessionToken,
    user,
    permissions,
    loading,
    login,
    logout,
    refreshMe,
    clearSession,
    hasPermission: (code) => effectivePermission(permissions, code),
  }), [sessionToken, user, permissions, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe utilizarse dentro de AuthProvider.');
  }
  return context;
}
