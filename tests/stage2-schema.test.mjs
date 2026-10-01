import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');

test('Etapa 2 crea almacenamiento local operacional separado por scope', () => {
  for (const table of [
    'local_maintenances',
    'local_maintenance_devices',
    'local_maintenance_evidence',
    'local_resource_items',
    'local_files',
    'sync_state',
    'sync_outbox',
    'sync_conflicts',
  ]) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(schema, /PRIMARY KEY \(scope_key, maintenance_id\)/);
  assert.match(schema, /PRIMARY KEY \(scope_key, device_id\)/);
  assert.match(schema, /PRIMARY KEY \(scope_key, evidence_id\)/);
});

test('outbox conserva identidad, dependencias y orden estable', () => {
  assert.match(schema, /operation_id TEXT NOT NULL UNIQUE/);
  assert.match(schema, /mutation_id TEXT NOT NULL UNIQUE/);
  assert.match(schema, /depends_on_operation_id TEXT NOT NULL/);
  assert.match(schema, /row_id INTEGER PRIMARY KEY AUTOINCREMENT/);
  assert.match(schema, /ix_sync_outbox_scope_ready/);
});

test('evidencias guardan referencia de archivo y no blobs base64', () => {
  assert.match(schema, /local_file_id TEXT NOT NULL DEFAULT ''/);
  assert.match(schema, /local_uri TEXT NOT NULL/);
  assert.doesNotMatch(schema, /base64\s+(?:TEXT|BLOB)/i);
});
