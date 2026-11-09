import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('./auth', () => ({ useAuth: () => ({ user: { role: 'LEASING_MANAGER' } }) }));
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import { api } from './api';
import { ContractDetail } from './pages/ContractDetail';

afterEach(cleanup);
const terms = {
  id: 'c1',
  status: 'ACTIVE',
  startDate: '2026-11-01T00:00:00Z',
  endDate: null,
  monthlyRent: '3000.10',
  depositAmount: '2000.05',
  currency: 'AED',
  dueDay: 1,
  noticeDays: 15,
  tenant: { fullName: 'Contract Tenant' },
  rentalSpace: {
    name: 'Primary Room',
    type: 'ROOM',
    unit: { name: 'Contract Unit', area: 'Dubai' },
  },
};
function page() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}
    >
      <MemoryRouter initialEntries={['/contracts/c1']}>
        <Routes>
          <Route path="/contracts/:id" element={<ContractDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('read-only contract records', () => {
  it('shows exact stored terms, open-ended dates, and a notice exception without write controls', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path) => ({
      data: path === '/contracts/c1' ? terms : { items: [], total: 0, pageSize: 20 },
    }));
    page();
    expect(await screen.findByText('Open-ended')).toBeTruthy();
    expect(screen.getByText('15 days')).toBeTruthy();
    expect(screen.getByText('AED 3,000.10')).toBeTruthy();
    expect(screen.getByText('AED 2,000.05')).toBeTruthy();
    expect(await screen.findByText('No records')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: /Confirm payment|Edit contract|Accept terms/ }),
    ).toBeNull();
  });
  it('pages records and resets the page after a section change', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(async (path) => ({
      data: path === '/contracts/c1' ? terms : { items: [], total: 21, pageSize: 20 },
    }));
    page();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/contracts/c1/records', {
        params: { section: 'payments', page: 2 },
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Cases' }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith('/contracts/c1/records', {
        params: { section: 'requests', page: 1 },
      }),
    );
  });
  it('renders payment currency, deposit disputes, and linked case records without financial calculations', async () => {
    vi.spyOn(api, 'get').mockImplementation(async (path, config) => ({
      data:
        path === '/contracts/c1'
          ? terms
          : {
              items:
                (config?.params as { section?: string } | undefined)?.section === 'payments'
                  ? [
                      {
                        id: 'p1',
                        periodStart: terms.startDate,
                        dueDate: terms.startDate,
                        amountDue: '100.25',
                        amountPaid: '40.10',
                        currency: 'USD',
                        status: 'PARTIALLY_PAID',
                      },
                    ]
                  : (config?.params as { section?: string } | undefined)?.section === 'deposits'
                    ? [
                        {
                          id: 'd1',
                          type: 'DEDUCTION_PROPOSED',
                          amount: '50.25',
                          createdAt: terms.startDate,
                          description: 'Disputed proposal',
                          tenantDisputedAt: terms.startDate,
                        },
                      ]
                    : [
                        {
                          id: 'r1',
                          title: 'Private repair',
                          type: 'MAINTENANCE',
                          status: 'SUBMITTED',
                          createdAt: terms.startDate,
                        },
                      ],
              total: 1,
              pageSize: 20,
            },
    }));
    page();
    expect(await screen.findByText('USD 40.10')).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Deposit entries' }));
    expect(await screen.findByText('Disputed proposal')).toBeTruthy();
    expect(screen.getByText(/Dispute recorded:/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cases' }));
    expect((await screen.findByRole('link', { name: 'Private repair' })).getAttribute('href')).toBe(
      '/requests/r1',
    );
  });
  it('shows unavailable contracts without stale records and retries transient record failures', async () => {
    vi.spyOn(api, 'get').mockRejectedValue(
      new AxiosError('Missing', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404 } as never),
    );
    page();
    expect(await screen.findByRole('heading', { name: 'Contract unavailable' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Record category' })).toBeNull();
  });
  it('retains contract terms when record requests fail and allows a retry', async () => {
    let failed = true;
    vi.spyOn(api, 'get').mockImplementation(async (path) => {
      if (path === '/contracts/c1') return { data: terms };
      if (failed) throw new Error('Temporary failure');
      return { data: { items: [], total: 0, pageSize: 20 } };
    });
    page();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Contract Tenant')).toBeTruthy();
    failed = false;
    await userEvent.setup().click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No records')).toBeTruthy();
  });
});
