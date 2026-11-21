export function apiBase(value?: string) {
  if (!value) return '/api/v1';
  if (/^\/api\/v1\/?$/.test(value)) return '/api/v1';
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('VITE_API_URL requires /api/v1 or an HTTP API URL with that path.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/api\/v1\/?$/.test(url.pathname)
  )
    throw new Error('VITE_API_URL requires /api/v1 or an HTTP API URL with that path.');
  return url.origin + '/api/v1';
}
