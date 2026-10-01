type LocalSyncListener = () => void;

const localSyncListeners = new Set<LocalSyncListener>();

export function subscribeLocalSyncNeeded(listener: LocalSyncListener) {
  localSyncListeners.add(listener);
  return () => {
    localSyncListeners.delete(listener);
  };
}

/**
 * Las operaciones locales no ejecutan red directamente.
 * Solo publican una señal en memoria y SyncProvider decide si corresponde
 * iniciar el SyncCoordinator según horario, sesión, red y exclusión.
 */
export function emitLocalSyncNeeded() {
  setTimeout(() => {
    for (const listener of [...localSyncListeners]) {
      try {
        listener();
      } catch {
        // Una vista desmontándose no debe afectar la escritura local.
      }
    }
  }, 0);
}
