import { isAuthenticationError } from '@/api/actionClient';
import { buildLocalDataScope } from '@/auth/dataScope';
import { useAuth } from '@/auth/AuthProvider';
import {
  countOpenConflicts,
  countUnresolvedOutbox,
} from '@/db/outboxRepository';
import {
  runMaintenanceDetailRefresh,
  runSyncCycle,
  SyncCycleStatus,
  SyncPhase,
} from '@/sync/SyncCoordinator';
import {
  getAutomaticSyncWindowLabel,
  isAutomaticSyncWindow,
} from '@/sync/syncPolicy';
import * as Network from 'expo-network';
import { useSQLiteContext } from 'expo-sqlite';
import React, {
  createContext,
  PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

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

export function SyncProvider({ children }: PropsWithChildren) {
  const db = useSQLiteContext();
  const {
    user,
    permissions,
    sessionToken,
    refreshMe,
    clearSession,
  } = useAuth();
  const [state, setState] = useState<SyncViewState>(INITIAL_STATE);

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
    else if (network.isConnected === false || network.isInternetReachable === false) status = 'OFFLINE';
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
    setState((current) => ({
      ...current,
      syncing: false,
      phase: 'idle',
      status: 'SESSION_EXPIRED',
      message: messageFor('SESSION_EXPIRED', current.pendingCount, current.conflictCount),
    }));
  }, [clearSession]);

  const syncNow = useCallback(async () => {
    if (state.syncing) return;
    if (!sessionToken || !user) {
      await handleAuthenticationFailure();
      return;
    }
    if (!(await networkAvailable())) {
      await refreshStatus();
      return;
    }

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
    }
  }, [
    db,
    state.syncing,
    sessionToken,
    user,
    refreshMe,
    applyResult,
    handleAuthenticationFailure,
    refreshStatus,
  ]);

  const refreshMaintenanceDetail = useCallback(async (maintenanceId: string) => {
    if (state.syncing || !sessionToken || !user) return false;
    if (!(await networkAvailable())) {
      await refreshStatus();
      return false;
    }

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
    }
  }, [
    db,
    state.syncing,
    sessionToken,
    user,
    refreshMe,
    applyResult,
    handleAuthenticationFailure,
    refreshStatus,
  ]);

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
