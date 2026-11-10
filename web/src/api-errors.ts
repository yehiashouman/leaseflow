import { isAxiosError } from 'axios';
export function requestError(cause: unknown, fallback = 'Request failed. Retry.') {
  if (!isAxiosError(cause)) return fallback;
  const data: unknown = cause.response?.data;
  const body =
    data && typeof data === 'object' ? (data as { message?: unknown; requestId?: unknown }) : {};
  const message = typeof body.message === 'string' ? body.message.slice(0, 1000) : fallback;
  const candidate = body.requestId ?? cause.response?.headers?.['x-request-id'];
  const reference =
    typeof candidate === 'string' && /^[A-Za-z0-9_-]{8,80}$/.test(candidate) ? candidate : '';
  return message + (reference && !message.includes(reference) ? ' Reference: ' + reference : '');
}
export function recoverableQueryError(error: unknown) {
  if (!isAxiosError(error)) return false;
  const status = error.response?.status;
  return status === undefined || status >= 500 || [408, 409, 429].includes(status);
}
