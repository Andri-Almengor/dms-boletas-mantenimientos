export function normalizeMacAddress(value: unknown) {
  const compact = String(value || '').replace(/[^0-9a-f]/gi, '').toUpperCase();
  if (!compact) return '';
  return compact.match(/.{1,2}/g)?.join(':').slice(0, 17) || '';
}

export function formatMacAddressInput(value: unknown) {
  return normalizeMacAddress(value);
}

export function macAddressError(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  return /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/i.test(normalizeMacAddress(text))
    ? ''
    : 'La dirección MAC debe tener el formato AA:BB:CC:DD:EE:FF.';
}
