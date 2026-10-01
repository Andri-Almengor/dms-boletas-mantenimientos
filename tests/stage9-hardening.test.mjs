import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const database = await readFile(new URL('../src/db/database.ts', import.meta.url), 'utf8');
const coordinator = await readFile(new URL('../src/sync/SyncCoordinator.ts', import.meta.url), 'utf8');
const pull = await readFile(new URL('../src/sync/syncPull.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/db/outboxRepository.ts', import.meta.url), 'utf8');
const conflicts = await readFile(new URL('../src/db/conflictRepository.ts', import.meta.url), 'utf8');
const files = await readFile(new URL('../src/db/localFileRepository.ts', import.meta.url), 'utf8');
const storage = await readFile(new URL('../src/services/maintenanceEvidenceStorage.ts', import.meta.url), 'utf8');

test('Etapa 9 agrega índices para barrera por agregado y housekeeping', () => {
  assert.match(schema, /\{ version: 6, sql: MIGRATION_6 \}/);
  assert.match(schema, /ix_sync_outbox_scope_aggregate/);
  assert.match(schema, /scope_key, aggregate_id, status, row_id/);
  assert.match(schema, /ix_local_files_scope_updated/);
  assert.match(schema, /\{ version: 6, sql: MIGRATION_6 \}/);
});

test('SQLite tolera concurrencia foreground/background sin cambiar durabilidad de negocio', () => {
  assert.match(database, /PRAGMA journal_mode = WAL/);
  assert.match(database, /PRAGMA busy_timeout = 5000/);
  assert.match(database, /PRAGMA optimize/);
  assert.doesNotMatch(database, /PRAGMA synchronous\s*=\s*OFF/i);
});

test('lease se renueva antes de unidades de red largas y antes de confirmar éxito local', () => {
  assert.match(coordinator, /const keepLeaseAlive = async \(\) =>/);
  assert.match(coordinator, /keepLeaseAlive,/);
  assert.match(pull, /await keepLeaseAlive\?\.\(\)/);
  assert.match(push, /await keepLeaseAlive\?\.\(\)/);
  assert.match(push, /maintenance\.images\.large\.chunk/);
  assert.match(push, /await input\.keepLeaseAlive\?\.\(\);\s*await completeSuccess/);
});

test('si se pierde el lease la instancia vieja no cambia el estado de la outbox', () => {
  const lost = push.indexOf("if (info.code === 'SYNC_LOCK_LOST')");
  const failed = push.indexOf('markOutboxFailed', lost);
  const blocked = push.indexOf('markOutboxBlocked', lost);
  assert.ok(lost >= 0);
  assert.ok(failed > lost);
  assert.ok(blocked > lost);
  assert.match(push.slice(lost, failed), /throw error/);
});

test('recuperación IN_FLIGHT ocurre solo después de adquirir el lease persistente', () => {
  const acquire = coordinator.indexOf('await acquireSyncLease(db)');
  const recover = coordinator.indexOf('await recoverInterruptedOutbox');
  assert.ok(acquire >= 0);
  assert.ok(recover > acquire);
});

test('conflictos locales son idempotentes y borrados remotos crean conflicto visible', () => {
  assert.match(conflicts, /WHERE scope_key = \? AND entity_type = \? AND entity_id = \?/);
  assert.match(conflicts, /AND status = 'OPEN'/);
  assert.match(conflicts, /UPDATE sync_conflicts/);
  assert.match(pull, /registerRemoteDeletedMaintenanceConflict/);
  assert.match(pull, /createSyncConflict/);
  assert.match(pull, /REMOTE_DELETED/);
});

test('housekeeping de outbox no borra dependencias aún necesarias', () => {
  assert.match(outbox, /pruneCompletedOutbox/);
  assert.match(outbox, /status = 'SUCCEEDED'/);
  assert.match(outbox, /dependent\.depends_on_operation_id = sync_outbox\.operation_id/);
  assert.match(outbox, /dependent\.status <> 'SUCCEEDED'/);
  assert.match(coordinator, /COMPLETED_OUTBOX_RETENTION_MS = 7/);
});

test('limpieza de archivos solo toca huérfanos antiguos y protegidos de referencias activas', () => {
  assert.match(files, /listOrphanedLocalFiles/);
  assert.match(files, /NOT EXISTS \([\s\S]*local_maintenance_evidence/);
  assert.match(files, /NOT EXISTS \([\s\S]*local_maintenance_signatures/);
  assert.match(files, /status IN \('PENDING','IN_FLIGHT','FAILED','CONFLICT','BLOCKED'\)/);
  assert.match(storage, /ORPHAN_FILE_MIN_AGE_MS = 24/);
  assert.match(storage, /deleteLocalFileRecords/);
  assert.match(coordinator, /cleanupOrphanedMaintenanceFiles/);
});

test('errores reales de sync quedan persistidos para diagnóstico y bloqueados no se reportan como éxito', () => {
  assert.match(coordinator, /markSyncError/);
  assert.match(coordinator, /OUTBOX_BLOCKED/);
  assert.match(coordinator, /if \(result\.status === 'ERROR'\)/);
});

test('hardening conserva una sola arquitectura de sincronización', () => {
  assert.match(coordinator, /runSyncCycle/);
  assert.doesNotMatch(storage, /sync\.delta/);
  assert.doesNotMatch(files, /actionRequest\(|fetch\(/);
  assert.doesNotMatch(outbox, /actionRequest\(|fetch\(/);
});
