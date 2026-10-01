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
  const conflictId = createLocalId('conflict');
  const now = new Date().toISOString();
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
