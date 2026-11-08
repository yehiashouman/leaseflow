import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import { Documents } from './components/documents';
import { api } from './api';
vi.mock('./api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
const get = vi.mocked(api.get),
  post = vi.mocked(api.post);
const row = {
  id: 'document-1',
  seriesId: 'series-1',
  version: 1,
  title: 'Safe evidence',
  mimeType: 'image/png',
  availability: 'QUARANTINED',
  expiresAt: null,
  originalSize: 200,
  fileSize: null,
  fileHash: null,
  retryCount: 0,
  createdAt: '2026-11-09T00:00:00Z',
  canReplace: true,
};
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Documents purpose="CASE_EVIDENCE" targetId="case-1" heading="Case evidence" />
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  get.mockImplementation(async (path) => ({
    data:
      path === '/documents/policy'
        ? { enabled: true, maxBytes: 5242880, mimeTypes: ['image/png'] }
        : { items: [], total: 0, pageSize: 20 },
  }));
});
afterEach(cleanup);
describe('private document forms and scan status', () => {
  it('shows empty state and accessible file fields', async () => {
    mount();
    await screen.findByText('No documents.');
    expect(screen.getByLabelText('Document title')).toBeTruthy();
    expect(screen.getByLabelText('File')).toBeTruthy();
    expect(screen.getByText(/JPEG, PNG, PDF/)).toBeTruthy();
  });
  it('posts a real multipart file and strict target metadata before success', async () => {
    post.mockResolvedValue({ data: { id: 'document-1' } });
    mount();
    const title = await screen.findByLabelText('Document title'),
      file = new File(['png bytes'], 'evidence.png', { type: 'image/png' });
    await userEvent.type(title, 'Broken handle');
    await userEvent.upload(screen.getByLabelText('File'), file);
    fireEvent.submit(screen.getByRole('form', { name: 'Case evidence upload' }));
    await screen.findByText('Upload saved. Download requires a successful scan.');
    const body = post.mock.calls[0][1] as FormData;
    expect(post.mock.calls[0][0]).toBe('/documents');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(JSON.parse(String(body.get('metadata')))).toMatchObject({
      purpose: 'CASE_EVIDENCE',
      targetId: 'case-1',
      title: 'Broken handle',
      expiresAt: null,
    });
  });
  it('preserves form values and does not report success after a recoverable failure', async () => {
    post.mockRejectedValue(new Error('offline'));
    mount();
    const title = await screen.findByLabelText('Document title');
    await userEvent.type(title, 'Keep this title');
    await userEvent.upload(
      screen.getByLabelText('File'),
      new File(['bytes'], 'photo.png', { type: 'image/png' }),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Case evidence upload' }));
    await screen.findByRole('alert');
    expect((title as HTMLInputElement).value).toBe('Keep this title');
    expect(screen.queryByText('Upload saved. Download requires a successful scan.')).toBeNull();
  });
  it('rejects oversized uploads before an API mutation', async () => {
    mount();
    await screen.findByLabelText('Document title');
    fireEvent.change(screen.getByLabelText('Document title'), { target: { value: 'Large file' } });
    await userEvent.upload(
      screen.getByLabelText('File'),
      new File([new Uint8Array(5242881)], 'large.png', { type: 'image/png' }),
    );
    fireEvent.submit(screen.getByRole('form', { name: 'Case evidence upload' }));
    await screen.findByText('The file exceeds the upload limit.');
    expect(post).not.toHaveBeenCalled();
  });
  it('disables unavailable downloads and preserves explicit new-version actions', async () => {
    get.mockImplementation(async (path) => ({
      data:
        path === '/documents/policy'
          ? { enabled: true, maxBytes: 5242880 }
          : { items: [row], total: 1, pageSize: 20 },
    }));
    mount();
    await screen.findByText('Safe evidence');
    expect((screen.getByRole('button', { name: 'Download' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await userEvent.click(screen.getByRole('button', { name: 'New version' }));
    expect(screen.getByText(/Earlier versions remain intact/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Upload new version' })).toBeTruthy();
  });
  it('shows terminal scan errors and offers controlled retry', async () => {
    post.mockResolvedValue({ data: {} });
    get.mockImplementation(async (path) => ({
      data:
        path === '/documents/policy'
          ? { enabled: true, maxBytes: 5242880 }
          : {
              items: [{ ...row, availability: 'FAILED', failureCode: 'SCAN_UNAVAILABLE' }],
              total: 1,
              pageSize: 20,
            },
    }));
    mount();
    await screen.findByText('Scan failed');
    await userEvent.click(screen.getByRole('button', { name: 'Retry scan' }));
    await waitFor(() =>
      expect(post).toHaveBeenCalledWith('/documents/document-1/retry', { expectedRetryCount: 0 }),
    );
  });
  it('distinguishes server-disabled files from an empty collection', async () => {
    get.mockResolvedValue({ data: { enabled: false } });
    mount();
    await screen.findByText('Private files are not enabled on this server.');
    expect(screen.queryByText('No documents.')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
  it('shows expiry, prior versions, and safe status without download', async () => {
    get.mockImplementation(async (path) => ({
      data:
        path === '/documents/policy'
          ? { enabled: true, maxBytes: 5242880 }
          : {
              items: [{ ...row, availability: 'EXPIRED', expiresAt: '2026-11-09T00:00:00Z' }],
              total: 1,
              pageSize: 20,
            },
    }));
    mount();
    await screen.findByText('Expired');
    expect(screen.getByText('Version 1')).toBeTruthy();
    expect(screen.getByText('Expiry: 2026-11-09 UTC')).toBeTruthy();
    expect(
      (
        within(screen.getByRole('listitem')).getByRole('button', {
          name: 'Download',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
