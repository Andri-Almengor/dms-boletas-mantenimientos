import {
  actionRequest,
  ActionApiError,
  isAuthenticationError,
} from '@/api/actionClient';
import {
  persistAuthorizedMaintenanceDetail,
} from '@/db/maintenanceDetailRepository';
import {
  countOpenConflicts,
  countUnresolvedOutbox,
  pruneCompletedOutbox,
  recoverInterruptedOutbox,
} from '@/db/outboxRepository';
import {
  acquireSyncLease,
  releaseSyncLease,
  renewSyncLease,
} from '@/db/syncLockRepository';
import { markSyncError } from '@/db/syncStateRepository';
import { cleanupOrphanedMaintenanceFiles } from '@/services/maintenanceEvidenceStorage';
import { DELTA_RESOURCES } from '@/sync/resourceRegistry';
import {
  refreshStaticResources,
  synchronizeDeltaResource,
} from '@/sync/syncPull';
import { pushOutbox } from '@/sync/syncPush';
import {
  AUTO_SYNC_WINDOW_CLOSED_CODE,
  isSyncAllowed,
  SyncTrigger,
} from '@/sync/syncPolicy';
import * as Network from 'expo-network';
import type { SQLiteDatabase } from 'expo-sqlite';

const COMPLETED_OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export type SyncPhase =
  | 'idle'
  | 'checking'
  | 'pull'
  | 'reconcile'
  | 'push'
  | 'final-pull'
  | 'detail'
  | 'complete';

export type SyncCycleStatus =
  | 'UPDATED'
  | 'PENDING'
  | 'OFFLINE'
  | 'PAUSED'
  | 'ERROR'
  | 'CONFLICT'
  | 'SESSION_EXPIRED'
  | 'BUSY';

export type SyncProgress = {
  phase: SyncPhase;
  message: string;
  processed?: number;
};

export type SyncCycleResult = {
  status: SyncCycleStatus;
  pendingCount: number;
  conflictCount: number;
  errorCode?: string;
  errorMessage?: string;
};

function emit(
  callback: ((progress: SyncProgress) => void) | undefined,
  phase: SyncPhase,
  message: string,
  processed?: number,
) {
  callback?.({ phase, message, processed });
}

async function hasInternet() {
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
}

function errorResult(
  error: unknown,
  pendingCount: number,
  conflictCount: number,
): SyncCycleResult {
  if (isAuthenticationError(error)) {
    return {
      status: 'SESSION_EXPIRED',
      pendingCount,
      conflictCount,
      errorCode: 'SESSION_EXPIRED',
      errorMessage: error instanceof Error ? error.message : 'La sesión expiró.',
    };
  }

  const code = error instanceof ActionApiError
    ? error.code
    : String((error as Error & { code?: string })?.code || 'SYNC_ERROR');

  if (code === AUTO_SYNC_WINDOW_CLOSED_CODE) {
    return {
      status: 'PAUSED',
      pendingCount,
      conflictCount,
      errorCode: code,
      errorMessage: error instanceof Error ? error.message : undefined,
    };
  }

  return {
    status: 'ERROR',
    pendingCount,
    conflictCount,
    errorCode: code,
    errorMessage: error instanceof Error
      ? error.message
      : 'No se pudo completar la sincronización.',
  };
}

async function currentCounts(db: SQLiteDatabase, scopeKey: string) {
  const [pendingCount, conflictCount] = await Promise.all([
    countUnresolvedOutbox(db, scopeKey),
    countOpenConflicts(db, scopeKey),
  ]);
  return { pendingCount, conflictCount };
}

export async function runSyncCycle(
  db: SQLiteDatabase,
  input: {
    trigger: SyncTrigger;
    scopeKey: string;
    sessionToken: string;
    signal?: AbortSignal;
    onProgress?: (progress: SyncProgress) => void;
  },
): Promise<SyncCycleResult> {
  const initial = await currentCounts(db, input.scopeKey);

  if (input.trigger !== 'manual' && !isSyncAllowed(input.trigger)) {
    return { status: 'PAUSED', ...initial };
  }

  emit(input.onProgress, 'checking', 'Comprobando conexión y sesión');

  if (!(await hasInternet())) {
    return { status: 'OFFLINE', ...initial };
  }

  if (!input.sessionToken || !input.scopeKey) {
    return { status: 'SESSION_EXPIRED', ...initial };
  }

  const lease = await acquireSyncLease(db);
  if (!lease) {
    return { status: 'BUSY', ...initial };
  }

  const shouldContinue = () => input.trigger === 'manual'
    || isSyncAllowed(input.trigger);
  const keepLeaseAlive = async () => {
    await renewSyncLease(db, lease.ownerId);
  };

  try {
    await recoverInterruptedOutbox(db, input.scopeKey);

    emit(input.onProgress, 'pull', '1. Actualizando información');
    for (const config of DELTA_RESOURCES) {
      await synchronizeDeltaResource(db, {
        scopeKey: input.scopeKey,
        config,
        sessionToken: input.sessionToken,
        signal: input.signal,
        shouldContinue,
        keepLeaseAlive,
      });
    }
    await renewSyncLease(db, lease.ownerId);

    emit(input.onProgress, 'reconcile', '2. Validando catálogos');
    await refreshStaticResources(db, {
      scopeKey: input.scopeKey,
      sessionToken: input.sessionToken,
      signal: input.signal,
      shouldContinue,
      keepLeaseAlive,
    });
    await keepLeaseAlive();

    emit(input.onProgress, 'push', '3. Subiendo cambios pendientes');
    const pushResult = await pushOutbox(db, {
      scopeKey: input.scopeKey,
      sessionToken: input.sessionToken,
      signal: input.signal,
      onProgress: ({ processed }) => {
        emit(input.onProgress, 'push', `3. Subiendo cambios · ${processed} procesados`, processed);
      },
      shouldContinue,
      keepLeaseAlive,
    });
    await keepLeaseAlive();

    emit(input.onProgress, 'final-pull', '4. Comprobando cambios');
    const maintenanceConfig = DELTA_RESOURCES.find((item) => item.resource === 'maintenance');
    if (maintenanceConfig) {
      await synchronizeDeltaResource(db, {
        scopeKey: input.scopeKey,
        config: maintenanceConfig,
        sessionToken: input.sessionToken,
        signal: input.signal,
        shouldContinue,
        keepLeaseAlive,
      });
    }

    await keepLeaseAlive();
    const housekeepingBefore = new Date(
      Date.now() - COMPLETED_OUTBOX_RETENTION_MS,
    ).toISOString();
    await pruneCompletedOutbox(
      db,
      input.scopeKey,
      housekeepingBefore,
    ).catch(() => 0);
    await cleanupOrphanedMaintenanceFiles(
      db,
      input.scopeKey,
    ).catch(() => 0);

    const counts = await currentCounts(db, input.scopeKey);
    emit(input.onProgress, 'complete', 'Sincronización completada');

    if (counts.conflictCount > 0) {
      return { status: 'CONFLICT', ...counts };
    }
    if (pushResult.blocked > 0) {
      const blockedResult: SyncCycleResult = {
        status: 'ERROR',
        ...counts,
        errorCode: 'OUTBOX_BLOCKED',
        errorMessage: `${pushResult.blocked} operación${pushResult.blocked === 1 ? '' : 'es'} requiere${pushResult.blocked === 1 ? '' : 'n'} corrección antes de sincronizar.`,
      };
      await markSyncError(db, input.scopeKey, 'maintenance', {
        code: blockedResult.errorCode,
        message: blockedResult.errorMessage,
      }).catch(() => undefined);
      return blockedResult;
    }
    return {
      status: counts.pendingCount > 0 ? 'PENDING' : 'UPDATED',
      ...counts,
    };
  } catch (error) {
    const counts = await currentCounts(db, input.scopeKey);
    const result = errorResult(
      error,
      counts.pendingCount,
      counts.conflictCount,
    );
    if (result.status === 'ERROR') {
      await markSyncError(db, input.scopeKey, 'maintenance', {
        code: result.errorCode,
        message: result.errorMessage,
      }).catch(() => undefined);
    }
    return result;
  } finally {
    await releaseSyncLease(db, lease.ownerId).catch(() => undefined);
  }
}

export async function runMaintenanceDetailRefresh(
  db: SQLiteDatabase,
  input: {
    maintenanceId: string;
    scopeKey: string;
    sessionToken: string;
    signal?: AbortSignal;
    onProgress?: (progress: SyncProgress) => void;
  },
): Promise<SyncCycleResult> {
  const initial = await currentCounts(db, input.scopeKey);

  emit(input.onProgress, 'checking', 'Comprobando conexión y sesión');
  if (!(await hasInternet())) return { status: 'OFFLINE', ...initial };
  if (!input.sessionToken || !input.scopeKey) {
    return { status: 'SESSION_EXPIRED', ...initial };
  }

  const maintenanceId = String(input.maintenanceId || '').trim();
  if (!maintenanceId) {
    return {
      status: 'ERROR',
      ...initial,
      errorCode: 'MAINTENANCE_ID_REQUIRED',
      errorMessage: 'No se pudo identificar el mantenimiento.',
    };
  }

  const lease = await acquireSyncLease(db);
  if (!lease) return { status: 'BUSY', ...initial };

  try {
    emit(input.onProgress, 'detail', 'Actualizando detalle del mantenimiento');
    await renewSyncLease(db, lease.ownerId);
    const data = await actionRequest<Record<string, unknown>>(
      'maintenance.get',
      { maintenanceId },
      input.sessionToken,
      { signal: input.signal },
    );
    await renewSyncLease(db, lease.ownerId);
    await persistAuthorizedMaintenanceDetail(
      db,
      input.scopeKey,
      data,
    );

    const counts = await currentCounts(db, input.scopeKey);
    emit(input.onProgress, 'complete', 'Detalle disponible sin conexión');
    return {
      status: counts.conflictCount > 0
        ? 'CONFLICT'
        : counts.pendingCount > 0
          ? 'PENDING'
          : 'UPDATED',
      ...counts,
    };
  } catch (error) {
    const counts = await currentCounts(db, input.scopeKey);
    return errorResult(error, counts.pendingCount, counts.conflictCount);
  } finally {
    await releaseSyncLease(db, lease.ownerId).catch(() => undefined);
  }
}
