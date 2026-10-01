import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const scopeSource = await readFile(new URL('../src/auth/dataScope.ts', import.meta.url), 'utf8');
const outboxSource = await readFile(new URL('../src/db/outboxRepository.ts', import.meta.url), 'utf8');

test('scope local depende del usuario y de la huella exacta de permisos', () => {
  assert.match(scopeSource, /UsuarioID/);
  assert.match(scopeSource, /permissionFingerprint/);
  assert.match(scopeSource, /join\('\|'\)/);
  assert.doesNotMatch(scopeSource, /hashText/);
});

test('las lecturas y escrituras de outbox están limitadas por scope_key', () => {
  assert.match(outboxSource, /WHERE scope_key = \?/);
  assert.match(outboxSource, /scope_key, mutation_id/);
});
