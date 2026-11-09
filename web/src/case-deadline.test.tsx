import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CaseDeadline } from './components/case-deadline';
import { api } from './api';
import type { CaseRecord } from './cases';
const auth = vi.hoisted(() => ({ user: { role: 'LEASING_MANAGER' } }));
vi.mock('./auth', () => ({ useAuth: () => auth }));
const data = { id: 'case-1', type: 'MAINTENANCE', status: 'SUBMITTED', version: 2 } as CaseRecord;
beforeEach(() => {
  auth.user.role = 'LEASING_MANAGER';
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <CaseDeadline data={data} />
    </QueryClientProvider>,
  );
}
it('records an explicit UTC deadline and closes only after the API accepts it', async () => {
  const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...data, version: 3 } });
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Set response deadline' }));
  const input = screen.getByLabelText('Deadline (UTC; leave empty to remove)');
  const { fireEvent } = await import('@testing-library/react');
  fireEvent.change(input, { target: { value: '2027-01-02T10:30' } });
  await user.type(screen.getByLabelText('Reason'), 'Access agreed');
  await user.click(screen.getByRole('button', { name: 'Save deadline' }));
  expect(post).toHaveBeenCalledWith(
    '/requests/case-1/deadline',
    expect.objectContaining({
      expectedVersion: 2,
      dueAt: '2027-01-02T10:30:00.000Z',
      reason: 'Access agreed',
    }),
  );
  expect(screen.queryByLabelText('Reason')).toBeNull();
});
it('preserves the reason after a failed request', async () => {
  vi.spyOn(api, 'post').mockRejectedValue(new Error('offline'));
  mount();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Set response deadline' }));
  await user.type(screen.getByLabelText('Reason'), 'Remove after response');
  await user.click(screen.getByRole('button', { name: 'Save deadline' }));
  await screen.findByText('Deadline update failed. Retry.');
  expect((screen.getByLabelText('Reason') as HTMLInputElement).value).toBe('Remove after response');
});
it('keeps tenant deadlines read only', () => {
  auth.user.role = 'TENANT';
  mount();
  expect(screen.getByText('No deadline recorded.')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
