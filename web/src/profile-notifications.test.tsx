import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { api } from './api';
import { Profile } from './pages/Profile';
import { Notifications } from './pages/Notifications';
import { Tenants } from './pages/Tenants';
afterEach(cleanup);
const profile = () => ({
  email: 'tenant@demo.invalid',
  phone: '+971500000001',
  phoneVerifiedAt: '2026-11-01T00:00:00Z',
  preferredLanguage: 'en',
  timezone: 'Asia/Dubai',
  profileVersion: 3,
  deliveryPreference: 'BOTH',
  securityEmail: 'tenant@demo.invalid',
  tenant: { fullName: 'Original Tenant', matchingPreferences: {} },
});
function page(element: React.ReactNode) {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter>{element}</MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('tenant profile and notice interfaces', () => {
  it('posts optional preferences and a phone candidate without verification or role fields', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: profile() });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: profile() });
    page(<Profile />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.type(screen.getByLabelText('Phone awaiting verification'), '+971500000099');
    await user.type(screen.getByLabelText('Sleep schedule'), 'Early');
    await user.selectOptions(screen.getByLabelText('Non-security notices'), 'WHATSAPP');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(patch).toHaveBeenCalledWith(
      '/profile',
      expect.objectContaining({
        expectedVersion: 3,
        pendingPhone: '+971500000099',
        deliveryPreference: 'WHATSAPP',
        matchingPreferences: expect.objectContaining({
          sleepSchedule: 'Early',
          nationality: null,
          gender: null,
          smoking: 'NO_PREFERENCE',
        }),
      }),
    );
    expect(patch.mock.calls[0]![1]).not.toHaveProperty('phoneVerifiedAt');
    expect(patch.mock.calls[0]![1]).not.toHaveProperty('role');
  });
  it('preserves values and the original version after a stale profile conflict', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: profile() });
    const patch = vi
      .spyOn(api, 'patch')
      .mockRejectedValue({
        isAxiosError: true,
        response: { status: 409, data: { message: 'Profile changed. Reload before another edit' } },
      });
    page(<Profile />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.type(screen.getByLabelText('Lifestyle'), 'Quiet');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Profile changed');
    expect((screen.getByLabelText('Lifestyle') as HTMLInputElement).value).toBe('Quiet');
    expect(patch.mock.calls[0]![1]).toHaveProperty('expectedVersion', 3);
  });
  it('marks notices only after the server confirms and retains errors on failure', async () => {
    const row = {
      id: 'n1',
      createdAt: '2026-11-08T00:00:00Z',
      readAt: null,
      event: { kind: 'RESOLVED', request: { id: 'r1', title: 'Private repair' } },
    };
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [row], total: 1 } });
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValue({
        isAxiosError: true,
        response: { data: { message: 'Temporary failure' } },
      });
    page(<Notifications />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Mark read Private repair' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Temporary failure');
    expect(screen.queryByText('Read', { selector: 'span' })).toBeNull();
    expect(post).toHaveBeenCalledWith('/notifications/n1/read');
    expect(screen.getByRole('link', { name: 'Private repair' }).getAttribute('href')).toBe(
      '/requests/r1',
    );
  });
  it('filters notices and tenant directory records without exposing a tenant-create command', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [], total: 0 } });
    const notices = page(<Notifications />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Notification status'), 'UNREAD');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/notifications',
        expect.objectContaining({ params: { page: 1, status: 'UNREAD' } }),
      ),
    );
    notices.unmount();
    page(<Tenants />);
    await user.type(screen.getByLabelText('Search tenants'), 'Alice');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/tenants',
        expect.objectContaining({ params: { q: 'Alice', page: 1 } }),
      ),
    );
    expect(screen.queryByRole('button', { name: 'Add tenant' })).toBeNull();
  });
});
