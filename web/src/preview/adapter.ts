import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { Role, SessionUser } from '../session';

type RecordData = { id: string; [key: string]: any };
type PreviewStore = {
  landlords: RecordData[];
  units: RecordData[];
  contracts: RecordData[];
  requests: RecordData[];
};
const storageKey = 'leaseflow-preview-data-v1';
const accounts: Record<string, Role> = {
  'manager@preview.invalid': 'LEASING_MANAGER',
  'admin@preview.invalid': 'ADMIN',
  'tenant@preview.invalid': 'TENANT',
};
const userFor = (role: Role): SessionUser => ({
  id: 'preview-' + role,
  role,
  email: Object.keys(accounts).find((email) => accounts[email] === role)!,
  status: 'ACTIVE',
  leasingManager: role === 'LEASING_MANAGER' ? { fullName: 'Demo Manager' } : null,
  tenant: role === 'TENANT' ? { fullName: 'Demo Tenant' } : null,
});

export function freshPreview(): PreviewStore {
  const unit = {
    id: 'unit-1',
    name: 'Marina Residence',
    area: 'Dubai Marina',
    building: 'Demo Tower',
    emirate: 'Dubai',
    currency: 'AED',
    defaultDeposit: '3000',
    ownerMonthlyRent: '8000',
    landlordId: 'landlord-1',
    active: true,
    spaces: [
      {
        id: 'space-1',
        name: 'Master Room',
        type: 'MASTER_ROOM',
        capacity: 2,
        askingRent: '3500',
        status: 'OCCUPIED',
        enabled: true,
        amenities: { privateBathroom: true },
      },
    ],
  };
  return {
    landlords: [
      {
        id: 'landlord-1',
        name: 'Demo Property Owner',
        email: 'owner@preview.invalid',
        phone: '',
        companyName: 'Demo Properties',
      },
    ],
    units: [unit],
    contracts: [
      {
        id: 'contract-1',
        status: 'ACTIVE',
        startDate: '2026-11-01T00:00:00Z',
        tenant: { fullName: 'Demo Tenant' },
        currency: 'AED',
        monthlyRent: '3500',
        depositAmount: '3000',
        dueDay: 1,
        noticeDays: 30,
        rentalSpace: { ...unit.spaces[0], unit: { name: unit.name } },
        payments: [
          {
            id: 'payment-1',
            dueDate: '2026-11-01T00:00:00Z',
            amountDue: '3500',
            amountPaid: '1000',
            status: 'PARTIALLY_PAID',
          },
        ],
        requests: [{ id: 'request-1', title: 'Kitchen tap repair', status: 'SUBMITTED' }],
      },
    ],
    requests: [
      {
        id: 'request-1',
        type: 'MAINTENANCE',
        title: 'Kitchen tap repair',
        description: 'Synthetic request for the preview.',
        status: 'SUBMITTED',
      },
    ],
  };
}
function readStore(): PreviewStore {
  try {
    const data = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    if (
      data &&
      ['landlords', 'units', 'contracts', 'requests'].every((key) => Array.isArray(data[key]))
    )
      return data;
  } catch {
    /* Reset invalid preview data. */
  }
  return freshPreview();
}
export function resetPreview() {
  localStorage.removeItem(storageKey);
}

export const previewAdapter: AxiosAdapter = async (config: InternalAxiosRequestConfig) => {
  const path = (config.url ?? '').replace(/\/$/, '');
  const method = config.method ?? 'get';
  const data = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data ?? {});
  const respond = (body: unknown, status = 200) => ({
    data: body,
    status,
    statusText: String(status),
    headers: {},
    config,
  });
  const fail = (message: string, status: number): never => {
    throw new AxiosError(message, undefined, config, undefined, respond({ message }, status));
  };
  if (path === '/auth/login') {
    const role = accounts[data.email];
    if (!role || data.password !== 'PreviewOnly123!')
      return fail('Use one of the preview accounts.', 401);
    return respond({ accessToken: 'preview:' + role });
  }
  const role = String(config.headers.Authorization ?? '').replace('Bearer preview:', '') as Role;
  if (!['ADMIN', 'LEASING_MANAGER', 'TENANT'].includes(role))
    return fail('Preview session required', 401);
  if (path === '/auth/me') return respond(userFor(role));
  const store = readStore();
  const units = () =>
    store.units.map((unit) => ({
      ...unit,
      landlord: store.landlords.find((landlord) => landlord.id === unit.landlordId) ?? null,
    }));
  if (path.startsWith('/inventory/') && role !== 'LEASING_MANAGER')
    return fail('Insufficient permissions', 403);
  if (method === 'get' && path === '/inventory/landlords')
    return respond(
      store.landlords.map((landlord) => ({
        ...landlord,
        _count: { units: store.units.filter((unit) => unit.landlordId === landlord.id).length },
      })),
    );
  if (method === 'get' && path === '/inventory/units') return respond(units());
  if (method === 'get' && /^\/inventory\/units\/[^/]+$/.test(path))
    return respond(
      units().find((unit) => unit.id === path.split('/').at(-1)) ?? fail('Unit not found', 404),
    );
  if (path === '/dashboard/admin')
    return role === 'ADMIN'
      ? respond({ managers: 1, pendingApproval: 0, suspended: 0, tenants: 1 })
      : fail('Insufficient permissions', 403);
  if (path === '/dashboard/tenant')
    return role === 'TENANT'
      ? respond({ contracts: store.contracts })
      : fail('Insufficient permissions', 403);
  if (path === '/dashboard/manager') {
    if (role !== 'LEASING_MANAGER') return fail('Insufficient permissions', 403);
    const spaces = store.units.flatMap((unit) => unit.spaces);
    return respond({
      units: store.units.length,
      occupied: spaces.filter((space) => space.status === 'OCCUPIED').length,
      vacant: spaces.filter((space) => space.status === 'AVAILABLE').length,
      openRequests: store.requests.length,
      overdue: 0,
      depositsHeld: 3000,
      income: 1000,
      expenses: 8000,
    });
  }
  if (path === '/contracts' && method === 'get')
    return role !== 'ADMIN' ? respond(store.contracts) : fail('Insufficient permissions', 403);
  if (path === '/requests' && method === 'get')
    return role !== 'ADMIN' ? respond(store.requests) : fail('Insufficient permissions', 403);
  if (role === 'LEASING_MANAGER' && ['post', 'patch'].includes(method)) {
    let item: RecordData;
    if (path.startsWith('/inventory/landlords')) {
      if (!data.name?.trim() || data.name.trim().length < 2)
        return fail('Name must contain at least two characters.', 422);
      if (method === 'patch') {
        const existing = store.landlords.find((record) => record.id === path.split('/').at(-1));
        if (!existing) return fail('Landlord not found', 404);
        Object.assign(existing, data);
        item = existing;
      } else {
        item = { ...data, id: crypto.randomUUID() };
        store.landlords.push(item);
      }
    } else if (/^\/inventory\/units\/[^/]+\/spaces$/.test(path) && method === 'post') {
      if (!['ROOM', 'MASTER_ROOM'].includes(data.type))
        return fail('Future feature: disabled space type', 422);
      if (
        !data.name?.trim() ||
        !Number.isInteger(data.capacity) ||
        data.capacity < 1 ||
        data.capacity > 10
      )
        return fail('Verify the room name and capacity.', 422);
      if (data.type === 'MASTER_ROOM' && !data.amenities?.privateBathroom)
        return fail('Master Room requires a private bathroom', 422);
      const unit = store.units.find((record) => record.id === path.split('/')[3]);
      if (!unit) return fail('Unit not found', 404);
      item = { ...data, id: crypto.randomUUID(), status: 'AVAILABLE', enabled: true };
      unit.spaces.push(item);
    } else if (path.startsWith('/inventory/units')) {
      if (!data.name?.trim() || !data.area?.trim() || data.declarationAccepted !== true)
        return fail('Unit name, area, and declaration are required.', 422);
      if (data.landlordId && !store.landlords.some((record) => record.id === data.landlordId))
        return fail('Landlord not found', 404);
      if (method === 'patch') {
        const existing = store.units.find((record) => record.id === path.split('/').at(-1));
        if (!existing) return fail('Unit not found', 404);
        Object.assign(existing, data);
        item = existing;
      } else {
        item = { ...data, id: crypto.randomUUID(), active: false, spaces: [] };
        store.units.push(item);
      }
    } else return fail('This workflow is not implemented in the preview.', 501);
    localStorage.setItem(storageKey, JSON.stringify(store));
    return respond(item, method === 'post' ? 201 : 200);
  }
  return fail('This workflow is not implemented in the preview.', 501);
};
