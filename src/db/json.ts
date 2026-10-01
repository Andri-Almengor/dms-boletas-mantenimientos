export function parseJsonObject<T extends Record<string, unknown>>(
  value: string | null | undefined,
  fallback = {} as T,
): T {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as T
      : fallback;
  } catch {
    return fallback;
  }
}

export function stringifyJson(value: unknown, fallback = '{}') {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return fallback;
  }
}

export function mergeJsonPayload(
  currentJson: string | null | undefined,
  patch: Record<string, unknown>,
) {
  return {
    ...parseJsonObject<Record<string, unknown>>(currentJson),
    ...patch,
  };
}
