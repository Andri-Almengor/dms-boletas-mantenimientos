import { buildLocalDataScope } from '@/auth/dataScope';
import {
  clearStoredSession,
  readStoredSession,
} from '@/auth/sessionStore';
import {
  DATABASE_NAME,
  initializeDatabase,
} from '@/db/database';
import { runSyncCycle } from '@/sync/SyncCoordinator';
import { isSyncAllowed } from '@/sync/syncPolicy';
import * as BackgroundTask from 'expo-background-task';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';

export const BACKGROUND_SYNC_TASK_NAME = 'dms-maintenance-background-sync';
export const BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES = 60;

async function executeBackgroundSync() {
  if (!isSyncAllowed('background')) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  const session = await readStoredSession();
  if (!session.sessionToken || !session.user) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  const scopeKey = buildLocalDataScope(
    session.user,
    session.permissions,
  );
  if (!scopeKey) {
    return BackgroundTask.BackgroundTaskResult.Success;
  }

  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  try {
    await initializeDatabase(db);
    const result = await runSyncCycle(db, {
      trigger: 'background',
      scopeKey,
      sessionToken: session.sessionToken,
    });

    if (result.status === 'SESSION_EXPIRED') {
      await clearStoredSession().catch(() => undefined);
      return BackgroundTask.BackgroundTaskResult.Success;
    }

    return result.status === 'ERROR'
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } finally {
    await db.closeAsync().catch(() => undefined);
  }
}

if (!TaskManager.isTaskDefined(BACKGROUND_SYNC_TASK_NAME)) {
  TaskManager.defineTask(
    BACKGROUND_SYNC_TASK_NAME,
    async ({ error }) => {
      if (error) return BackgroundTask.BackgroundTaskResult.Failed;
      try {
        return await executeBackgroundSync();
      } catch {
        return BackgroundTask.BackgroundTaskResult.Failed;
      }
    },
  );
}

export async function ensureBackgroundSyncRegistration() {
  try {
    if (!await TaskManager.isAvailableAsync()) return false;
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return false;

    const registered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SYNC_TASK_NAME,
    );
    if (!registered) {
      await BackgroundTask.registerTaskAsync(
        BACKGROUND_SYNC_TASK_NAME,
        {
          minimumInterval: BACKGROUND_SYNC_MINIMUM_INTERVAL_MINUTES,
        },
      );
    }
    return true;
  } catch {
    return false;
  }
}

export async function unregisterBackgroundSync() {
  try {
    const registered = await TaskManager.isTaskRegisteredAsync(
      BACKGROUND_SYNC_TASK_NAME,
    );
    if (registered) {
      await BackgroundTask.unregisterTaskAsync(
        BACKGROUND_SYNC_TASK_NAME,
      );
    }
  } catch {
    // El cierre de sesión no depende de background tasks.
  }
}
