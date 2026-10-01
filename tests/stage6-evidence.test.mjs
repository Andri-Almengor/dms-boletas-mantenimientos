import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const app = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
const evidence = await readFile(new URL('../src/features/maintenance/maintenanceEvidence.ts', import.meta.url), 'utf8');
const storage = await readFile(new URL('../src/services/maintenanceEvidenceStorage.ts', import.meta.url), 'utf8');
const repository = await readFile(new URL('../src/db/evidenceRepository.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../src/db/outboxRepository.ts', import.meta.url), 'utf8');
const push = await readFile(new URL('../src/sync/syncPush.ts', import.meta.url), 'utf8');
const manager = await readFile(new URL('../src/components/maintenance/MaintenanceEvidenceManager.tsx', import.meta.url), 'utf8');
const detail = await readFile(new URL('../src/app/maintenance/[maintenanceId]/device/[deviceId].tsx', import.meta.url), 'utf8');

test('Etapa 6 instala APIs Expo compatibles con cámara, galería y video', () => {
  assert.equal(pkg.dependencies['expo-image-picker'], '~57.0.20');
  assert.equal(pkg.dependencies['expo-video'], '~57.0.4');
  const pickerPlugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-image-picker');
  assert.ok(pickerPlugin);
  assert.match(JSON.stringify(pickerPlugin), /cameraPermission/);
  assert.match(JSON.stringify(pickerPlugin), /microphonePermission/);
});

test('límites de evidencia móvil permanecen alineados con la web', () => {
  assert.match(evidence, /EVIDENCE_VIDEO_MAX_SECONDS = 90/);
  assert.match(evidence, /EVIDENCE_IMAGE_MAX_BYTES = 15 \* 1024 \* 1024/);
  assert.match(evidence, /EVIDENCE_VIDEO_MAX_BYTES = 300 \* 1024 \* 1024/);
  assert.match(evidence, /LARGE_EVIDENCE_THRESHOLD_BYTES = 6 \* 1024 \* 1024/);
});

test('captura local persiste el archivo antes de crear la operación de sincronización', () => {
  assert.match(storage, /documentDirectory/);
  assert.match(storage, /copyAsync/);
  assert.match(repository, /withExclusiveTransactionAsync/);
  assert.match(repository, /registerLocalFile\(transaction/);
  assert.match(repository, /enqueueOutboxOperationTx\(transaction/);
  assert.match(manager, /persistPickedEvidenceAsset/);
  assert.match(manager, /saveLocalEvidence/);
  assert.doesNotMatch(manager, /actionRequest\(/);
  assert.doesNotMatch(manager, /fetch\(/);
});

test('caché remota usa maintenance.media.get protegido y no Drive directamente', () => {
  assert.match(storage, /maintenance\.media\.get/);
  assert.match(storage, /downloadAsync/);
  assert.match(storage, /attachLocalFileToEvidence/);
  assert.doesNotMatch(storage, /drive\.google\.com/);
  assert.doesNotMatch(manager, /DriveURL/);
});

test('evidencias de mantenimiento conservan Antes/Despues y destinos de Proyecto', () => {
  assert.match(evidence, /normalizeEvidenceType/);
  assert.match(evidence, /Antes/);
  assert.match(evidence, /Despues/);
  assert.match(evidence, /ProyectoDestinoTipo/);
  assert.match(evidence, /ProyectoRelacionClave/);
  assert.match(evidence, /ProyectoComponenteLocalID/);
  assert.match(manager, /projectEvidenceTargets/);
});

test('editar evidencia local coalesca subida pendiente y ordena cambios tras una subida in-flight', () => {
  assert.match(repository, /operation_kind === 'MEDIA_UPLOAD'/);
  assert.match(repository, /mediaUpload\?\.status === 'IN_FLIGHT'/);
  assert.match(repository, /dependsOnOperationId: mediaUpload\.operation_id/);
  assert.match(repository, /maintenance\.images\.update/);
  assert.match(outbox, /status IN \('PENDING', 'FAILED'\)/);
  assert.match(outbox, /status = 'PENDING'/);
  assert.match(outbox, /next_attempt_at = ''/);
});

test('el borrado local utiliza tombstone y maintenance.images.delete', () => {
  assert.match(repository, /maintenance\.images\.delete/);
  assert.match(repository, /tombstone = 1/);
  assert.match(repository, /markEvidenceDeleteConfirmed/);
  assert.match(push, /operation_kind === 'DELETE'/);
  assert.match(push, /entity_type === 'maintenanceEvidence'/);
});

test('archivos mayores a 6 MB reutilizan carga segmentada existente', () => {
  assert.match(push, /maintenance\.images\.large\.init/);
  assert.match(push, /maintenance\.images\.large\.chunk/);
  assert.match(push, /mediaType === 'video'/);
  assert.match(push, /position: offset/);
  assert.match(push, /length,/);
  assert.match(push, /LARGE_EVIDENCE_CHUNK_BYTES/);
});

test('detalle de dispositivo comparte el administrador de evidencias', () => {
  assert.match(detail, /MaintenanceEvidenceManager/);
  assert.match(detail, /maintenanceType=/);
  assert.match(detail, /readOnly=/);
});

test('ImagePicker recupera resultados pendientes de Android y soporta edición nativa de foto', () => {
  assert.match(manager, /getPendingResultAsync/);
  assert.match(manager, /launchCameraAsync/);
  assert.match(manager, /launchImageLibraryAsync/);
  assert.match(manager, /allowsEditing: true/);
  assert.match(manager, /allowsMultipleSelection: true/);
  assert.match(manager, /videoMaxDuration: 90/);
});
