import * as Crypto from 'expo-crypto';

function cleanPrefix(value: string) {
  const normalized = String(value || 'local')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'local';
}

export function createLocalId(prefix = 'local') {
  return `${cleanPrefix(prefix)}-${Crypto.randomUUID()}`;
}
