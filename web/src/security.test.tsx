import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Security } from './pages/Security';
import { api } from './api';

afterEach(cleanup);
const sessions = [
  {
    id: 'current',
    current: true,
    userAgent: 'Current browser',
    ip: '192.0.2.10',
    createdAt: '2026-11-08T00:00:00Z',
    lastUsedAt: '2026-11-08T00:00:00Z',
    expiresAt: '2026-12-08T00:00:00Z',
  },
  {
    id: 'other',
    current: false,
    userAgent: 'Other browser',
    ip: '192.0.2.20',
    createdAt: '2026-11-08T00:00:00Z',
    lastUsedAt: '2026-11-08T00:00:00Z',
    expiresAt: '2026-12-08T00:00:00Z',
  },
];
function page() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <Security />
    </QueryClientProvider>,
  );
}
describe('account security', () => {
  it('requires confirmation and refreshes the session list after revocation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sessions });
    const remove = vi.spyOn(api, 'delete').mockResolvedValue({ data: null });
    page();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Revoke session other' }));
    expect(remove).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect(remove).toHaveBeenCalledWith('/auth/sessions/other');
  });
  it('does not change the password when confirmation differs', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sessions });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: null });
    page();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Current password'), 'CurrentPassword123!');
    await user.type(screen.getByLabelText('New password'), 'ReplacementPassword123!');
    await user.type(screen.getByLabelText('Confirm new password'), 'DifferentPassword123!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    expect(
      await screen.findByText('New passwords do not match.', {
        selector: '#confirm-password-error',
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText('Confirm new password').getAttribute('aria-invalid')).toBe('true');
    expect(post).not.toHaveBeenCalled();
  });
  it('preserves password values and exposes a failed operation', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sessions });
    vi.spyOn(api, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Current password is incorrect' } },
    });
    page();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Current password'), 'CurrentPassword123!');
    await user.type(screen.getByLabelText('New password'), 'ReplacementPassword123!');
    await user.type(screen.getByLabelText('Confirm new password'), 'ReplacementPassword123!');
    await user.click(screen.getByRole('button', { name: 'Change password' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Current password is incorrect',
    );
    expect((screen.getByLabelText('Current password') as HTMLInputElement).value).toBe(
      'CurrentPassword123!',
    );
  });
});
