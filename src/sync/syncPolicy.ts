import { appConfig } from '@/config/appConfig';

export type SyncTrigger =
  | 'background'
  | 'foreground'
  | 'network'
  | 'local-change'
  | 'manual';

export type OperationalClock = {
  hour: number;
  minute: number;
  second: number;
};

export const AUTO_SYNC_WINDOW_CLOSED_CODE = 'AUTO_SYNC_WINDOW_CLOSED';

function numericPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPartTypes,
) {
  return Number(parts.find((part) => part.type === type)?.value || 0);
}

export function getOperationalClock(now = new Date()): OperationalClock {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: appConfig.operationalTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);

  return {
    hour: numericPart(parts, 'hour'),
    minute: numericPart(parts, 'minute'),
    second: numericPart(parts, 'second'),
  };
}

export function isAutomaticSyncWindow(now = new Date()) {
  const { hour } = getOperationalClock(now);
  return hour >= appConfig.autoSyncStartHour
    && hour < appConfig.autoSyncEndHour;
}

export function isSyncAllowed(trigger: SyncTrigger, now = new Date()) {
  return trigger === 'manual' || isAutomaticSyncWindow(now);
}

export function automaticSyncWindowClosedError() {
  const error = new Error(
    'La ventana de sincronización automática finalizó. Los cambios restantes quedan pendientes para la próxima sincronización permitida o manual.',
  );
  (error as Error & { code?: string }).code = AUTO_SYNC_WINDOW_CLOSED_CODE;
  return error;
}

export function millisecondsUntilAutomaticWindowBoundary(now = new Date()) {
  const clock = getOperationalClock(now);
  const secondsNow = (clock.hour * 60 * 60) + (clock.minute * 60) + clock.second;
  const startSeconds = appConfig.autoSyncStartHour * 60 * 60;
  const endSeconds = appConfig.autoSyncEndHour * 60 * 60;
  const secondsPerDay = 24 * 60 * 60;

  if (secondsNow < startSeconds) {
    return Math.max(0, (startSeconds - secondsNow) * 1000);
  }
  if (secondsNow < endSeconds) {
    return Math.max(0, (endSeconds - secondsNow) * 1000);
  }
  return ((secondsPerDay - secondsNow) + startSeconds) * 1000;
}

/**
 * Devuelve cuánto falta para que comience la próxima ventana automática.
 * No hace polling; la Etapa 3 utilizará este valor para programar un único timer
 * cuando la app permanezca en foreground antes de las 07:00.
 */
export function millisecondsUntilNextAutomaticWindow(now = new Date()) {
  if (isAutomaticSyncWindow(now)) return 0;

  const clock = getOperationalClock(now);
  const secondsNow = (clock.hour * 60 * 60) + (clock.minute * 60) + clock.second;
  const startSeconds = appConfig.autoSyncStartHour * 60 * 60;

  if (clock.hour < appConfig.autoSyncStartHour) {
    return Math.max(0, (startSeconds - secondsNow) * 1000);
  }

  const secondsPerDay = 24 * 60 * 60;
  return ((secondsPerDay - secondsNow) + startSeconds) * 1000;
}

export function getAutomaticSyncWindowLabel(now = new Date()) {
  return isAutomaticSyncWindow(now)
    ? 'Sincronización automática disponible'
    : 'Sincronización automática pausada hasta las 07:00';
}
