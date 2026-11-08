import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Account } from './pages/Account';
import { accountApi, setupSessionKey } from './account-api';
vi.mock('./account-api', () => ({
  accountApi: { get: vi.fn(), post: vi.fn() },
  setupSessionKey: 'test-account-setup',
}));
const get = vi.mocked(accountApi.get),
  post = vi.mocked(accountApi.post);
const policy = {
  emailEnabled: true,
  phoneEnabled: false,
  declarationVersion: 'test',
  declarationText: 'Test declaration.',
};
beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
});
afterEach(cleanup);
function renderAccount(
  mode: 'setup' | 'reset',
  client: QueryClient,
  path: string,
  extra?: React.ReactNode,
) {
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Account mode={mode} />
        {extra}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('account identity and email-link boundaries', () => {
  it('removes private setup document caches on account switch and new setup login', async () => {
    sessionStorage.setItem(setupSessionKey, 'old-account-token');
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(['account-documents', 'IDENTITY', 'self', 1], {
      title: 'Private previous identity',
    });
    get.mockImplementation(async (path) => {
      if (path === '/auth/policy') return { data: policy };
      throw new Error('Session expired');
    });
    renderAccount('setup', client, '/account-setup');
    await userEvent.click(await screen.findByRole('button', { name: 'Use another account' }));
    expect(client.getQueryData(['account-documents', 'IDENTITY', 'self', 1])).toBeUndefined();
    client.setQueryData(['account-documents', 'IDENTITY', 'self', 1], { title: 'Old cached data' });
    post.mockResolvedValue({ data: { accessToken: 'new-account-token' } });
    get.mockImplementation(async (path) => ({
      data:
        path === '/auth/policy'
          ? policy
          : {
              id: 'new-owner',
              email: 'new@example.com',
              role: 'LEASING_MANAGER',
              status: 'PENDING_EMAIL',
              emailVerified: false,
              phoneVerified: false,
              identityComplete: false,
              profile: {},
              moderationAvailable: false,
            },
    }));
    await userEvent.type(screen.getByLabelText('Email', { exact: true }), 'new@example.com');
    await userEvent.type(screen.getByLabelText('Password', { exact: true }), 'NewAccount123!');
    await userEvent.click(screen.getByRole('button', { name: 'Open account setup' }));
    await screen.findByText('new@example.com');
    expect(client.getQueryData(['account-documents', 'IDENTITY', 'self', 1])).toBeUndefined();
    expect(sessionStorage.getItem(setupSessionKey)).toBe('new-account-token');
  });
  it('uses the newest reset link after same-page navigation instead of the previous token', async () => {
    const first = 'a'.repeat(43),
      second = 'b'.repeat(43),
      client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    get.mockResolvedValue({ data: policy });
    post.mockResolvedValue({ data: { message: 'Reset accepted.' } });
    renderAccount(
      'reset',
      client,
      '/reset-password#token=' + first,
      <Link to={'/reset-password#token=' + second}>Use second reset link</Link>,
    );
    await userEvent.type(
      await screen.findByLabelText('New password', { exact: true }),
      'NewPassword123!',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/auth/password/reset', {
        token: first,
        newPassword: 'NewPassword123!',
      }),
    );
    await userEvent.click(screen.getByRole('link', { name: 'Use second reset link' }));
    const password = screen.getByLabelText('New password', { exact: true });
    await userEvent.clear(password);
    await userEvent.type(password, 'NextPassword123!');
    await userEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() =>
      expect(post).toHaveBeenLastCalledWith('/auth/password/reset', {
        token: second,
        newPassword: 'NextPassword123!',
      }),
    );
  });
});
