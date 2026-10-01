import { isAuthenticationError } from '@/api/actionClient';
import { buildLocalDataScope } from '@/auth/dataScope';
import { useAuth } from '@/auth/AuthProvider';
import {
  countOpenConflicts,
  countUnresolvedOutbox,
} from '@/db/outboxRepository';
import {
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

  const syncNow = useCallback(async () => {
    if (state.syncing) return;

    if (!sessionToken || !user) {
      setState((current) => ({
        ...current,
        status: 'SESSION_EXPIRED',
        message: messageFor('SESSION_EXPIRED', current.pendingCount, current.conflictCount),
      }));
      return;
    }

    const network = await Network.getNetworkStateAsync().catch(
      () => ({} as Network.NetworkState),
    );
    if (network.isConnected === false || network.isInternetReachable === false) {
      const scopeKey = buildLocalDataScope(user, permissions);
      const pendingCount = await countUnresolvedOutbox(db, scopeKey);
      setState((current) => ({
        ...current,
        status: 'OFFLINE',
        message: messageFor('OFFLINE', pendingCount, current.conflictCount),
        pendingCount,
      }));
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
    } catch (error) {
      if (isAuthenticationError(error)) {
        await clearSession();
        setState((current) => ({
          ...current,
          syncing: false,
          phase: 'idle',
          status: 'SESSION_EXPIRED',
          message: messageFor('SESSION_EXPIRED', current.pendingCount, current.conflictCount),
        }));
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
    permissions,
    refreshMe,
    clearSession,
  ]);

  const value = useMemo<SyncContextValue>(() => ({
    ...state,
    syncNow,
    refreshStatus,
  }), [state, syncNow, refreshStatus]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error('useSync debe utilizarse dentro de SyncProvider.');
  return context;
}
