import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const schema = await readFile(new URL('../src/db/schema.ts', import.meta.url), 'utf8');
const repository = await readFile(new URL('../src/db/maintenanceRepository.ts', import.meta.url), 'utf8');
const domain = await readFile(new URL('../src/features/maintenance/maintenanceListDomain.ts', import.meta.url), 'utf8');
const screen = await readFile(new URL('../src/app/index.tsx', import.meta.url), 'utf8');
const filters = await readFile(new URL('../src/components/maintenance/MaintenanceFilterModal.tsx', import.meta.url), 'utf8');

test('Etapa 4 registra estado explícito de detalle descargado', () => {
  assert.match(schema, /\{ version: 4, sql: MIGRATION_4 \}/);
  assert.match(schema, /CREATE TABLE IF NOT EXISTS local_maintenance_detail_state/);
  assert.match(schema, /complete INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /device_count INTEGER NOT NULL DEFAULT 0/);
  assert.match(schema, /evidence_count INTEGER NOT NULL DEFAULT 0/);
});

test('lista offline pagina y filtra en SQLite sin cargar toda la tabla en memoria', () => {
  assert.match(repository, /COUNT\(\*\) OVER\(\)/);
  assert.match(repository, /LIMIT \? OFFSET \?/);
  assert.match(repository, /LOWER\(m\.payload_json\) LIKE \?/);
  assert.match(repository, /m\.client_name = \?/);
  assert.match(repository, /SUBSTR\(m\.maintenance_date, 1, 10\) >= \?/);
  assert.match(repository, /SUBSTR\(m\.maintenance_date, 1, 10\) <= \?/);
  assert.match(repository, /WITH device_counts AS/);
});

test('normalización conserva compatibilidad FINALIZADO/FINALIZADA', () => {
  assert.match(domain, /\['FINALIZADO', 'FINALIZADA'\]/);
  assert.match(repository, /IN \('FINALIZADO','FINALIZADA'\)/);
});

test('pantalla principal consume exclusivamente el repositorio local para listar', () => {
  assert.match(screen, /listLocalMaintenancesPage/);
  assert.match(screen, /listLocalMaintenanceClients/);
  assert.match(screen, /MAINTENANCE_LIST_PAGE_SIZE/);
  assert.doesNotMatch(screen, /actionRequest\(/);
  assert.doesNotMatch(screen, /fetch\(/);
});

test('filtros usan selector nativo de fecha y cliente local', () => {
  assert.match(filters, /@react-native-community\/datetimepicker/);
  assert.match(filters, /clients\.map/);
  assert.match(filters, /dateFrom/);
  assert.match(filters, /dateTo/);
});
