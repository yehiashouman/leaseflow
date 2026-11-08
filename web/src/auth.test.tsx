import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './auth';
import { api } from './api';
import { sessionKey } from './session';

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);
function State() {
  const auth = useAuth();
  return (
    <>
      <p>{auth.user?.role ?? 'No account'}</p>
      <button onClick={() => void auth.login('admin@example.test', 'ExamplePass123!')}>
        Login
      </button>
      <button onClick={auth.logout}>Logout</button>
    </>
  );
}
it('loads the server role and clears private cache and only its own token on logout', async () => {
  const client = new QueryClient();
  vi.spyOn(api, 'post').mockResolvedValue({ data: { accessToken: 'signed-token' } });
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { id: 'admin-1', role: 'ADMIN', status: 'ACTIVE', email: 'admin@example.test' },
  });
  sessionStorage.setItem('unrelated', 'retain');
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <State />
      </AuthProvider>
    </QueryClientProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Login' }));
  await screen.findByText('ADMIN');
  client.setQueryData(['private'], { sensitive: true });
  await user.click(screen.getByRole('button', { name: 'Logout' }));
  expect(await screen.findByText('No account')).toBeDefined();
  expect(client.getQueryData(['private'])).toBeUndefined();
  expect(sessionStorage.getItem(sessionKey)).toBeNull();
  expect(sessionStorage.getItem('unrelated')).toBe('retain');
});
it('does not claim server logout after a network failure', async () => {
  const client = new QueryClient();
  sessionStorage.setItem(sessionKey, 'signed-token');
  vi.spyOn(api, 'get').mockResolvedValue({ data: { id: 'admin-1', role: 'ADMIN' } });
  vi.spyOn(api, 'post').mockRejectedValue(new Error('Offline'));
  function Status() {
    const auth = useAuth();
    return (
      <>
        <State />
        <p>{auth.logoutError}</p>
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <Status />
      </AuthProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('ADMIN');
  await userEvent.click(screen.getByRole('button', { name: 'Logout' }));
  await screen.findByText(/Sign out failed/);
  expect(sessionStorage.getItem(sessionKey)).toBe('signed-token');
  expect(screen.getByText('ADMIN')).toBeDefined();
});
