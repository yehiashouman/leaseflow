import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { Landlords } from './pages/Landlords';
import { Units } from './pages/Units';
import { UnitDetail } from './pages/UnitDetail';

afterEach(cleanup);
function page(element: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/units/:id" element={element} />
          <Route path="/" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('inventory forms', () => {
  it('creates a landlord and refreshes the list', async () => {
    const rows: { id: string; name: string }[] = [];
    vi.spyOn(api, 'get').mockImplementation(async () => ({ data: [...rows] }));
    const post = vi.spyOn(api, 'post').mockImplementation(async (_url, data) => {
      rows.push({ id: 'l2', name: (data as { name: string }).name });
      return { data: rows[0] };
    });
    page(<Landlords />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add landlord' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Name/), 'New Demo Owner');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('cell', { name: 'New Demo Owner' })).toBeDefined();
    expect(post).toHaveBeenCalledWith(
      '/inventory/landlords',
      expect.objectContaining({ name: 'New Demo Owner' }),
    );
  });
  it('edits a landlord without a duplicate create', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [{ id: 'l1', name: 'Demo Owner' }] });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
    page(<Landlords />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Demo Owner' }));
    const input = within(screen.getByRole('dialog')).getByLabelText(/Name/);
    await user.clear(input);
    await user.type(input, 'Changed Owner');
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }));
    expect(patch).toHaveBeenCalledWith(
      '/inventory/landlords/l1',
      expect.objectContaining({ name: 'Changed Owner' }),
    );
  });
  it('requires a declaration and posts new unit details', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    page(<Units />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    const form = within(screen.getByRole('dialog'));
    await user.type(form.getByLabelText(/Unit name/), 'New Demo Apartment');
    await user.type(form.getByLabelText(/Area/), 'Dubai');
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(post).not.toHaveBeenCalled();
    await user.click(form.getByRole('checkbox'));
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(post).toHaveBeenCalledWith(
      '/inventory/units',
      expect.objectContaining({ name: 'New Demo Apartment', declarationAccepted: true }),
    );
  });
  it('preserves values and exposes server validation errors', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    vi.spyOn(api, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Name must contain two characters.' } },
    });
    page(<Landlords />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add landlord' }));
    await user.type(screen.getByLabelText(/Name/), 'X');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Name must contain two characters.',
    );
    expect((screen.getByLabelText(/Name/) as HTMLInputElement).value).toBe('X');
  });
  it('creates a room under its selected unit', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        id: 'u1',
        name: 'Demo Unit',
        area: 'Dubai',
        currency: 'AED',
        defaultDeposit: 0,
        active: false,
        spaces: [],
      },
    });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    page(<UnitDetail />, '/units/u1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Add room' }));
    await user.type(screen.getByLabelText(/Room name/), 'Room A');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(post).toHaveBeenCalledWith(
      '/inventory/units/u1/spaces',
      expect.objectContaining({ name: 'Room A', type: 'ROOM', capacity: 1 }),
    );
  });
});
