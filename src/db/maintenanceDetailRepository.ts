import type { SQLiteDatabase } from 'expo-sqlite';
import { upsertRemoteMaintenance } from '@/db/maintenanceRepository';
import { upsertRemoteDevice } from '@/db/deviceRepository';
import { upsertRemoteEvidence } from '@/db/evidenceRepository';

/**
 * Persiste el formato de maintenance.get sin reinterpretar reglas de negocio.
 * Stage 3 decidirá cuándo una respuesta remota puede reemplazar datos locales
 * con cambios pendientes; este helper solo materializa una respuesta autorizada.
 */
export async function persistAuthorizedMaintenanceDetail(
  db: SQLiteDatabase,
  scopeKey: string,
  data: Record<string, unknown>,
) {
  const maintenance = (data.mantenimiento || data.maintenance || data) as Record<string, unknown>;
  const maintenanceId = String(
    maintenance.MantenimientoID
      || maintenance.maintenanceId
      || maintenance.id
      || '',
  ).trim();
  if (!maintenanceId) throw new Error('maintenance.get no devolvió MantenimientoID.');

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await upsertRemoteMaintenance(transaction, scopeKey, maintenance);

    const devices = Array.isArray(data.dispositivos)
      ? data.dispositivos as Record<string, unknown>[]
      : [];

    for (const device of devices) {
      const deviceRecord = {
        ...device,
        MantenimientoRef: maintenanceId,
        MantenimientoID: maintenanceId,
        maintenanceId,
      };
      await upsertRemoteDevice(transaction, scopeKey, deviceRecord);

      const deviceId = String(
        device.EvidenciaMantenimientoID
          || device.deviceId
          || device.id
          || '',
      ).trim();
      if (!deviceId) continue;

      const evidence = Array.isArray(device.Imagenes)
        ? device.Imagenes as Record<string, unknown>[]
        : Array.isArray(device.images)
          ? device.images as Record<string, unknown>[]
          : [];

      for (const item of evidence) {
        await upsertRemoteEvidence(
          transaction,
          scopeKey,
          maintenanceId,
          deviceId,
          item,
        );
      }
    }
  });

  return maintenanceId;
}
