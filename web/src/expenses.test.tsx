import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Expenses, ExpenseDetail } from './pages/Expenses';
import { api } from './api';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const expense = {
  id: 'expense-1',
  category: 'MAINTENANCE',
  amount: '100.00',
  currency: 'AED',
  vendor: 'Repair Vendor',
  incurredAt: '2026-11-09T00:00:00Z',
  description: 'Original invoice',
  scopeKind: 'PORTFOLIO',
  void: null,
  recovered: '0.00',
  unrecovered: '100.00',
  recoveries: [],
};
function mount(detail = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[detail ? '/expenses/expense-1' : '/expenses']}>
        <Routes>
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/expenses/:id" element={<ExpenseDetail />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('shows request failure without financial zero totals', async () => {
  vi.spyOn(api, 'get').mockRejectedValue(new Error('offline'));
  mount();
  await screen.findByText('Unable to load records');
  expect(screen.queryByText(/Filtered gross:/)).toBeNull();
});
it('records recoveries through the API without altering gross expense', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data: path === '/documents/policy' ? { enabled: false } : expense,
  }));
  const post = vi.spyOn(api, 'post').mockResolvedValue({
    data: {
      ...expense,
      recovered: '20.00',
      unrecovered: '80.00',
      recoveries: [{ id: 'receipt', amount: '20.00', paidAt: '2026-11-09', method: 'Cash' }],
    },
  });
  mount(true);
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name: 'Record external recovery' }));
  await user.type(screen.getByLabelText('Amount (AED) *'), '20.00');
  await user.type(screen.getByLabelText('Payment method *'), 'Cash');
  await user.click(screen.getByLabelText('I confirm this external payment already happened *'));
  await user.click(screen.getByRole('button', { name: 'Save' }));
  expect(post).toHaveBeenCalledWith(
    '/expenses/expense-1/recoveries',
    expect.objectContaining({ amount: '20', method: 'Cash' }),
  );
  expect(await screen.findByText('AED 100.00')).toBeTruthy();
});
it('preserves the original vendor and void reason on immutable records', async () => {
  vi.spyOn(api, 'get').mockImplementation(async (path) => ({
    data:
      path === '/documents/policy'
        ? { enabled: false }
        : { ...expense, void: { reason: 'Duplicate invoice', createdAt: '2026-11-09' } },
  }));
  mount(true);
  await screen.findByRole('heading', { name: 'Repair Vendor' });
  expect(screen.getByText(/VOID: Duplicate invoice/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Record external recovery' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Void expense' })).toBeNull();
});
