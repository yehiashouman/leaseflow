import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { api } from './api';
import { CaseReports } from './components/case-reports';

afterEach(cleanup);
function page() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <CaseReports requestId="r1" version={4} />
    </QueryClientProvider>,
  );
}
const job = () => ({
  id: 'j1',
  status: 'FAILED',
  expectedVersion: 4,
  snapshotHash: 'a'.repeat(64),
  retryCount: 1,
  createdAt: '2026-11-08T00:00:00Z',
  failureCode: 'UNSUPPORTED_TEXT',
});
describe('case export controls', () => {
  it('queues the current version and reuses its key after transient failures', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [], total: 0, pageSize: 20 } });
    const post = vi.spyOn(api, 'post').mockRejectedValue(new Error('Temporary failure'));
    page();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]).toEqual(post.mock.calls[1]);
    expect(post.mock.calls[0]![1]).toMatchObject({
      requestId: 'r1',
      expectedVersion: 4,
      clientId: expect.any(String),
    });
  });
  it('exposes source fallback and versioned retries without fake PDF success', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [job()], total: 1, pageSize: 20 } });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: { ...job(), status: 'QUEUED' } });
    page();
    expect(await screen.findByText(/font does not support/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Download PDF' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download JSON source' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry export' }));
    expect(post).toHaveBeenCalledWith('/reports/j1/retry', { expectedRetryCount: 1 });
  });
  it('downloads only the authorized server bytes after completion', async () => {
    const blob = new Blob(['%PDF-real-server-response'], { type: 'application/pdf' });
    const get = vi
      .spyOn(api, 'get')
      .mockImplementation(async (path) => ({
        data:
          path === '/reports'
            ? {
                items: [{ ...job(), status: 'COMPLETE', failureCode: null }],
                total: 1,
                pageSize: 20,
              }
            : blob,
      }));
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-report');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    page();
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Download PDF' }));
    expect(get).toHaveBeenCalledWith('/reports/j1/file', { responseType: 'blob' });
    expect(create).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
  });
  it('pages export history and preserves server errors', async () => {
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { items: [job()], total: 21, pageSize: 20 } });
    vi.spyOn(api, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Case changed. Reload before export' } },
    });
    page();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Next exports' }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/reports',
        expect.objectContaining({ params: { requestId: 'r1', page: 2 } }),
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Export PDF' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Case changed');
  });
});
