import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { CaseEditor } from './components/case-editor';
import { RequestDetail } from './pages/RequestDetail';
import { Requests } from './pages/Requests';
import { caseDate } from './cases';

const auth = vi.hoisted(() => ({ role: 'TENANT' }));
vi.mock('./auth', () => ({ useAuth: () => ({ user: { role: auth.role } }) }));
afterEach(() => {
  cleanup();
  auth.role = 'TENANT';
});
const sample = () => ({
  id: 'r1',
  contractId: 'c1',
  type: 'MAINTENANCE',
  title: 'Tap repair',
  description: 'A private report',
  status: 'RESOLVED',
  version: 4,
  metadata: { urgency: 'URGENT' },
  canMessage: true,
  allowedActions: [
    { status: 'ACCEPTED', requiresMessage: false },
    { status: 'REOPENED', requiresMessage: true },
  ],
  events: [
    {
      id: 'e1',
      kind: 'SUBMITTED',
      message: 'A private report',
      actorName: 'Original Author',
      actorUserId: 'u1',
      actorRole: 'TENANT',
      createdAt: '2026-11-08T08:00:00Z',
      sequence: 1,
    },
  ],
});
function page(element: React.ReactNode, path = '/requests/r1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/requests/:id" element={element} />
          <Route path="/requests" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('private case interfaces', () => {
  it('shows immutable author snapshots and explicit Dubai times without invented legacy identities', async () => {
    const row = sample();
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        ...row,
        events: [
          ...row.events,
          { id: 'e2', actorUserId: 'old-user', kind: 'LEGACY', createdAt: '2020-01-01T00:00:00Z' },
        ],
      },
    });
    page(<RequestDetail />);
    expect(await screen.findByText('Original Author')).toBeDefined();
    expect(screen.getByText('Participant old-user')).toBeDefined();
    expect(screen.getByText(/Legacy author ID/)).toBeDefined();
    expect(screen.getAllByText('A private report')).toHaveLength(1);
    expect(screen.getByText('Times: Asia/Dubai')).toBeDefined();
    expect(caseDate('invalid')).toBe('-');
    expect(caseDate(undefined)).toBe('-');
  });
  it('retains a failed message and reuses its key for an unchanged retry', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sample() });
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { message: 'Temporary failure' } },
      })
      .mockResolvedValue({ data: sample() });
    page(<RequestDetail />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Message'), 'Retry note');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Temporary failure');
    expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe('Retry note');
    await user.click(screen.getByRole('button', { name: 'Send message' }));
    await waitFor(() =>
      expect((screen.getByLabelText('Message') as HTMLTextAreaElement).value).toBe(''),
    );
    expect(post.mock.calls[0]![1]).toEqual(post.mock.calls[1]![1]);
  });
  it('waits for confirmation and posts the frozen case version', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: sample() });
    const post = vi.spyOn(api, 'post').mockResolvedValue({
      data: { ...sample(), status: 'ACCEPTED', version: 5, allowedActions: [] },
    });
    page(<RequestDetail />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Accept completion' }));
    expect(post).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(post).toHaveBeenCalledWith('/requests/r1/respond', {
      clientId: expect.any(String),
      status: 'ACCEPTED',
      expectedVersion: 4,
      message: '',
    });
  });
  it('preserves a dispute reason after conflicts and requires a review before another decision', async () => {
    const row = sample();
    vi.spyOn(api, 'get').mockImplementation(async () => ({ data: { ...row } }));
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 409, data: { message: 'Case changed' } },
      })
      .mockResolvedValue({ data: { ...row, status: 'REOPENED', allowedActions: [] } });
    page(<RequestDetail />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Reopen case' }));
    await user.type(
      within(screen.getByRole('alertdialog')).getByLabelText(/Response/),
      'The leak remains',
    );
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect(await screen.findByRole('button', { name: 'Review latest' })).toBeDefined();
    expect(
      within(screen.getByRole('alertdialog')).queryByRole('button', { name: 'Confirm' }),
    ).toBeNull();
    row.version = 5;
    await user.click(screen.getByRole('button', { name: 'Review latest' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await user.click(screen.getByRole('button', { name: 'Reopen case' }));
    expect(
      (within(screen.getByRole('alertdialog')).getByLabelText(/Response/) as HTMLTextAreaElement)
        .value,
    ).toBe('The leak remains');
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect(post.mock.calls[1]![1]).toMatchObject({
      expectedVersion: 5,
      message: 'The leak remains',
    });
  });
  it('does not render unavailable role actions or a closed-case composer', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        ...sample(),
        status: 'CLOSED',
        allowedActions: [{ status: 'REOPENED', requiresMessage: true }],
        canMessage: false,
      },
    });
    page(<RequestDetail />);
    expect(await screen.findByRole('button', { name: 'Reopen case' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Accept completion' })).toBeNull();
    expect(screen.queryByLabelText('Message')).toBeNull();
  });
  it('creates only supported cases and preserves form values after server errors', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        types: ['MAINTENANCE', 'GENERAL'],
        contracts: [{ id: 'c1', rentalSpace: { name: 'Room A', unit: { name: 'Unit A' } } }],
      },
    });
    const post = vi
      .spyOn(api, 'post')
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { data: { message: 'Temporary failure' } },
      })
      .mockResolvedValue({ data: { id: 'new-id' } });
    const onCreated = vi.fn();
    page(<CaseEditor onClose={vi.fn()} onCreated={onCreated} />);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText(/Title/), 'Door repair');
    await user.type(screen.getByLabelText(/Description/), 'The lock needs repair');
    expect(
      within(screen.getByLabelText(/Request type/)).queryByRole('option', { name: 'Move out' }),
    ).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Temporary failure');
    expect((screen.getByLabelText(/Description/) as HTMLTextAreaElement).value).toBe(
      'The lock needs repair',
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith('new-id'));
    expect(post.mock.calls[0]![1]).toEqual(post.mock.calls[1]![1]);
    expect(post.mock.calls[0]![1]).toMatchObject({
      contractId: 'c1',
      title: 'Door repair',
      description: 'The lock needs repair',
      urgency: 'NORMAL',
    });
  });
  it('shows no-contract state without an unusable submission form', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: { types: ['GENERAL'], contracts: [] } });
    page(<CaseEditor onClose={vi.fn()} onCreated={vi.fn()} />);
    expect(await screen.findByText('No open contracts')).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
  it('filters cases and restricts the submission entry point to tenants', async () => {
    auth.role = 'LEASING_MANAGER';
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    page(<Requests />, '/requests');
    const user = userEvent.setup();
    expect(screen.queryByRole('button', { name: 'New request' })).toBeNull();
    await user.selectOptions(screen.getByLabelText('Request status'), 'RESOLVED');
    await user.selectOptions(screen.getByLabelText('Request type filter'), 'MAINTENANCE');
    await user.type(screen.getByLabelText('Search requests'), 'Tap');
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/requests',
        expect.objectContaining({ params: { status: 'RESOLVED', type: 'MAINTENANCE', q: 'Tap' } }),
      ),
    );
  });
});
