import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { api } from './api';
import { Managers, ManagerDetail, AdminAudit } from './pages/Managers';
afterEach(cleanup);
function page(element: React.ReactNode, path = '/admin/managers') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/managers" element={element} />
          <Route path="/admin/managers/:id" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('administrator account review', () => {
  it('filters the account queue by status and name and supports page controls', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        items: [
          {
            id: 'm1',
            email: 'applicant@demo.invalid',
            status: 'PENDING_APPROVAL',
            leasingManager: { fullName: 'Applicant' },
          },
        ],
        total: 21,
      },
    });
    page(<Managers />);
    const user = userEvent.setup();
    expect(await screen.findByRole('link', { name: 'Applicant' })).toBeDefined();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/admin/managers',
        expect.objectContaining({ params: { status: 'PENDING_APPROVAL', q: '', page: 2 } }),
      ),
    );
    await user.selectOptions(screen.getByLabelText('Account status'), 'ACTIVE');
    await user.type(screen.getByLabelText('Search managers'), 'Alice');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/admin/managers',
        expect.objectContaining({ params: { status: 'ACTIVE', q: 'Alice', page: 1 } }),
      ),
    );
  });
  it('displays masked identity signals and the real moderation gate', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        id: 'm1',
        email: 'applicant@demo.invalid',
        status: 'PENDING_APPROVAL',
        leasingManager: {
          fullName: 'Applicant',
          emiratesIdNumber: '****1234',
          licenseNumber: '****5678',
        },
        history: [],
      },
    });
    page(<ManagerDetail />, '/admin/managers/m1');
    expect(await screen.findByText('****1234')).toBeDefined();
    expect(screen.getByText('MFA and policy approval required')).toBeDefined();
    expect(
      screen.getByText(
        'Approval activates platform access. It does not certify legal sufficiency or property authorization.',
      ),
    ).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Approve' })).toBeNull();
    expect(screen.getByText('Document review not implemented')).toBeDefined();
  });
  it('filters safe audit summaries and renders an explicit empty result', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: { items: [], total: 0 } });
    page(<AdminAudit />);
    const user = userEvent.setup();
    expect(await screen.findByText('No audit events')).toBeDefined();
    await user.type(screen.getByLabelText('Audit resource'), 'Unit');
    await user.type(screen.getByLabelText('Audit action'), 'ARCHIVE');
    await waitFor(() =>
      expect(get).toHaveBeenLastCalledWith(
        '/admin/audit',
        expect.objectContaining({ params: { page: 1, entityType: 'Unit', action: 'ARCHIVE' } }),
      ),
    );
  });
});
