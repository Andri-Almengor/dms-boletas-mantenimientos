import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const signatureDomain = await readFile(new URL('../src/features/maintenance/maintenanceSignature.ts', import.meta.url), 'utf8');
const signatureRepo = await readFile(new URL('../src/db/maintenanceSignatureRepository.ts', import.meta.url), 'utf8');
const finalizationRepo = await readFile(new URL('../src/db/maintenanceFinalizationRepository.ts', import.meta.url), 'utf8');
const permissions = await readFile(new URL('../src/features/maintenance/maintenancePermissions.ts', import.meta.url), 'utf8');
const storage = await readFile(new URL('../src/services/maintenanceEvidenceStorage.ts', import.meta.url), 'utf8');
const signatureStorage = await readFile(new URL('../src/services/maintenanceSignatureStorage.ts', import.meta.url), 'utf8');
const pad = await readFile(new URL('../src/components/SignaturePad.tsx', import.meta.url), 'utf8');
const card = await readFile(new URL('../src/components/maintenance/MaintenanceCompletionCard.tsx', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/db/outboxRepository.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId].tsx', import.meta.url), 'utf8');

test('Etapa 7 migra SQLite sin convertir la firma en almacenamiento remoto paralelo', () => {
  assert.match(schema, /LOCAL_SCHEMA_VERSION = 5/);
  assert.match(schema, /local_maintenance_signatures/);
  assert.match(schema, /local_file_id/);
  assert.match(schema, /sync_status/);
  assert.doesNotMatch(schema, /base64/i);
});

test('firma local reutiliza local_files y la misma outbox transaccional', () => {
  assert.match(signatureStorage, /registerLocalFile\(transaction/);
  assert.match(signatureStorage, /saveLocalMaintenanceSignatureTx\(transaction/);
  assert.match(signatureRepo, /enqueueOutboxOperationTx\(db/);
  assert.match(signatureRepo, /operationKind: 'SIGNATURE_UPLOAD'/);
  assert.match(signatureRepo, /dedupeKey: `maintenanceSignature:/);
  assert.match(signatureStorage, /withExclusiveTransactionAsync/);
});

test('SignaturePad compartido soporta trazo y carga de imagen sin limpiar durante trazo activo', () => {
  assert.match(pad, /PanResponder\.create/);
  assert.match(pad, /drawingRef\.current/);
  assert.match(pad, /if \(disabled \|\| drawingRef\.current\) return/);
  assert.match(pad, /launchImageLibraryAsync/);
  assert.match(pad, /mediaTypes: \['images'\]/);
  assert.match(pad, /stylus/);
});

test('firma dibujada se materializa como PNG válido dentro del límite actual de 4 MB', () => {
  assert.match(signatureDomain, /SIGNATURE_MAX_BYTES = 4 \* 1024 \* 1024/);
  assert.match(signatureDomain, /137, 80, 78, 71, 13, 10, 26, 10/);
  assert.match(signatureDomain, /pngChunk\('IHDR'/);
  assert.match(signatureDomain, /pngChunk\('IDAT'/);
  assert.match(signatureDomain, /pngChunk\('IEND'/);
  assert.match(signatureDomain, /image\/png/);
  assert.match(signatureDomain, /image\/jpeg/);
});

test('persistencia física reutiliza el servicio ya existente de evidencias', () => {
  assert.match(storage, /persistLocalMaintenanceImageFile/);
  assert.match(storage, /persistBase64MaintenanceImageFile/);
  assert.match(signatureStorage, /maintenanceEvidenceStorage/);
  assert.doesNotMatch(signatureStorage, /documentDirectory/);
});

test('sync de firma reutiliza link + submit existentes y no toca Drive directamente', () => {
  assert.match(push, /maintenance\.signature\.link/);
  assert.match(push, /maintenance\.signature\.public\.submit/);
  assert.match(push, /SIGNATURE_UPLOAD/);
  assert.doesNotMatch(signatureStorage, /drive\.google\.com|DriveURL|uploadBase64/);
});

test('finalización local conserva el permiso y la ruta existentes', () => {
  assert.match(permissions, /canFinalizeMaintenance/);
  assert.match(permissions, /permissions\.includes\('USUARIOS_GESTIONAR'\)/);
  assert.doesNotMatch(permissions, /MANTENIMIENTOS_FINALIZAR|MOBILE_FINALIZE|OFFLINE_FINALIZE/);
  assert.match(finalizationRepo, /route: 'maintenance\.finalize'/);
  assert.match(finalizationRepo, /operationKind: 'FINALIZE_PENDING'/);
});

test('FINALIZE_PENDING no marca FINALIZADO de forma optimista y espera el agregado completo', () => {
  assert.match(finalizationRepo, /EstadoFinalizacion: 'PENDIENTE_SINCRONIZACION'/);
  assert.match(finalizationRepo, /PasoFinalizacion: 'ESPERANDO_SINCRONIZACION'/);
  assert.doesNotMatch(finalizationRepo, /Estado:\s*'FINALIZADO'/);
  assert.match(outbox, /o\.operation_kind <> 'FINALIZE_PENDING'/);
  assert.match(outbox, /blocker\.aggregate_id = o\.aggregate_id/);
  assert.match(outbox, /'CONFLICT'/);
  assert.match(outbox, /'BLOCKED'/);
});

test('firma sigue siendo opcional para finalizar en la interfaz móvil', () => {
  assert.match(card, /La firma es opcional/);
  assert.match(card, /boletas y PDF sin firma/);
  assert.match(card, /queueLocalMaintenanceFinalization/);
  assert.doesNotMatch(card, /syncNow\(/);
  assert.doesNotMatch(card, /actionRequest\(|fetch\(/);
});

test('detalle reutiliza la tarjeta de cierre y guardar no activa red automáticamente', () => {
  assert.match(detail, /MaintenanceCompletionCard/);
  assert.match(detail, /refreshStatus/);
  assert.doesNotMatch(signatureStorage, /actionRequest\(|fetch\(/);
  assert.doesNotMatch(finalizationRepo, /actionRequest\(|fetch\(/);
});
