import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../src/features/maintenance/maintenancePermissions.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');

test('firma y finalización son exclusivas de la aplicación web', () => {
  assert.doesNotMatch(detail, /MaintenanceCompletionCard|SignaturePad|Finalizar|Firma/);
  assert.doesNotMatch(permissions, /canAccessMaintenanceSignature|canFinalizeMaintenance/);
  assert.doesNotMatch(push, /SIGNATURE_UPLOAD|FINALIZE_PENDING|maintenance\.signature\.public\.submit/);
});

test('migración 7 cancela intenciones móviles antiguas sin modificar estados del servidor', () => {
  assert.match(schema, /LOCAL_SCHEMA_VERSION = 7/);
  assert.match(schema, /operation_kind IN \('SIGNATURE_UPLOAD', 'FINALIZE_PENDING'\)/);
  assert.match(schema, /status <> 'SUCCEEDED'/);
  assert.match(schema, /DELETE FROM local_maintenance_signatures/);
  assert.match(schema, /\{ version: 7, sql: MIGRATION_7 \}/);
  assert.doesNotMatch(schema, /UPDATE local_maintenances[\s\S]*Estado\s*=\s*'FINALIZADO'/);
});

test('componentes y repositorios móviles de firma/finalización fueron retirados', async () => {
  for (const relative of [
    '../src/components/maintenance/MaintenanceCompletionCard.tsx',
    '../src/components/SignaturePad.tsx',
    '../src/features/maintenance/maintenanceSignature.ts',
    '../src/db/maintenanceSignatureRepository.ts',
    '../src/db/maintenanceFinalizationRepository.ts',
    '../src/services/maintenanceSignatureStorage.ts',
  ]) {
    await assert.rejects(readFile(new URL(relative, import.meta.url), 'utf8'));
  }
});

test('la tabla histórica de firma permanece solo para migraciones compatibles', () => {
  assert.match(schema, /MIGRATION_5/);
  assert.match(schema, /local_maintenance_signatures/);
  assert.doesNotMatch(schema, /base64/i);
});
