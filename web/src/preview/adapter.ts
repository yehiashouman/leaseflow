import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { Role, SessionUser } from '../session';

type RecordData = { id: string; [key: string]: any };
type PreviewStore = {
  landlords: RecordData[];
  units: RecordData[];
  contracts: RecordData[];
  requests: RecordData[];
  revokedSessions?: string[];
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
        preferredContactMethod: 'EMAIL',
        archivedAt: null,
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
  if (path === '/auth/logout' && method === 'post') return respond(null, 204);
  if (path === '/auth/sessions' && method === 'get') {
    const now = new Date().toISOString();
    return respond([
      {
        id: 'preview-current',
        current: true,
        userAgent: 'Current preview browser',
        ip: '192.0.2.10',
        createdAt: now,
        lastUsedAt: now,
        expiresAt: '2099-01-01T00:00:00Z',
      },
      ...((store.revokedSessions ?? []).includes(role + ':preview-other')
        ? []
        : [
            {
              id: 'preview-other',
              current: false,
              userAgent: 'Synthetic second device',
              ip: '192.0.2.20',
              createdAt: now,
              lastUsedAt: now,
              expiresAt: '2099-01-01T00:00:00Z',
            },
          ]),
    ]);
  }
  if (path === '/auth/logout-all' && method === 'post') return respond(null, 204);
  if (/^\/auth\/sessions\/(preview-current|preview-other)$/.test(path) && method === 'delete') {
    store.revokedSessions = [...(store.revokedSessions ?? []), role + ':' + path.split('/').at(-1)];
    localStorage.setItem(storageKey, JSON.stringify(store));
    return respond(null, 204);
  }
  const units = () =>
    store.units.map((unit) => ({
      ...unit,
      landlord: store.landlords.find((landlord) => landlord.id === unit.landlordId) ?? null,
    }));
  if (path.startsWith('/inventory/') && role !== 'LEASING_MANAGER')
    return fail('Insufficient permissions', 403);
  if (method === 'get' && path === '/inventory/landlords') {
    const status = config.params?.status ?? 'ACTIVE';
    const query = String(config.params?.q ?? '')
      .trim()
      .toLowerCase();
    if (!['ACTIVE', 'ARCHIVED', 'ALL'].includes(status))
      return fail('Verify the landlord status.', 422);
    return respond(
      store.landlords
        .filter(
          (landlord) =>
            (status === 'ALL' ||
              (status === 'ARCHIVED' ? Boolean(landlord.archivedAt) : !landlord.archivedAt)) &&
            (!query ||
              [landlord.name, landlord.companyName, landlord.email].some((value) =>
                String(value ?? '')
                  .toLowerCase()
                  .includes(query),
              )),
        )
        .map((landlord) => ({
          ...landlord,
          _count: { units: store.units.filter((unit) => unit.landlordId === landlord.id).length },
        })),
    );
  }
  if (method === 'get' && /^\/inventory\/landlords\/[^/]+$/.test(path)) {
    const landlord = store.landlords.find((item) => item.id === path.split('/').at(-1));
    if (!landlord) return fail('Landlord not found', 404);
    return respond({
      ...landlord,
      units: store.units
        .filter((unit) => unit.landlordId === landlord.id)
        .map(({ id, name, area, active }) => ({ id, name, area, active })),
    });
  }
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
    if (/^\/inventory\/landlords\/[^/]+\/(archive|restore)$/.test(path) && method === 'post') {
      const landlord = store.landlords.find((record) => record.id === path.split('/')[3]);
      if (!landlord) return fail('Landlord not found', 404);
      if (path.endsWith('/archive') && store.units.some((unit) => unit.landlordId === landlord.id))
        return fail('Unlink all units before archive', 409);
      landlord.archivedAt = path.endsWith('/archive')
        ? (landlord.archivedAt ?? new Date().toISOString())
        : null;
      item = landlord;
    } else if (/^\/inventory\/spaces\/[^/]+$/.test(path) && method === 'patch') {
      const space = store.units
        .flatMap((unit) => unit.spaces)
        .find((space) => space.id === path.split('/').at(-1));
      if (!space) return fail('Room not found', 404);
      if (!['ROOM', 'MASTER_ROOM'].includes(data.type))
        return fail('Future feature: disabled space type', 422);
      if (
        !data.name?.trim() ||
        !Number.isInteger(data.capacity) ||
        data.capacity < 1 ||
        data.capacity > 10
      )
        return fail('Verify the room name and capacity.', 422);
      if (data.type === 'MASTER_ROOM' && data.amenities?.privateBathroom !== true)
        return fail('Master Room requires a private bathroom', 422);
      if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(data.availability))
        return fail('Verify the availability.', 422);
      if (
        data.askingRent != null &&
        (!Number.isFinite(Number(data.askingRent)) ||
          Number(data.askingRent) < 0 ||
          !/^\d+(\.\d{1,2})?$/.test(String(data.askingRent)))
      )
        return fail('Verify the asking rent.', 422);
      const contracts = store.contracts.filter(
        (contract) =>
          contract.rentalSpace?.id === space.id &&
          ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status),
      );
      const occupants = contracts.reduce(
        (total, contract) => total + (contract.secondaryOccupant ? 2 : 1),
        0,
      );
      if (data.capacity < occupants)
        return fail('Capacity cannot be lower than committed occupants', 409);
      if (contracts.length && (data.availability !== 'ACTIVE' || data.type !== space.type))
        return fail('Resolve open contracts before a type or availability change', 409);
      Object.assign(space, {
        name: data.name.trim(),
        type: data.type,
        capacity: data.capacity,
        askingRent: data.askingRent ?? null,
        amenities: data.amenities,
        enabled: data.availability !== 'INACTIVE',
        status:
          data.availability !== 'ACTIVE'
            ? data.availability
            : occupants === 0
              ? 'AVAILABLE'
              : occupants >= data.capacity
                ? 'OCCUPIED'
                : 'PARTIAL',
      });
      item = space;
    } else if (path.startsWith('/inventory/landlords')) {
      if (!data.name?.trim() || data.name.trim().length < 2)
        return fail('Name must contain at least two characters.', 422);
      if (method === 'patch') {
        const existing = store.landlords.find((record) => record.id === path.split('/').at(-1));
        if (!existing) return fail('Landlord not found', 404);
        if (existing.archivedAt) return fail('Restore the landlord before an edit', 409);
        Object.assign(existing, data);
        item = existing;
      } else {
        item = { ...data, id: crypto.randomUUID(), archivedAt: null };
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
      if (
        data.landlordId &&
        !store.landlords.some((record) => record.id === data.landlordId && !record.archivedAt)
      )
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
