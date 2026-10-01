const DEFAULT_API_URL = 'https://dms-boletas-mfqj.onrender.com/api/action';

export const appConfig = Object.freeze({
  apiUrl: String(process.env.EXPO_PUBLIC_API_URL || DEFAULT_API_URL).trim(),
  operationalTimeZone: 'America/Costa_Rica',
  autoSyncStartHour: 7,
  autoSyncEndHour: 17,
});

if (!appConfig.apiUrl) {
  throw new Error('Falta configurar EXPO_PUBLIC_API_URL.');
}
