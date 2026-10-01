import { appConfig } from '@/config/appConfig';

type ActionEnvelope<T> = {
  ok?: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ActionApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(message: string, options: { code?: string; status?: number; details?: unknown } = {}) {
    super(message);
    this.name = 'ActionApiError';
    this.code = String(options.code || 'API_ERROR');
    this.status = Number(options.status || 0);
    this.details = options.details ?? null;
  }
}

export function isAuthenticationError(error: unknown) {
  if (!(error instanceof ActionApiError)) return false;
  const code = error.code.toUpperCase();
  return error.status === 401
    || code === 'AUTH_REQUIRED'
    || code === 'SESSION_EXPIRED'
    || code === 'INVALID_SESSION'
    || code === 'UNAUTHORIZED';
}

/**
 * Contrato compartido con la web:
 * POST /api/action { route, payload, sessionToken }
 *
 * Importante: esta capa NO reintenta escrituras de forma automática.
 * Las reejecuciones idempotentes pertenecen al outbox/SyncCoordinator (Etapa 2+).
 */
export async function actionRequest<T>(
  route: string,
  payload: Record<string, unknown> = {},
  sessionToken = '',
  options: { signal?: AbortSignal } = {},
): Promise<T> {
  const response = await fetch(appConfig.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json;charset=utf-8',
    },
    body: JSON.stringify({
      route,
      payload,
      sessionToken,
    }),
    signal: options.signal,
  });

  const responseText = await response.text();
  let envelope: ActionEnvelope<T> | null = null;

  try {
    envelope = responseText ? JSON.parse(responseText) as ActionEnvelope<T> : null;
  } catch {
    throw new ActionApiError(
      'El backend respondió con un formato inválido.',
      { status: response.status, code: 'INVALID_BACKEND_RESPONSE' },
    );
  }

  if (!envelope || typeof envelope !== 'object') {
    throw new ActionApiError(
      'El backend respondió con un formato inválido.',
      { status: response.status, code: 'INVALID_BACKEND_RESPONSE' },
    );
  }

  if (!response.ok || envelope.ok !== true) {
    throw new ActionApiError(
      envelope.error?.message || 'No se pudo completar la solicitud.',
      {
        status: response.status,
        code: envelope.error?.code,
        details: envelope.error?.details,
      },
    );
  }

  return envelope.data as T;
}
