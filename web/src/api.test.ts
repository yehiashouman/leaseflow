import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { api } from './api';
import { clearSessionStorage, sessionKey, sessionOwnerKey, startSession } from './session';

const originalAdapter = api.defaults.adapter;
beforeEach(() => {
  clearSessionStorage();
  startSession('expired');
  sessionStorage.setItem(sessionOwnerKey, 'user-1');
});
afterEach(() => {
  api.defaults.adapter = originalAdapter;
  clearSessionStorage();
});
function response(config: InternalAxiosRequestConfig, data: unknown, status = 200) {
  const result = { data, status, statusText: String(status), headers: {}, config };
  if (status >= 400) throw new AxiosError('Denied', undefined, config, undefined, result);
  return result;
}
describe('session renewal', () => {
  it('coalesces concurrent 401 responses and retries with the new token', async () => {
    let renewals = 0;
    api.defaults.adapter = (async (config) => {
      expect(config.withCredentials).toBe(true);
      expect(config.headers['X-Leaseflow-Session']).toBe('1');
      if (config.url === '/auth/refresh') {
        renewals++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return response(config, { accessToken: 'new-token', userId: 'user-1' });
      }
      return config.headers.Authorization === 'Bearer new-token'
        ? response(config, { ok: true })
        : response(config, {}, 401);
    }) satisfies AxiosAdapter;
    const rows = await Promise.all([api.get('/inventory/units'), api.get('/contracts')]);
    expect(rows.every((row) => row.data.ok)).toBe(true);
    expect(renewals).toBe(1);
    expect(sessionStorage.getItem(sessionKey)).toBe('new-token');
  });
  it('does not revive a session after logout during renewal', async () => {
    let entered!: () => void;
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        entered();
        await gate;
        return response(config, { accessToken: 'late-token', userId: 'user-1' });
      }
      return response(config, {}, 401);
    };
    const pending = api.get('/contracts');
    const result = expect(pending).rejects.toThrow('Session changed');
    await ready;
    clearSessionStorage();
    finish();
    await result;
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
  });
  it('rejects a cookie belonging to a different account before retry', async () => {
    api.defaults.adapter = async (config) =>
      config.url === '/auth/refresh'
        ? response(config, { accessToken: 'other-token', userId: 'another-user' })
        : response(config, {}, 401);
    await expect(api.get('/contracts')).rejects.toThrow('Account changed');
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
  });
  it('retains local state after a temporary refresh network failure', async () => {
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') throw new AxiosError('Offline', 'ERR_NETWORK', config);
      return response(config, {}, 401);
    };
    await expect(api.get('/contracts')).rejects.toThrow('Offline');
    expect(sessionStorage.getItem(sessionKey)).toBe('expired');
  });
  it('clears a session after server revocation without a refresh loop', async () => {
    let requests = 0;
    api.defaults.adapter = async (config) => {
      requests++;
      return response(config, {}, 401);
    };
    await expect(api.get('/contracts')).rejects.toThrow();
    expect(requests).toBe(2);
    expect(sessionStorage.getItem(sessionKey)).toBeNull();
  });
});
