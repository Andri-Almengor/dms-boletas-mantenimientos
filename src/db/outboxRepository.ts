import type { SQLiteDatabase } from 'expo-sqlite';
import { stringifyJson } from '@/db/json';
import { createLocalId } from '@/utils/localId';

export type OutboxStatus =
  | 'PENDING'
  | 'IN_FLIGHT'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CONFLICT'
  | 'BLOCKED';

export type EnqueueOutboxInput = {
  scopeKey: string;
  operationKind: string;
  route: string;
  entityType: string;
  entityId: string;
  aggregateId?: string;
  localFileId?: string;
  payload?: Record<string, unknown>;
  priority?: number;
  dependsOnOperationId?: string;
  dedupeKey?: string;
  mutationId?: string;
};

export type OutboxRow = {
  row_id: number;
  operation_id: string;
  scope_key: string;
  mutation_id: string;
  dedupe_key: string;
  operation_kind: string;
  route: string;
  entity_type: string;
  entity_id: string;
  aggregate_id: string;
  local_file_id: string;
  payload_json: string;
  status: OutboxStatus;
  priority: number;
  attempts: number;
  depends_on_operation_id: string;
  last_error_code: string;
  last_error_message: string;
  next_attempt_at: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
};

function required(value: string, label: string) {
  const clean = String(value || '').trim();
  if (!clean) throw new Error(`Falta ${label} para registrar la operación local.`);
  return clean;
}

function decoratedPayload(
  payload: Record<string, unknown> = {},
  mutationId: string,
) {
  return {
    ...payload,
    mutationId,
    clientMutationId: mutationId,
  };
}

export async function enqueueOutboxOperationTx(
  db: SQLiteDatabase,
  input: EnqueueOutboxInput,
) {
  const now = new Date().toISOString();
  const scopeKey = required(input.scopeKey, 'scopeKey');
  const route = required(input.route, 'route');
  const entityType = required(input.entityType, 'entityType');
  const entityId = required(input.entityId, 'entityId');
  const dedupeKey = String(
    input.dedupeKey || `${route}:${entityType}:${entityId}`,
  ).trim();

  const pending = dedupeKey
    ? await db.getFirstAsync<OutboxRow>(
      `SELECT * FROM sync_outbox
       WHERE scope_key = ? AND dedupe_key = ?
       AND status IN ('PENDING', 'FAILED')
       ORDER BY row_id DESC LIMIT 1`,
      scopeKey,
      dedupeKey,
    )
    : null;

  if (pending) {
    const payload = decoratedPayload(
      input.payload || {},
      pending.mutation_id,
    );
    await db.runAsync(
      `UPDATE sync_outbox
       SET payload_json = ?, operation_kind = ?, priority = ?,
           aggregate_id = ?, local_file_id = ?,
           depends_on_operation_id = ?, status = 'PENDING',
           next_attempt_at = '', last_error_code = '',
           last_error_message = '', updated_at = ?
       WHERE operation_id = ?`,
      stringifyJson(payload),
      input.operationKind,
      Number(input.priority ?? pending.priority ?? 100),
      String(input.aggregateId || ''),
      String(input.localFileId || ''),
      String(input.dependsOnOperationId || ''),
      now,
      pending.operation_id,
    );
    return { operationId: pending.operation_id, mutationId: pending.mutation_id, coalesced: true };
  }

  const operationId = createLocalId('op');
  const mutationId = String(input.mutationId || createLocalId('mutation'));
  const payload = decoratedPayload(input.payload || {}, mutationId);

  await db.runAsync(
    `INSERT INTO sync_outbox (
       operation_id, scope_key, mutation_id, dedupe_key, operation_kind, route,
       entity_type, entity_id, aggregate_id, local_file_id, payload_json, status,
       priority, attempts, depends_on_operation_id, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, 0, ?, ?, ?)`,
    operationId,
    scopeKey,
    mutationId,
    dedupeKey,
    input.operationKind,
    route,
    entityType,
    entityId,
    String(input.aggregateId || ''),
    String(input.localFileId || ''),
    stringifyJson(payload),
    Number(input.priority ?? 100),
    String(input.dependsOnOperationId || ''),
    now,
    now,
  );

  return { operationId, mutationId, coalesced: false };
}

export async function enqueueOutboxOperation(
  db: SQLiteDatabase,
  input: EnqueueOutboxInput,
) {
  let result: { operationId: string; mutationId: string; coalesced: boolean } | null = null;
  await db.withExclusiveTransactionAsync(async (transaction) => {
    result = await enqueueOutboxOperationTx(transaction, input);
  });
  if (!result) throw new Error('No se pudo registrar la operación en la outbox.');
  return result;
}

export async function findPendingEntityCreateOperation(
  db: SQLiteDatabase,
  scopeKey: string,
  entityType: string,
  entityId: string,
) {
  return db.getFirstAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE scope_key = ? AND entity_type = ? AND entity_id = ?
       AND status IN ('PENDING', 'IN_FLIGHT') AND operation_kind = 'CREATE'
     ORDER BY row_id DESC LIMIT 1`,
    scopeKey,
    entityType,
    entityId,
  );
}

export async function listReadyOutboxOperations(
  db: SQLiteDatabase,
  scopeKey: string,
  limit = 25,
) {
  const now = new Date().toISOString();
  return db.getAllAsync<OutboxRow>(
    `SELECT o.*
     FROM sync_outbox o
     LEFT JOIN sync_outbox dependency
       ON dependency.operation_id = o.depends_on_operation_id
     WHERE o.scope_key = ?
       AND o.status IN ('PENDING', 'FAILED')
       AND (o.next_attempt_at = '' OR o.next_attempt_at <= ?)
       AND (
         o.depends_on_operation_id = ''
         OR dependency.status = 'SUCCEEDED'
       )
       AND (
         o.operation_kind <> 'FINALIZE_PENDING'
         OR NOT EXISTS (
           SELECT 1
           FROM sync_outbox blocker
           WHERE blocker.scope_key = o.scope_key
             AND blocker.aggregate_id = o.aggregate_id
             AND blocker.operation_id <> o.operation_id
             AND blocker.status IN (
               'PENDING',
               'IN_FLIGHT',
               'FAILED',
               'CONFLICT',
               'BLOCKED'
             )
         )
       )
     ORDER BY o.priority ASC, o.row_id ASC
     LIMIT ?`,
    scopeKey,
    now,
    Math.max(1, Number(limit || 1)),
  );
}

export async function markOutboxInFlight(
  db: SQLiteDatabase,
  operationId: string,
) {
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'IN_FLIGHT', attempts = attempts + 1, updated_at = ?
     WHERE operation_id = ? AND status IN ('PENDING', 'FAILED')`,
    new Date().toISOString(),
    operationId,
  );
}

export async function markOutboxSucceeded(
  db: SQLiteDatabase,
  operationId: string,
) {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'SUCCEEDED', completed_at = ?, updated_at = ?,
         last_error_code = '', last_error_message = ''
     WHERE operation_id = ?`,
    now,
    now,
    operationId,
  );
}

export async function markOutboxFailed(
  db: SQLiteDatabase,
  operationId: string,
  error: { code?: string; message?: string } = {},
  nextAttemptAt = '',
) {
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'FAILED', last_error_code = ?, last_error_message = ?,
         next_attempt_at = ?, updated_at = ?
     WHERE operation_id = ?`,
    String(error.code || ''),
    String(error.message || ''),
    String(nextAttemptAt || ''),
    new Date().toISOString(),
    operationId,
  );
}

export async function markOutboxBlocked(
  db: SQLiteDatabase,
  operationId: string,
  error: { code?: string; message?: string } = {},
) {
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'BLOCKED', last_error_code = ?, last_error_message = ?,
         updated_at = ?
     WHERE operation_id = ?`,
    String(error.code || 'BLOCKED'),
    String(error.message || ''),
    new Date().toISOString(),
    operationId,
  );
}

export async function markOutboxConflict(
  db: SQLiteDatabase,
  operationId: string,
  message = '',
) {
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'CONFLICT', last_error_code = 'SYNC_CONFLICT',
         last_error_message = ?, updated_at = ?
     WHERE operation_id = ?`,
    message,
    new Date().toISOString(),
    operationId,
  );
}

export async function recoverInterruptedOutbox(
  db: SQLiteDatabase,
  scopeKey: string,
) {
  await db.runAsync(
    `UPDATE sync_outbox
     SET status = 'PENDING', updated_at = ?
     WHERE scope_key = ? AND status = 'IN_FLIGHT'`,
    new Date().toISOString(),
    scopeKey,
  );
}

export async function countUnresolvedOutbox(
  db: SQLiteDatabase,
  scopeKey: string,
) {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sync_outbox
     WHERE scope_key = ?
       AND status IN ('PENDING', 'IN_FLIGHT', 'FAILED', 'CONFLICT', 'BLOCKED')`,
    scopeKey,
  );
  return Number(row?.total || 0);
}

export async function countOpenConflicts(
  db: SQLiteDatabase,
  scopeKey: string,
) {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sync_conflicts
     WHERE scope_key = ? AND status = 'OPEN'`,
    scopeKey,
  );
  return Number(row?.total || 0);
}

export async function hasUnresolvedEntityOperations(
  db: SQLiteDatabase,
  scopeKey: string,
  entityType: string,
  entityId: string,
  excludeOperationId = '',
) {
  const row = await db.getFirstAsync<{ total: number }>(
    `SELECT COUNT(*) AS total FROM sync_outbox
     WHERE scope_key = ? AND entity_type = ? AND entity_id = ?
       AND status IN ('PENDING', 'IN_FLIGHT', 'FAILED', 'CONFLICT', 'BLOCKED')
       AND (? = '' OR operation_id <> ?)`,
    scopeKey,
    entityType,
    entityId,
    excludeOperationId,
    excludeOperationId,
  );
  return Number(row?.total || 0) > 0;
}

export async function listUnresolvedEntityOperations(
  db: SQLiteDatabase,
  scopeKey: string,
  entityType: string,
  entityId: string,
) {
  return db.getAllAsync<OutboxRow>(
    `SELECT * FROM sync_outbox
     WHERE scope_key = ? AND entity_type = ? AND entity_id = ?
       AND status IN ('PENDING', 'IN_FLIGHT', 'FAILED', 'CONFLICT', 'BLOCKED')
     ORDER BY row_id ASC`,
    scopeKey,
    entityType,
    entityId,
  );
}
