import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';

const codes: Record<number, string> = {
  400: 'REQUEST_INVALID',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'MEDIA_TYPE_UNSUPPORTED',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'NOT_READY',
};
export function sendApiError(cause: unknown, request: FastifyRequest, reply: FastifyReply) {
  if (cause instanceof ZodError)
    return reply.code(422).send({
      error: 'ValidationError',
      code: 'VALIDATION_FAILED',
      message: cause.issues
        .map(({ path, message }) => `${path.join('.') || 'request'}: ${message}`)
        .join('; ')
        .slice(0, 1000),
      details: cause.issues.map(({ code, path, message }) => ({ code, path, message })),
      requestId: request.id,
    });
  const error = cause as { statusCode?: number; name?: string; message?: string; code?: string };
  const status =
    error.code === 'P2034'
      ? 409
      : error.statusCode && error.statusCode >= 400 && error.statusCode <= 599
        ? error.statusCode
        : 500;
  if (status >= 500)
    request.log.error(
      { requestId: request.id, status, errorType: error.name ?? 'Error' },
      'API request failed',
    );
  return reply.code(status).send({
    error:
      error.code === 'FST_CORS_ORIGIN_DENIED'
        ? 'Forbidden'
        : status >= 500
          ? 'InternalServerError'
          : (error.name ?? 'Error'),
    code:
      error.code === 'FST_CORS_ORIGIN_DENIED'
        ? 'ORIGIN_DENIED'
        : (codes[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_REJECTED')),
    message:
      status >= 500
        ? status === 503
          ? 'Service is not ready.'
          : 'Internal server error'
        : error.code === 'P2034'
          ? 'Record changed. Reload before retry.'
          : (error.message ?? 'Request rejected'),
    requestId: request.id,
  });
}
