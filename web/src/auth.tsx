import { requestError } from './api-errors';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import {
  clearSessionStorage,
  sessionKey,
  sessionOwnerKey,
  startSession,
  type SessionUser,
} from './session';

type Auth = {
  token: string | null;
  user: SessionUser | null;
  pending: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutPending: boolean;
  logoutError: string;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(sessionKey));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pending, setPending] = useState(() => Boolean(sessionStorage.getItem(sessionKey)));
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api
      .get<SessionUser>('/auth/me', { signal: controller.signal })
      .then((response) => {
        if (controller.signal.aborted) return;
        sessionStorage.setItem(sessionOwnerKey, response.data.id);
        setUser(response.data);
        setPending(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        clearSessionStorage();
        setUser(null);
        setToken(null);
        setPending(false);
        client.clear();
      });
    return () => controller.abort();
  }, [token, client]);
  useEffect(() => {
    function invalidate() {
      setLogoutError('');
      clearSessionStorage();
      setToken(null);
      setUser(null);
      setPending(false);
      client.clear();
    }
    window.addEventListener('leaseflow:unauthorized', invalidate);
    const refresh = () => setToken(sessionStorage.getItem(sessionKey));
    window.addEventListener('leaseflow:refreshed', refresh);
    return () => {
      window.removeEventListener('leaseflow:unauthorized', invalidate);
      window.removeEventListener('leaseflow:refreshed', refresh);
    };
  }, [client]);
  const value = useMemo(
    () => ({
      token,
      user,
      pending,
      logoutPending,
      logoutError,
      login: async (email: string, password: string) => {
        setLogoutError('');
        const { data } = await api.post('/auth/login', { email, password });
        startSession(data.accessToken);
        try {
          const response = await api.get<SessionUser>('/auth/me');
          client.clear();
          sessionStorage.setItem(sessionOwnerKey, response.data.id);
          setUser(response.data);
          setPending(false);
          setToken(data.accessToken);
        } catch (error) {
          clearSessionStorage();
          throw error;
        }
      },
      logout: async () => {
        setLogoutPending(true);
        setLogoutError('');
        try {
          await api.post('/auth/logout');
          window.dispatchEvent(new Event('leaseflow:unauthorized'));
        } catch (cause) {
          setLogoutError(
            requestError(cause, 'Sign out failed. Retry when the server is available.'),
          );
        } finally {
          setLogoutPending(false);
        }
      },
    }),
    [token, user, pending, client, logoutPending, logoutError],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAuth = () => {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
};
