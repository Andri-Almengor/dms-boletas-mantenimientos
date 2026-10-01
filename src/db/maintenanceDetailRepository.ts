import type { SQLiteDatabase } from 'expo-sqlite';
import { parseJsonObject } from '@/db/json';
import { upsertRemoteMaintenance } from '@/db/maintenanceRepository';
import { upsertRemoteDevice } from '@/db/deviceRepository';
import { upsertRemoteEvidence } from '@/db/evidenceRepository';
import {
  hasUnresolvedEntityOperations,
} from '@/db/outboxRepository';

type RecordLike = Record<string, unknown>;

export type LocalEvidenceView = RecordLike & {
  __local?: {
    syncStatus: string;
    localUri: string;
  };
};

export type LocalDeviceView = RecordLike & {
  Imagenes?: LocalEvidenceView[];
  __local?: {
    syncStatus: string;
  };
};

export type LocalMaintenanceDetail = {
  mantenimiento: RecordLike;
  dispositivos: LocalDeviceView[];
  detailComplete: boolean;
  downloadedAt: string;
};

export type LocalDeviceDetail = {
  device: LocalDeviceView;
  evidence: LocalEvidenceView[];
  position: number;
  total: number;
  previousDeviceId: string;
  nextDeviceId: string;
};

function maintenanceIdOf(record: RecordLike) {
  return String(
    record.MantenimientoID
      || record.maintenanceId
      || record.id
      || '',
  ).trim();
}

function deviceIdOf(record: RecordLike) {
  return String(
    record.EvidenciaMantenimientoID
      || record.deviceId
      || record.id
      || '',
  ).trim();
}

function evidenceIdOf(record: RecordLike) {
  return String(
    record.FotoDispositivoID
      || record.imageId
      || record.id
      || '',
  ).trim();
}

/**
 * Materializa un maintenance.get autorizado sin pisar trabajo local pendiente.
 * El backend continúa siendo la fuente de verdad; SQLite conserva los overlays
 * locales hasta que la outbox los confirme o el usuario resuelva un conflicto.
 */
export async function persistAuthorizedMaintenanceDetail(
  db: SQLiteDatabase,
  scopeKey: string,
  data: Record<string, unknown>,
) {
  const maintenance = (data.mantenimiento || data.maintenance || data) as RecordLike;
  const maintenanceId = maintenanceIdOf(maintenance);
  if (!maintenanceId) throw new Error('maintenance.get no devolvió MantenimientoID.');

  const devices = Array.isArray(data.dispositivos)
    ? data.dispositivos as RecordLike[]
    : [];
  const remoteDeviceIds = new Set<string>();
  const remoteEvidenceIds = new Set<string>();
  let remoteEvidenceCount = 0;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const maintenanceDirty = await hasUnresolvedEntityOperations(
      transaction,
      scopeKey,
      'maintenance',
      maintenanceId,
    );
    if (!maintenanceDirty) {
      await upsertRemoteMaintenance(transaction, scopeKey, maintenance);
    }

    for (const device of devices) {
      const deviceId = deviceIdOf(device);
      if (!deviceId) continue;
      remoteDeviceIds.add(deviceId);

      const deviceRecord = {
        ...device,
        MantenimientoRef: maintenanceId,
        MantenimientoID: maintenanceId,
        maintenanceId,
      };
      const deviceDirty = await hasUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenanceDevice',
        deviceId,
      );
      if (!deviceDirty) {
        await upsertRemoteDevice(transaction, scopeKey, deviceRecord);
      }

      const evidence = Array.isArray(device.Imagenes)
        ? device.Imagenes as RecordLike[]
        : Array.isArray(device.images)
          ? device.images as RecordLike[]
          : [];

      for (const item of evidence) {
        const evidenceId = evidenceIdOf(item);
        if (!evidenceId) continue;
        remoteEvidenceIds.add(evidenceId);
        remoteEvidenceCount += 1;

        const evidenceDirty = await hasUnresolvedEntityOperations(
          transaction,
          scopeKey,
          'maintenanceEvidence',
          evidenceId,
        );
        if (!evidenceDirty) {
          await upsertRemoteEvidence(
            transaction,
            scopeKey,
            maintenanceId,
            deviceId,
            item,
          );
        }
      }
    }

    const localDevices = await transaction.getAllAsync<{
      device_id: string;
      sync_status: string;
    }>(
      `SELECT device_id, sync_status
       FROM local_maintenance_devices
       WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
      scopeKey,
      maintenanceId,
    );

    for (const row of localDevices) {
      if (remoteDeviceIds.has(row.device_id) || row.sync_status !== 'SYNCED') continue;
      const dirty = await hasUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenanceDevice',
        row.device_id,
      );
      if (!dirty) {
        await transaction.runAsync(
          `UPDATE local_maintenance_devices
           SET tombstone = 1, local_updated_at = ?
           WHERE scope_key = ? AND device_id = ?`,
          new Date().toISOString(),
          scopeKey,
          row.device_id,
        );
      }
    }

    const localEvidence = await transaction.getAllAsync<{
      evidence_id: string;
      sync_status: string;
    }>(
      `SELECT evidence_id, sync_status
       FROM local_maintenance_evidence
       WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
      scopeKey,
      maintenanceId,
    );

    for (const row of localEvidence) {
      if (remoteEvidenceIds.has(row.evidence_id) || row.sync_status !== 'SYNCED') continue;
      const dirty = await hasUnresolvedEntityOperations(
        transaction,
        scopeKey,
        'maintenanceEvidence',
        row.evidence_id,
      );
      if (!dirty) {
        await transaction.runAsync(
          `UPDATE local_maintenance_evidence
           SET tombstone = 1, local_updated_at = ?
           WHERE scope_key = ? AND evidence_id = ?`,
          new Date().toISOString(),
          scopeKey,
          row.evidence_id,
        );
      }
    }

    const downloadedAt = new Date().toISOString();
    await transaction.runAsync(
      `INSERT INTO local_maintenance_detail_state (
         scope_key, maintenance_id, complete, downloaded_at,
         server_updated_at, device_count, evidence_count
       ) VALUES (?, ?, 1, ?, ?, ?, ?)
       ON CONFLICT(scope_key, maintenance_id) DO UPDATE SET
         complete = 1,
         downloaded_at = excluded.downloaded_at,
         server_updated_at = excluded.server_updated_at,
         device_count = excluded.device_count,
         evidence_count = excluded.evidence_count`,
      scopeKey,
      maintenanceId,
      downloadedAt,
      String(maintenance.FechaActualizacion || maintenance.FechaCreacion || ''),
      remoteDeviceIds.size,
      remoteEvidenceCount,
    );
  });

  return maintenanceId;
}

export async function readLocalMaintenanceDetail(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
): Promise<LocalMaintenanceDetail | null> {
  const maintenanceRow = await db.getFirstAsync<{
    payload_json: string;
    sync_status: string;
    complete: number;
    downloaded_at: string;
  }>(
    `SELECT
       m.payload_json,
       m.sync_status,
       COALESCE(ds.complete, 0) AS complete,
       COALESCE(ds.downloaded_at, '') AS downloaded_at
     FROM local_maintenances m
     LEFT JOIN local_maintenance_detail_state ds
       ON ds.scope_key = m.scope_key AND ds.maintenance_id = m.maintenance_id
     WHERE m.scope_key = ? AND m.maintenance_id = ? AND m.tombstone = 0`,
    scopeKey,
    maintenanceId,
  );
  if (!maintenanceRow) return null;

  const deviceRows = await db.getAllAsync<{
    device_id: string;
    payload_json: string;
    sync_status: string;
  }>(
    `SELECT device_id, payload_json, sync_status
     FROM local_maintenance_devices
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0
     ORDER BY
       equipment_location_name COLLATE NOCASE ASC,
       zone COLLATE NOCASE ASC,
       device_name COLLATE NOCASE ASC,
       local_updated_at ASC`,
    scopeKey,
    maintenanceId,
  );

  const evidenceRows = await db.getAllAsync<{
    device_id: string;
    payload_json: string;
    sync_status: string;
    local_uri: string;
  }>(
    `SELECT
       e.device_id,
       e.payload_json,
       e.sync_status,
       COALESCE(f.local_uri, '') AS local_uri
     FROM local_maintenance_evidence e
     LEFT JOIN local_files f
       ON f.file_id = e.local_file_id AND f.scope_key = e.scope_key
     WHERE e.scope_key = ? AND e.maintenance_id = ? AND e.tombstone = 0
     ORDER BY e.captured_at DESC, e.local_updated_at DESC`,
    scopeKey,
    maintenanceId,
  );

  const evidenceByDevice = new Map<string, LocalEvidenceView[]>();
  for (const row of evidenceRows) {
    const item: LocalEvidenceView = {
      ...parseJsonObject<RecordLike>(row.payload_json),
      __local: {
        syncStatus: row.sync_status,
        localUri: row.local_uri,
      },
    };
    const list = evidenceByDevice.get(row.device_id) || [];
    list.push(item);
    evidenceByDevice.set(row.device_id, list);
  }

  const devices: LocalDeviceView[] = deviceRows.map((row) => ({
    ...parseJsonObject<RecordLike>(row.payload_json),
    Imagenes: evidenceByDevice.get(row.device_id) || [],
    __local: { syncStatus: row.sync_status },
  }));

  return {
    mantenimiento: {
      ...parseJsonObject<RecordLike>(maintenanceRow.payload_json),
      __local: { syncStatus: maintenanceRow.sync_status },
    },
    dispositivos: devices,
    detailComplete: Boolean(maintenanceRow.complete),
    downloadedAt: maintenanceRow.downloaded_at,
  };
}

export async function readLocalDeviceDetail(
  db: SQLiteDatabase,
  scopeKey: string,
  maintenanceId: string,
  deviceId: string,
): Promise<LocalDeviceDetail | null> {
  const deviceRow = await db.getFirstAsync<{
    payload_json: string;
    sync_status: string;
  }>(
    `SELECT payload_json, sync_status
     FROM local_maintenance_devices
     WHERE scope_key = ? AND maintenance_id = ? AND device_id = ? AND tombstone = 0`,
    scopeKey,
    maintenanceId,
    deviceId,
  );
  if (!deviceRow) return null;

  const navigation = await db.getAllAsync<{ device_id: string }>(
    `SELECT device_id
     FROM local_maintenance_devices
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0
     ORDER BY
       equipment_location_name COLLATE NOCASE ASC,
       zone COLLATE NOCASE ASC,
       device_name COLLATE NOCASE ASC,
       local_updated_at ASC`,
    scopeKey,
    maintenanceId,
  );
  const index = navigation.findIndex((item) => item.device_id === deviceId);

  const evidenceRows = await db.getAllAsync<{
    payload_json: string;
    sync_status: string;
    local_uri: string;
  }>(
    `SELECT
       e.payload_json,
       e.sync_status,
       COALESCE(f.local_uri, '') AS local_uri
     FROM local_maintenance_evidence e
     LEFT JOIN local_files f
       ON f.file_id = e.local_file_id AND f.scope_key = e.scope_key
     WHERE e.scope_key = ? AND e.device_id = ? AND e.tombstone = 0
     ORDER BY e.captured_at DESC, e.local_updated_at DESC`,
    scopeKey,
    deviceId,
  );

  const device: LocalDeviceView = {
    ...parseJsonObject<RecordLike>(deviceRow.payload_json),
    __local: { syncStatus: deviceRow.sync_status },
  };
  const evidence: LocalEvidenceView[] = evidenceRows.map((row) => ({
    ...parseJsonObject<RecordLike>(row.payload_json),
    __local: {
      syncStatus: row.sync_status,
      localUri: row.local_uri,
    },
  }));

  return {
    device,
    evidence,
    position: index >= 0 ? index + 1 : 1,
    total: navigation.length,
    previousDeviceId: index > 0 ? navigation[index - 1].device_id : '',
    nextDeviceId: index >= 0 && index < navigation.length - 1
      ? navigation[index + 1].device_id
      : '',
  };
}
