import axios from 'axios';
import {
  clearSessionStorage,
  previewMode,
  sessionKey,
  sessionOwnerKey,
  sessionVersion,
} from './session';

declare module 'axios' {
  interface InternalAxiosRequestConfig {
    leaseflowRetried?: boolean;
    leaseflowSessionVersion?: number;
  }
}

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15000,
  withCredentials: true,
  headers: { 'X-Leaseflow-Session': '1' },
});
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(sessionKey);
  if (token) config.headers.Authorization = 'Bearer ' + token;
  else delete config.headers.Authorization;
  config.leaseflowSessionVersion = sessionVersion();
  return config;
});
let renewal: Promise<void> | null = null;
async function renew(version: number) {
  const owner = sessionStorage.getItem(sessionOwnerKey);
  const response = await api.post('/auth/refresh');
  if (version !== sessionVersion()) throw new Error('Session changed');
  if (owner && response.data.userId !== owner) throw new Error('Account changed; sign in again.');
  sessionStorage.setItem(sessionKey, response.data.accessToken);
  window.dispatchEvent(new Event('leaseflow:refreshed'));
}
function invalidate() {
  clearSessionStorage();
  window.dispatchEvent(new Event('leaseflow:unauthorized'));
}
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (
      error.response?.status !== 401 ||
      !config ||
      /\/auth\/(login|refresh|logout)$/.test(config.url ?? '')
    )
      return Promise.reject(error);
    const version = config.leaseflowSessionVersion;
    if (version !== sessionVersion()) return Promise.reject(error);
    if (!previewMode && !config.leaseflowRetried) {
      config.leaseflowRetried = true;
      const current = sessionStorage.getItem(sessionKey);
      if (current && config.headers.Authorization !== 'Bearer ' + current)
        return api.request(config);
      try {
        if (!renewal) {
          const run = () => renew(version);
          const operation = (async () => {
            if (navigator.locks) await navigator.locks.request('leaseflow-session-refresh', run);
            else await run();
          })();
          renewal = operation.finally(() => {
            renewal = null;
          });
        }
        await renewal;
        if (version !== sessionVersion()) return Promise.reject(error);
        return api.request(config);
      } catch (refreshError) {
        if (
          version === sessionVersion() &&
          (!axios.isAxiosError(refreshError) ||
            [401, 403].includes(refreshError.response?.status ?? 0))
        )
          invalidate();
        return Promise.reject(refreshError);
      }
    }
    if (version === sessionVersion()) invalidate();
    return Promise.reject(error);
  },
);
