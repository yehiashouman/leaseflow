import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AxiosError } from 'axios';
import { api } from './api';
import { createQueryClient } from './query-client';
import { Profile } from './pages/Profile';
import { QueryFeedback } from './components/query-feedback';
import { requestError, recoverableQueryError } from './api-errors';
const profile = {
  email: 'tenant@recovery.invalid',
  preferredLanguage: 'en',
  timezone: 'Asia/Dubai',
  profileVersion: 2,
  deliveryPreference: 'BOTH',
  securityEmail: 'tenant@recovery.invalid',
  tenant: { fullName: 'Original Tenant', matchingPreferences: {} },
};
function failure(status?: number) {
  const error = new AxiosError('Transport diagnostics stay private');
  if (status)
    Object.assign(error, {
      response: {
        status,
        data: {
          message: status === 403 ? 'Access denied.' : 'Temporary service failure.',
          requestId: 'verified-request-456',
        },
      },
    });
  return error;
}
function page() {
  const client = createQueryClient({ queries: { retry: false, gcTime: 0 } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Profile />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return client;
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('draft recovery and safe query errors', () => {
  it('retains an unsaved profile and original version after a recoverable refresh failure', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: profile }),
      patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: profile });
    const client = page(),
      user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    const input = screen.getByLabelText('Full name *');
    await user.clear(input);
    await user.type(input, 'Unsaved tenant name');
    get.mockRejectedValue(failure(503));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['profile'] });
    });
    expect(await screen.findByText('Your draft stays available.')).toBeTruthy();
    expect((screen.getByLabelText('Full name *') as HTMLInputElement).value).toBe(
      'Unsaved tenant name',
    );
    expect(screen.getByText(/Reference: verified-request-456/)).toBeTruthy();
    get.mockResolvedValue({ data: profile });
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(patch).toHaveBeenCalled());
    expect(patch.mock.calls[0]![1]).toMatchObject({
      expectedVersion: 2,
      fullName: 'Unsaved tenant name',
    });
  });
  it('evicts denied private data so a later offline failure cannot reveal it again', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: profile });
    const client = page(),
      user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit profile' }));
    await user.type(screen.getByLabelText('Full name *'), ' private draft');
    get.mockRejectedValue(failure(403));
    await act(async () => {
      await client.invalidateQueries({ queryKey: ['profile'] });
    });
    await screen.findByText(/Access denied/);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(client.getQueryData(['profile'])).toBeUndefined();
    get.mockRejectedValue(failure());
    await act(async () => {
      await client.refetchQueries({ queryKey: ['profile'] });
    });
    expect(screen.queryByText('Original Tenant')).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('shows safe server messages and valid request references without transport diagnostics', () => {
    render(<QueryFeedback pending={false} error={failure(503)} onRetry={() => {}} />);
    expect(
      screen.getByText('Temporary service failure. Reference: verified-request-456'),
    ).toBeTruthy();
    expect(screen.queryByText(/Transport diagnostics/)).toBeNull();
  });
  it('keeps authentication and ownership failures outside the recoverable cache path', () => {
    for (const status of [401, 403, 404, 410, 422])
      expect(recoverableQueryError(failure(status))).toBe(false);
    for (const status of [408, 409, 429, 500, 503])
      expect(recoverableQueryError(failure(status))).toBe(true);
    expect(recoverableQueryError(failure())).toBe(true);
    const error = failure(503);
    error.response!.data = { message: 'Safe message', requestId: 'private@example.invalid' };
    expect(requestError(error)).toBe('Safe message');
  });
});
