import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { DeliveryStatus } from './pages/DeliveryStatus';
import { api } from './api';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const row = {
  id: 'delivery-1',
  channel: 'EMAIL',
  state: 'ACCEPTED',
  language: 'en',
  recipientHint: 't***@example.invalid',
  attempts: 1,
  retrySequence: 0,
  canRetry: false,
  createdAt: '2026-11-09T00:00:00Z',
  failureCode: null,
  acceptedAt: '2026-11-09T00:00:00Z',
  deliveredAt: null,
  readAt: null,
  notification: { event: { kind: 'MESSAGE', request: { id: 'case-1', title: 'My private case' } } },
  attemptLog: [],
};
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DeliveryStatus />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('distinguishes SMTP acceptance from inbox delivery', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: { items: [row], total: 1, pageSize: 20, enabledChannels: ['EMAIL'] },
  });
  mount();
  await screen.findByText('SMTP server accepted');
  expect(screen.getByText('Inbox delivery remains unverified.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'My private case' }).getAttribute('href')).toBe(
    '/requests/case-1',
  );
});
it('preserves acknowledgement and an exact retry key after an uncertain network result', async () => {
  vi.spyOn(api, 'get').mockResolvedValue({
    data: {
      items: [{ ...row, state: 'UNKNOWN', canRetry: true }],
      total: 1,
      pageSize: 20,
      enabledChannels: [],
    },
  });
  const post = vi
    .spyOn(api, 'post')
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce({ data: {} });
  mount();
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Retry notice' }));
  const dialog = screen.getByRole('dialog');
  await user.click(
    within(dialog).getByLabelText('Send another notice to my current verified contact *'),
  );
  await user.click(
    within(dialog).getByLabelText('I understand the previous notice can already have arrived *'),
  );
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await within(dialog).findByText('Unable to save. Please try again.');
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  expect(post).toHaveBeenCalledTimes(2);
  expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
  expect(post.mock.calls[0]![1]).toMatchObject({ acknowledgePossibleDuplicate: true });
});
it('shows a failed dependency instead of a false empty delivery history', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(new Error('unavailable'));
  mount();
  await screen.findByText('Unable to load records');
  expect(screen.queryByText('No external notice records match these filters.')).toBeNull();
});
