import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { api } from './api';
import { Landlords } from './pages/Landlords';
import { Units } from './pages/Units';
import { UnitDetail } from './pages/UnitDetail';
import { LandlordDetail } from './pages/LandlordDetail';

afterEach(cleanup);
function page(element: React.ReactNode, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/units/:id" element={element} />
          <Route path="/landlords/:id" element={element} />
          <Route path="/" element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
describe('inventory forms', () => {
  it('captures unit amenities, custom labels, and owner payment schedules', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    page(<Units />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add unit' }));
    await user.type(screen.getByLabelText(/Unit name/), 'Amenity Unit');
    await user.type(screen.getByLabelText(/^Area/), 'Dubai');
    await user.type(screen.getByLabelText('Owner payment schedule'), 'Four cheques');
    for (const label of ['Air conditioning', 'Furnished', 'Kitchen', 'Wi-Fi'])
      await user.click(screen.getByLabelText(label, { exact: true }));
    await user.type(screen.getByLabelText('Additional amenities'), 'Lift\nGym\nLift');
    await user.click(screen.getByRole('checkbox', { name: /I confirm the property/ }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(post).toHaveBeenCalledWith(
      '/inventory/units',
      expect.objectContaining({
        ownerPaymentSchedule: 'Four cheques',
        amenities: expect.objectContaining({
          airConditioning: true,
          furnished: true,
          kitchen: true,
          wifi: true,
          additional: ['Lift', 'Gym'],
        }),
      }),
    );
  });
  it('confirms unit archive and restore and keeps archived room actions disabled', async () => {
    let archivedAt: string | null = null;
    vi.spyOn(api, 'get').mockImplementation(async () => ({
      data: {
        id: 'u1',
        name: 'Lifecycle Unit',
        area: 'Dubai',
        currency: 'AED',
        defaultDeposit: 0,
        active: false,
        archivedAt,
        spaces: [],
      },
    }));
    const post = vi.spyOn(api, 'post').mockImplementation(async (path) => {
      archivedAt = path.endsWith('/archive') ? '2026-11-08T00:00:00Z' : null;
      return { data: {} };
    });
    page(<UnitDetail />, '/units/u1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archive unit' }));
    expect(post).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((screen.getByRole('button', { name: 'Add room' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    await user.click(screen.getByRole('button', { name: 'Restore unit' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect((screen.getByRole('button', { name: 'Add room' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
  });
  it('shows archive conflicts without a false success', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        id: 'u1',
        name: 'Occupied Unit',
        area: 'Dubai',
        currency: 'AED',
        defaultDeposit: 0,
        active: true,
        spaces: [],
      },
    });
    vi.spyOn(api, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Resolve open contracts before unit archive' } },
    });
    page(<UnitDetail />, '/units/u1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archive unit' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Resolve open contracts');
    expect(screen.getByRole('alertdialog')).toBeDefined();
  });
  it('disables record fields until the save completes', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.spyOn(api, 'post').mockImplementation(async () => {
      await pending;
      return { data: {} };
    });
    page(<Landlords />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add landlord' }));
    await user.type(screen.getByLabelText(/Name/), 'Pending Owner');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    try {
      expect((screen.getByLabelText(/Name/) as HTMLInputElement).disabled).toBe(true);
      expect((screen.getByLabelText('Preferred contact') as HTMLSelectElement).disabled).toBe(true);
      expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).disabled).toBe(true);
    } finally {
      await act(async () => finish());
    }
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
  it('captures a landlord contact preference and multiline notes', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    const post = vi.spyOn(api, 'post').mockResolvedValue({ data: {} });
    page(<Landlords />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Add landlord' }));
    await user.type(screen.getByLabelText(/Name/), 'Preferred Owner');
    await user.selectOptions(screen.getByLabelText('Preferred contact'), 'WHATSAPP');
    await user.type(screen.getByLabelText('Notes'), 'First line\nSecond line');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(post).toHaveBeenCalledWith(
      '/inventory/landlords',
      expect.objectContaining({
        preferredContactMethod: 'WHATSAPP',
        notes: 'First line\nSecond line',
      }),
    );
  });
  it('filters landlords by status and debounced search', async () => {
    const get = vi.spyOn(api, 'get').mockResolvedValue({ data: [] });
    page(<Landlords />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Landlord status'), 'ARCHIVED');
    await user.type(screen.getByLabelText('Search landlords'), 'Owner');
    await waitFor(() =>
      expect(get).toHaveBeenCalledWith(
        '/inventory/landlords',
        expect.objectContaining({ params: { status: 'ARCHIVED', q: 'Owner' } }),
      ),
    );
  });
  it('shows linked units and blocks archive while links remain', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        id: 'l1',
        name: 'Linked Owner',
        companyName: 'Owner Company',
        units: [
          { id: 'u1', name: 'Unit One', area: 'Dubai', active: false },
          { id: 'u2', name: 'Unit Two', area: 'Dubai', active: false },
        ],
      },
    });
    page(<LandlordDetail />, '/landlords/l1');
    expect(await screen.findByRole('heading', { name: 'Linked Owner' })).toBeDefined();
    expect(screen.getByRole('link', { name: 'Unit One' }).getAttribute('href')).toBe('/units/u1');
    expect(screen.getByRole('link', { name: 'Unit Two' })).toBeDefined();
    expect(
      (screen.getByRole('button', { name: 'Archive landlord' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
  it('confirms archive and restore and refreshes landlord status', async () => {
    const landlord = {
      id: 'l1',
      name: 'Lifecycle Owner',
      archivedAt: null as string | null,
      units: [],
    };
    vi.spyOn(api, 'get').mockImplementation(async () => ({ data: { ...landlord } }));
    const post = vi.spyOn(api, 'post').mockImplementation(async (url) => {
      landlord.archivedAt = url.endsWith('/archive') ? '2026-11-08T00:00:00Z' : null;
      return { data: { ...landlord } };
    });
    page(<LandlordDetail />, '/landlords/l1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archive landlord' }));
    expect(post).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    await user.click(await screen.findByRole('button', { name: 'Restore landlord' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect(await screen.findByRole('button', { name: 'Archive landlord' })).toBeDefined();
    expect(post).toHaveBeenCalledWith('/inventory/landlords/l1/archive');
    expect(post).toHaveBeenCalledWith('/inventory/landlords/l1/restore');
  });
  it('keeps archive confirmation open after a new linked-unit conflict', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: { id: 'l1', name: 'Conflicted Owner', units: [] },
    });
    vi.spyOn(api, 'post').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Unlink all units before archive' } },
    });
    page(<LandlordDetail />, '/landlords/l1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Archive landlord' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Confirm' }),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('Unlink all units');
    expect(screen.getByRole('alertdialog')).toBeDefined();
  });
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
    await user.click(form.getByRole('checkbox', { name: /I confirm the property/ }));
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
  it('edits room details and preserves its private bathroom and other amenities', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        id: 'u1',
        name: 'Demo Unit',
        area: 'Dubai',
        currency: 'AED',
        defaultDeposit: 0,
        active: true,
        spaces: [
          {
            id: 's1',
            name: 'Master A',
            type: 'MASTER_ROOM',
            capacity: 2,
            askingRent: 3000,
            status: 'AVAILABLE',
            amenities: { privateBathroom: true, balcony: true },
          },
        ],
      },
    });
    const patch = vi.spyOn(api, 'patch').mockResolvedValue({ data: {} });
    page(<UnitDetail />, '/units/u1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Master A' }));
    const form = within(screen.getByRole('dialog'));
    expect((form.getByLabelText('Private bathroom') as HTMLInputElement).checked).toBe(true);
    await user.selectOptions(form.getByLabelText('Availability'), 'MAINTENANCE');
    await user.clear(form.getByLabelText('Asking rent'));
    await user.type(form.getByLabelText('Asking rent'), '3200');
    await user.click(form.getByRole('button', { name: 'Save' }));
    expect(patch).toHaveBeenCalledWith(
      '/inventory/spaces/s1',
      expect.objectContaining({
        askingRent: '3200',
        availability: 'MAINTENANCE',
        amenities: { privateBathroom: true, balcony: true },
      }),
    );
  });
  it('preserves the room editor after an occupancy conflict', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({
      data: {
        id: 'u1',
        name: 'Demo Unit',
        area: 'Dubai',
        currency: 'AED',
        defaultDeposit: 0,
        active: true,
        spaces: [{ id: 's1', name: 'Room A', type: 'ROOM', capacity: 2, status: 'OCCUPIED' }],
      },
    });
    vi.spyOn(api, 'patch').mockRejectedValue({
      isAxiosError: true,
      response: { data: { message: 'Capacity cannot be lower than committed occupants' } },
    });
    page(<UnitDetail />, '/units/u1');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Edit Room A' }));
    await user.clear(screen.getByLabelText(/Capacity/));
    await user.type(screen.getByLabelText(/Capacity/), '1');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toContain('committed occupants');
    expect((screen.getByLabelText(/Capacity/) as HTMLInputElement).value).toBe('1');
  });
});
