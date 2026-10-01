import type { SQLiteDatabase } from 'expo-sqlite';
import {
  parseJsonObject,
  stringifyJson,
} from '@/db/json';
import { enqueueOutboxOperationTx } from '@/db/outboxRepository';

type RecordLike = Record<string, unknown>;

function normalizeStatus(value: unknown) {
  const status = String(value || '').trim().toUpperCase();
  return status === 'FINALIZADA' ? 'FINALIZADO' : status;
}

export function maintenanceFinalizationRequestId(maintenanceId: string) {
  return `finalize-${String(maintenanceId || '').trim()}`;
}

export function maintenanceFinalizationDedupeKey(maintenanceId: string) {
  return `maintenanceFinalize:${String(maintenanceId || '').trim()}`;
}

export async function queueLocalMaintenanceFinalization(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    maintenanceId: string;
  },
) {
  const maintenanceId = String(input.maintenanceId || '').trim();
  if (!maintenanceId) throw new Error('No se indicó el mantenimiento que se debe finalizar.');

  let result: { operationId: string; alreadyFinalized: boolean } | null = null;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    const row = await transaction.getFirstAsync<{
      payload_json: string;
      status: string;
      sync_status: string;
    }>(
      `SELECT payload_json, status, sync_status
       FROM local_maintenances
       WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
      input.scopeKey,
      maintenanceId,
    );
    if (!row) throw new Error('El mantenimiento no está disponible en SQLite.');

    const status = normalizeStatus(row.status);
    if (status === 'FINALIZADO') {
      result = { operationId: '', alreadyFinalized: true };
      return;
    }
    if (status !== 'PENDIENTE') {
      throw new Error('Solo los mantenimientos pendientes pueden finalizarse.');
    }

    const devices = await transaction.getFirstAsync<{ total: number }>(
      `SELECT COUNT(*) AS total
       FROM local_maintenance_devices
       WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
      input.scopeKey,
      maintenanceId,
    );
    if (Number(devices?.total || 0) < 1) {
      throw new Error('Debe existir al menos un dispositivo registrado antes de finalizar.');
    }

    const inFlight = await transaction.getFirstAsync<{ operation_id: string }>(
      `SELECT operation_id
       FROM sync_outbox
       WHERE scope_key = ?
         AND aggregate_id = ?
         AND operation_kind = 'FINALIZE_PENDING'
         AND status = 'IN_FLIGHT'
       ORDER BY row_id DESC
       LIMIT 1`,
      input.scopeKey,
      maintenanceId,
    );
    if (inFlight) {
      result = { operationId: inFlight.operation_id, alreadyFinalized: false };
      return;
    }

    const requestedAt = new Date().toISOString();
    const requestId = maintenanceFinalizationRequestId(maintenanceId);
    const payload = {
      maintenanceId,
      MantenimientoID: maintenanceId,
      finalizationRequestId: requestId,
      retryFinalization: false,
      cancelScheduledFinalization: false,
      forceScheduledFinalization: true,
      finalizationMode: 'NOW',
      requestedAt,
    };

    const local = parseJsonObject<RecordLike>(row.payload_json);
    const marked = {
      ...local,
      EstadoFinalizacion: 'PENDIENTE_SINCRONIZACION',
      PasoFinalizacion: 'ESPERANDO_SINCRONIZACION',
      FinalizacionSolicitudID: requestId,
      FinalizacionPendiente: true,
      FinalizacionSolicitadaEn: requestedAt,
      UltimoErrorFinalizacion: '',
    };

    await transaction.runAsync(
      `UPDATE local_maintenances
       SET payload_json = ?,
           sync_status = CASE
             WHEN sync_status = 'LOCAL_ONLY' THEN sync_status
             ELSE 'PENDING'
           END,
           local_updated_at = ?
       WHERE scope_key = ? AND maintenance_id = ?`,
      stringifyJson(marked),
      requestedAt,
      input.scopeKey,
      maintenanceId,
    );

    const queued = await enqueueOutboxOperationTx(transaction, {
      scopeKey: input.scopeKey,
      operationKind: 'FINALIZE_PENDING',
      route: 'maintenance.finalize',
      entityType: 'maintenance',
      entityId: maintenanceId,
      aggregateId: maintenanceId,
      payload,
      priority: 90,
      dedupeKey: maintenanceFinalizationDedupeKey(maintenanceId),
    });

    result = {
      operationId: queued.operationId,
      alreadyFinalized: false,
    };
  });

  if (!result) throw new Error('No se pudo registrar la finalización local.');
  return result;
}

export async function applyMaintenanceFinalizationAcceptedTx(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    maintenanceId: string;
    result: unknown;
  },
) {
  const row = await db.getFirstAsync<{
    payload_json: string;
    status: string;
  }>(
    `SELECT payload_json, status
     FROM local_maintenances
     WHERE scope_key = ? AND maintenance_id = ? AND tombstone = 0`,
    input.scopeKey,
    input.maintenanceId,
  );
  if (!row) return;

  const response = input.result && typeof input.result === 'object'
    ? input.result as RecordLike
    : {};
  const remote = (
    response.mantenimiento
    || response.maintenance
    || {}
  ) as RecordLike;

  const local = parseJsonObject<RecordLike>(row.payload_json);
  const merged = {
    ...local,
    ...remote,
    FinalizacionPendiente: false,
  };
  const status = remote.Estado !== undefined
    ? normalizeStatus(remote.Estado)
    : normalizeStatus(row.status);
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE local_maintenances
     SET payload_json = ?,
         status = ?,
         sync_status = 'SYNCED',
         finalization_date = CASE
           WHEN ? <> '' THEN ?
           ELSE finalization_date
         END,
         server_updated_at = CASE
           WHEN ? <> '' THEN ?
           ELSE server_updated_at
         END,
         local_updated_at = ?,
         last_synced_at = ?
     WHERE scope_key = ? AND maintenance_id = ?`,
    stringifyJson(merged),
    status || 'PENDIENTE',
    String(remote.FechaFinalizacion || ''),
    String(remote.FechaFinalizacion || ''),
    String(remote.FinalizacionActualizadaEn || ''),
    String(remote.FinalizacionActualizadaEn || ''),
    now,
    now,
    input.scopeKey,
    input.maintenanceId,
  );
}
