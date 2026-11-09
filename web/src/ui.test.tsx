import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { Login } from './pages/Login';
import { Units } from './pages/Units';
import { QueryFeedback } from './components/query-feedback';
import { Button } from './components/ui/button';
import { api } from './api';
import { cn } from './lib/utils';

const auth = vi.hoisted(() => ({
  token: 'test-token',
  user: { role: 'LEASING_MANAGER' },
  pending: false,
  login: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('./auth', () => ({ useAuth: () => auth }));

function renderPage(page: React.ReactNode, route = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[route]}>{page}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  auth.login.mockReset();
  auth.logout.mockReset();
  auth.user.role = 'LEASING_MANAGER';
});

describe('role-specific dashboards', () => {
  it('loads the admin dashboard without a manager request', async () => {
    auth.user.role = 'ADMIN';
    const get = vi
      .spyOn(api, 'get')
      .mockResolvedValue({ data: { managers: 1, pendingApproval: 0, suspended: 0, tenants: 1 } });
    renderPage(<App />);
    await screen.findByRole('heading', { name: 'Platform overview' });
    expect(get).toHaveBeenCalledWith('/dashboard/admin');
    expect(get).not.toHaveBeenCalledWith('/dashboard/manager');
    expect(screen.queryByRole('link', { name: 'Units' })).toBeNull();
  });

  it('shows historical-contract replies and pending acknowledgements without an active contract', async () => {
    auth.user.role = 'TENANT';
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        contracts: [],
        unresolvedCount: 1,
        pendingAcknowledgements: 1,
        unresolvedRequests: [
          {
            id: 'case-1',
            title: 'Repair',
            status: 'RESOLVED',
            events: [
              {
                id: 'reply-1',
                actorName: 'Manager',
                message: 'Repair is complete.',
                createdAt: '2026-11-09T10:00:00Z',
              },
            ],
          },
        ],
      },
    });
    renderPage(<App />);
    await screen.findByText('Repair is complete.');
    expect(screen.getByText(/1 unresolved · 1 await your acknowledgement/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Repair' }).getAttribute('href')).toBe(
      '/requests/case-1',
    );
    expect(screen.getByText(/Asia\/Dubai/)).toBeTruthy();
  });
  it('loads the tenant dashboard and hides inventory links', async () => {
    auth.user.role = 'TENANT';
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { contracts: [] } });
    renderPage(<App />);
    await screen.findByRole('heading', { name: 'My accommodation' });
    expect(get).toHaveBeenCalledWith('/dashboard/tenant');
    expect(screen.queryByRole('link', { name: 'Units' })).toBeNull();
  });
});
afterEach(cleanup);

describe('shadcn UI foundation', () => {
  it('merges conflicting Tailwind utilities', () => {
    expect(cn('px-2 text-sm', false, 'px-4')).toBe('text-sm px-4');
  });

  it('preserves disabled button behavior', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('preserves button composition as a link', () => {
    render(
      <Button asChild>
        <a href="/units">View units</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'View units' }).getAttribute('href')).toBe('/units');
  });

  it('labels login inputs and submits credentials through existing auth', async () => {
    auth.login.mockResolvedValue(undefined);
    renderPage(<Login />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'manager@example.test');
    await user.type(screen.getByLabelText('Password'), 'ExamplePass123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(auth.login).toHaveBeenCalledWith('manager@example.test', 'ExamplePass123!');
  });

  it('preserves form values and exposes an alert after failed login', async () => {
    auth.login.mockRejectedValue(new Error('Denied'));
    renderPage(<Login />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Email'), 'manager@example.test');
    await user.type(screen.getByLabelText('Password'), 'ExamplePass123!');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to sign in');
    expect((screen.getByLabelText('Email') as HTMLInputElement).value).toBe('manager@example.test');
  });

  it('announces pending records', () => {
    render(<QueryFeedback pending onRetry={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('Please wait');
  });

  it('retries failed data requests', async () => {
    const retry = vi.fn();
    render(<QueryFeedback pending={false} onRetry={retry} />);
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it('does not disguise a failed units request as an empty list', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(new Error('Unavailable'));
    renderPage(<Units />);
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load records');
    expect(screen.queryByText('No units yet')).toBeNull();
  });

  it('retains real unit records in an accessible table', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: [{ id: 'u1', name: 'Unit One', area: 'Dubai', spaces: [], active: true }],
    });
    renderPage(<Units />);
    expect((await screen.findByRole('table')).textContent).toContain('Unit One');
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('opens mobile navigation and closes it after a route choice', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    renderPage(<App />, '/units');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('LeaseFlow');
    const contractsLink = dialog.querySelector('a[href="/contracts"]');
    expect(contractsLink).not.toBeNull();
    await user.click(contractsLink!);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Contracts' })).toBeDefined();
  });
});
