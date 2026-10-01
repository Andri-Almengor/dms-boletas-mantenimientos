import type { SQLiteDatabase } from 'expo-sqlite';
import { stringifyJson } from '@/db/json';
import { createLocalId } from '@/utils/localId';

export async function createSyncConflict(
  db: SQLiteDatabase,
  input: {
    scopeKey: string;
    resource: string;
    entityType: string;
    entityId: string;
    aggregateId?: string;
    localPayload?: unknown;
    remotePayload?: unknown;
    basePayload?: unknown;
    reason?: string;
  },
) {
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ conflict_id: string }>(
    `SELECT conflict_id
     FROM sync_conflicts
     WHERE scope_key = ? AND entity_type = ? AND entity_id = ?
       AND status = 'OPEN'
     ORDER BY created_at DESC
     LIMIT 1`,
    input.scopeKey,
    input.entityType,
    input.entityId,
  );

  if (existing?.conflict_id) {
    await db.runAsync(
      `UPDATE sync_conflicts
       SET resource = ?, aggregate_id = ?, local_payload_json = ?,
           remote_payload_json = ?, base_payload_json = ?, reason = ?,
           updated_at = ?
       WHERE conflict_id = ?`,
      input.resource,
      String(input.aggregateId || ''),
      stringifyJson(input.localPayload),
      stringifyJson(input.remotePayload),
      stringifyJson(input.basePayload),
      String(input.reason || ''),
      now,
      existing.conflict_id,
    );
    return existing.conflict_id;
  }

  const conflictId = createLocalId('conflict');
  await db.runAsync(
    `INSERT INTO sync_conflicts (
       conflict_id, scope_key, resource, entity_type, entity_id, aggregate_id,
       local_payload_json, remote_payload_json, base_payload_json, reason,
       status, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)`,
    conflictId,
    input.scopeKey,
    input.resource,
    input.entityType,
    input.entityId,
    String(input.aggregateId || ''),
    stringifyJson(input.localPayload),
    stringifyJson(input.remotePayload),
    stringifyJson(input.basePayload),
    String(input.reason || ''),
    now,
    now,
  );
  return conflictId;
}

export async function resolveSyncConflict(
  db: SQLiteDatabase,
  conflictId: string,
  resolution: unknown,
) {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE sync_conflicts
     SET status = 'RESOLVED', resolution_json = ?, resolved_at = ?, updated_at = ?
     WHERE conflict_id = ?`,
    stringifyJson(resolution),
    now,
    now,
    conflictId,
  );
}
