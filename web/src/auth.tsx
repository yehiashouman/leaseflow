import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { sessionKey, type SessionUser } from './session';

type Auth = {
  token: string | null;
  user: SessionUser | null;
  pending: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
};
const Context = createContext<Auth | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(sessionKey));
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pending, setPending] = useState(() => Boolean(sessionStorage.getItem(sessionKey)));
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    api
      .get<SessionUser>('/auth/me', { signal: controller.signal })
      .then((response) => {
        setUser(response.data);
        setPending(false);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        sessionStorage.removeItem(sessionKey);
        setUser(null);
        setToken(null);
        setPending(false);
        client.clear();
      });
    return () => controller.abort();
  }, [token, client]);
  useEffect(() => {
    function invalidate() {
      sessionStorage.removeItem(sessionKey);
      setToken(null);
      setUser(null);
      setPending(false);
      client.clear();
    }
    window.addEventListener('leaseflow:unauthorized', invalidate);
    return () => window.removeEventListener('leaseflow:unauthorized', invalidate);
  }, [client]);
  const value = useMemo(
    () => ({
      token,
      user,
      pending,
      login: async (email: string, password: string) => {
        const { data } = await api.post('/auth/login', { email, password });
        sessionStorage.setItem(sessionKey, data.accessToken);
        try {
          const response = await api.get<SessionUser>('/auth/me');
          client.clear();
          setUser(response.data);
          setPending(false);
          setToken(data.accessToken);
        } catch (error) {
          sessionStorage.removeItem(sessionKey);
          throw error;
        }
      },
      logout: () => {
        sessionStorage.removeItem(sessionKey);
        setToken(null);
        setUser(null);
        setPending(false);
        client.clear();
      },
    }),
    [token, user, pending, client],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export const useAuth = () => {
  const value = useContext(Context);
  if (!value) throw new Error('AuthProvider missing');
  return value;
};
