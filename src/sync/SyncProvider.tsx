import { isAuthenticationError } from '@/api/actionClient';
import { buildLocalDataScope } from '@/auth/dataScope';
import { useAuth } from '@/auth/AuthProvider';
import {
  countOpenConflicts,
  countUnresolvedOutbox,
} from '@/db/outboxRepository';
import {
  ensureBackgroundSyncRegistration,
  unregisterBackgroundSync,
} from '@/sync/backgroundSyncTask';
import {
  runMaintenanceDetailRefresh,
  runSyncCycle,
  SyncCycleStatus,
  SyncPhase,
} from '@/sync/SyncCoordinator';
import {
  getAutomaticSyncWindowLabel,
  isAutomaticSyncWindow,
  isSyncAllowed,
  millisecondsUntilAutomaticWindowBoundary,
  SyncTrigger,
} from '@/sync/syncPolicy';
import { subscribeLocalSyncNeeded } from '@/sync/syncEvents';
import * as Network from 'expo-network';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  AppStateStatus,
} from 'react-native';

type SyncViewState = {
  status: SyncCycleStatus;
  phase: SyncPhase;
  message: string;
  pendingCount: number;
  conflictCount: number;
  syncing: boolean;
  lastSuccessAt: number;
};

type SyncContextValue = SyncViewState & {
  syncNow: () => Promise<void>;
  refreshMaintenanceDetail: (maintenanceId: string) => Promise<boolean>;
  refreshStatus: () => Promise<void>;
};

const SyncContext = createContext<SyncContextValue | null>(null);

const INITIAL_STATE: SyncViewState = {
  status: 'UPDATED',
  phase: 'idle',
  message: 'Todo sincronizado',
  pendingCount: 0,
  conflictCount: 0,
  syncing: false,
  lastSuccessAt: 0,
};

const LOCAL_CHANGE_DEBOUNCE_MS = 1_250;

function messageFor(
  status: SyncCycleStatus,
  pendingCount: number,
  conflictCount: number,
) {
  if (status === 'CONFLICT') {
    return conflictCount === 1
      ? '1 conflicto requiere revisión'
      : `${conflictCount} conflictos requieren revisión`;
  }
  if (status === 'SESSION_EXPIRED') return 'Inicie sesión para sincronizar';
  if (status === 'OFFLINE') return 'Trabajando localmente';
  if (status === 'PAUSED') return getAutomaticSyncWindowLabel();
  if (status === 'PENDING') {
    return pendingCount === 1
      ? '1 cambio pendiente de sincronizar'
      : `${pendingCount} cambios pendientes de sincronizar`;
  }
  if (status === 'BUSY') return 'Ya existe una sincronización en curso';
  if (status === 'ERROR') return 'No se pudo completar la sincronización';
  return 'Todo sincronizado';
}

function outsideHoursStatus(status: SyncCycleStatus) {
  if (!isAutomaticSyncWindow() && (status === 'UPDATED' || status === 'PENDING')) {
    return 'PAUSED' as const;
  }
  return status;
}

async function networkAvailable() {
  const network = await Network.getNetworkStateAsync().catch(
    () => ({} as Network.NetworkState),
  );
  return network.isConnected !== false && network.isInternetReachable !== false;
}

function stateIsOnline(state: Network.NetworkState) {
  return state.isConnected !== false
    && state.isInternetReachable !== false;
}

export function SyncProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const {
    user,
    permissions,
    sessionToken,
    loading: authLoading,
    refreshMe,
    clearSession,
  } = useAuth();
  const [state, setState] = useState<SyncViewState>(INITIAL_STATE);
  const syncingRef = useRef(false);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const localChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!user || !sessionToken) {
      setState((current) => ({
        ...current,
        status: 'SESSION_EXPIRED',
        phase: 'idle',
        message: messageFor('SESSION_EXPIRED', 0, 0),
        pendingCount: 0,
        conflictCount: 0,
      }));
      return;
    }

    const scopeKey = buildLocalDataScope(user, permissions);
    const [pendingCount, conflictCount, network] = await Promise.all([
      countUnresolvedOutbox(db, scopeKey),
      countOpenConflicts(db, scopeKey),
      Network.getNetworkStateAsync().catch(() => ({} as Network.NetworkState)),
    ]);

    let status: SyncCycleStatus = 'UPDATED';
    if (conflictCount > 0) status = 'CONFLICT';
    else if (!stateIsOnline(network)) status = 'OFFLINE';
    else if (!isAutomaticSyncWindow()) status = 'PAUSED';
    else if (pendingCount > 0) status = 'PENDING';

    setState((current) => ({
      ...current,
      status,
      phase: 'idle',
      message: messageFor(status, pendingCount, conflictCount),
      pendingCount,
      conflictCount,
    }));
  }, [db, user, permissions, sessionToken]);

  useEffect(() => {
    refreshStatus().catch(() => undefined);
  }, [refreshStatus]);

  const applyResult = useCallback((
    result: Awaited<ReturnType<typeof runSyncCycle>>,
  ) => {
    const displayStatus = outsideHoursStatus(result.status);
    setState((current) => ({
      ...current,
      syncing: false,
      phase: 'idle',
      status: displayStatus,
      pendingCount: result.pendingCount,
      conflictCount: result.conflictCount,
      message: result.errorMessage
        || messageFor(displayStatus, result.pendingCount, result.conflictCount),
      lastSuccessAt: result.status === 'UPDATED' || result.status === 'PENDING'
        ? Date.now()
        : current.lastSuccessAt,
    }));
  }, []);

  const handleAuthenticationFailure = useCallback(async () => {
    await clearSession();
    syncingRef.current = false;
    setState((current) => ({
      ...current,
      syncing: false,
      phase: 'idle',
      status: 'SESSION_EXPIRED',
      message: messageFor(
        'SESSION_EXPIRED',
        current.pendingCount,
        current.conflictCount,
      ),
    }));
  }, [clearSession]);

  const runAutomaticSync = useCallback(async (
    trigger: Exclude<SyncTrigger, 'manual'>,
  ) => {
    if (!sessionToken || !user || authLoading) return;

    // La ventana se verifica antes de consultar conectividad o ejecutar APIs.
    if (!isSyncAllowed(trigger)) {
      await refreshStatus();
      return;
    }
    if (syncingRef.current) return;

    if (!(await networkAvailable())) {
      await refreshStatus();
      return;
    }

    const scopeKey = buildLocalDataScope(user, permissions);
    if (!scopeKey) return;

    syncingRef.current = true;
    setState((current) => ({
      ...current,
      syncing: true,
      status: 'BUSY',
      phase: 'checking',
      message: 'Sincronizando automáticamente',
    }));

    try {
      const result = await runSyncCycle(db, {
        trigger,
        scopeKey,
        sessionToken,
        onProgress: (progress) => {
          setState((current) => ({
            ...current,
            syncing: true,
            phase: progress.phase,
            message: progress.message,
          }));
        },
      });

      if (result.status === 'SESSION_EXPIRED') {
        await handleAuthenticationFailure();
        return;
      }
      if (result.status === 'BUSY') {
        await refreshStatus();
        return;
      }
      applyResult(result);
    } catch (error) {
      if (isAuthenticationError(error)) {
        await handleAuthenticationFailure();
        return;
      }
      setState((current) => ({
        ...current,
        syncing: false,
        phase: 'idle',
        status: 'ERROR',
        message: error instanceof Error
          ? error.message
          : messageFor('ERROR', current.pendingCount, current.conflictCount),
      }));
    } finally {
      syncingRef.current = false;
    }
  }, [
    applyResult,
    authLoading,
    db,
    handleAuthenticationFailure,
    permissions,
    refreshStatus,
    sessionToken,
    user,
  ]);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    if (!sessionToken || !user) {
      await handleAuthenticationFailure();
      return;
    }
    if (!(await networkAvailable())) {
      await refreshStatus();
      return;
    }

    syncingRef.current = true;
    setState((current) => ({
      ...current,
      syncing: true,
      status: 'BUSY',
      phase: 'checking',
      message: 'Comprobando conexión y sesión',
    }));

    try {
      const me = await refreshMe();
      const scopeKey = buildLocalDataScope(me.user, me.permissions || []);
      const result = await runSyncCycle(db, {
        trigger: 'manual',
        scopeKey,
        sessionToken,
        onProgress: (progress) => {
          setState((current) => ({
            ...current,
            syncing: true,
            phase: progress.phase,
            message: progress.message,
          }));
        },
      });
      if (result.status === 'SESSION_EXPIRED') {
        await handleAuthenticationFailure();
        return;
      }
      applyResult(result);
    } catch (error) {
      if (isAuthenticationError(error)) {
        await handleAuthenticationFailure();
        return;
      }
      setState((current) => ({
        ...current,
        syncing: false,
        phase: 'idle',
        status: 'ERROR',
        message: error instanceof Error
          ? error.message
          : messageFor('ERROR', current.pendingCount, current.conflictCount),
      }));
    } finally {
      syncingRef.current = false;
    }
  }, [
    db,
    sessionToken,
    user,
    refreshMe,
    applyResult,
    handleAuthenticationFailure,
    refreshStatus,
  ]);

  const refreshMaintenanceDetail = useCallback(async (maintenanceId: string) => {
    if (syncingRef.current || !sessionToken || !user) return false;
    if (!(await networkAvailable())) {
      await refreshStatus();
      return false;
    }

    syncingRef.current = true;
    setState((current) => ({
      ...current,
      syncing: true,
      status: 'BUSY',
      phase: 'detail',
      message: 'Actualizando detalle del mantenimiento',
    }));

    try {
      const me = await refreshMe();
      const scopeKey = buildLocalDataScope(me.user, me.permissions || []);
      const result = await runMaintenanceDetailRefresh(db, {
        maintenanceId,
        scopeKey,
        sessionToken,
        onProgress: (progress) => {
          setState((current) => ({
            ...current,
            syncing: true,
            phase: progress.phase,
            message: progress.message,
          }));
        },
      });
      if (result.status === 'SESSION_EXPIRED') {
        await handleAuthenticationFailure();
        return false;
      }
      applyResult(result);
      return result.status === 'UPDATED'
        || result.status === 'PENDING'
        || result.status === 'CONFLICT';
    } catch (error) {
      if (isAuthenticationError(error)) {
        await handleAuthenticationFailure();
        return false;
      }
      setState((current) => ({
        ...current,
        syncing: false,
        phase: 'idle',
        status: 'ERROR',
        message: error instanceof Error
          ? error.message
          : messageFor('ERROR', current.pendingCount, current.conflictCount),
      }));
      return false;
    } finally {
      syncingRef.current = false;
    }
  }, [
    db,
    sessionToken,
    user,
    refreshMe,
    applyResult,
    handleAuthenticationFailure,
    refreshStatus,
  ]);

  // Apertura / primera sesión restaurada.
  useEffect(() => {
    if (authLoading || !sessionToken || !user) return;
    runAutomaticSync('foreground').catch(() => undefined);
  }, [authLoading, runAutomaticSync, sessionToken, user]);

  // Regreso al foreground.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previous = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === 'active' && previous !== 'active') {
        runAutomaticSync('foreground').catch(() => undefined);
      }
    });
    return () => subscription.remove();
  }, [runAutomaticSync]);

  // Recuperación real de red; el primer estado observado no dispara sync.
  useEffect(() => {
    if (authLoading || !sessionToken || !user) return;
    let active = true;
    let previousOnline: boolean | null = null;

    Network.getNetworkStateAsync()
      .then((network) => {
        if (active) previousOnline = stateIsOnline(network);
      })
      .catch(() => undefined);

    const subscription = Network.addNetworkStateListener((network) => {
      const online = stateIsOnline(network);
      const recovered = previousOnline === false && online;
      previousOnline = online;
      if (recovered && AppState.currentState === 'active') {
        runAutomaticSync('network').catch(() => undefined);
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [authLoading, runAutomaticSync, sessionToken, user]);

  // Cambios locales: debounce para agrupar una edición y sus operaciones.
  useEffect(() => {
    const unsubscribe = subscribeLocalSyncNeeded(() => {
      if (localChangeTimerRef.current) {
        clearTimeout(localChangeTimerRef.current);
      }

      if (!isSyncAllowed('local-change')) {
        refreshStatus().catch(() => undefined);
        return;
      }

      localChangeTimerRef.current = setTimeout(() => {
        localChangeTimerRef.current = null;
        if (AppState.currentState === 'active') {
          runAutomaticSync('local-change').catch(() => undefined);
        }
      }, LOCAL_CHANGE_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (localChangeTimerRef.current) {
        clearTimeout(localChangeTimerRef.current);
        localChangeTimerRef.current = null;
      }
    };
  }, [refreshStatus, runAutomaticSync]);

  // Un único timer hacia 07:00 o 17:00; no existe polling.
  useEffect(() => {
    if (authLoading || !sessionToken || !user) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleBoundary = () => {
      if (cancelled) return;
      const delay = Math.max(
        1_000,
        millisecondsUntilAutomaticWindowBoundary() + 500,
      );
      timer = setTimeout(() => {
        if (cancelled) return;
        refreshStatus().catch(() => undefined);
        if (
          AppState.currentState === 'active'
          && isAutomaticSyncWindow()
        ) {
          runAutomaticSync('foreground').catch(() => undefined);
        }
        scheduleBoundary();
      }, delay);
    };

    scheduleBoundary();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [
    authLoading,
    refreshStatus,
    runAutomaticSync,
    sessionToken,
    user,
  ]);

  // BackgroundTask es apoyo del mismo coordinador, nunca un servicio vivo.
  useEffect(() => {
    if (authLoading) return;
    if (sessionToken && user) {
      ensureBackgroundSyncRegistration().catch(() => undefined);
    } else {
      unregisterBackgroundSync().catch(() => undefined);
    }
  }, [authLoading, sessionToken, user]);

  const value = useMemo<SyncContextValue>(() => ({
    ...state,
    syncNow,
    refreshMaintenanceDetail,
    refreshStatus,
  }), [state, syncNow, refreshMaintenanceDetail, refreshStatus]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync debe utilizarse dentro de SyncProvider.');
  return context;
}
