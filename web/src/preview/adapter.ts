import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import type { Role, SessionUser } from '../session';
import {
  mutatePreviewCase,
  mutatePreviewMaintenance,
  previewCase,
  previewCaseContract,
  previewCaseTypes,
} from './cases';
import { previewExpenses } from './expenses';
import { preferenceFields } from '../profile-fields';

type RecordData = { id: string; [key: string]: any };
type PreviewStore = {
  landlords: RecordData[];
  units: RecordData[];
  contracts: RecordData[];
  requests: RecordData[];
  revokedSessions?: string[];
  profile?: RecordData;
  readNotices?: Record<string, string>;
  expenses?: RecordData[];
  preferences?: Partial<Record<Role, Record<string, unknown>>>;
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
    archivedAt: null,
    ownerPaymentSchedule: 'Monthly, first calendar day',
    amenities: {
      airConditioning: true,
      furnished: true,
      kitchen: true,
      wifi: true,
      additional: ['Lift'],
    },
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
        endDate: null,
        tenant: { fullName: 'Demo Tenant' },
        currency: 'AED',
        monthlyRent: '3500',
        depositAmount: '3000',
        dueDay: 1,
        noticeDays: 30,
        rentalSpace: { ...unit.spaces[0], unit: { id: unit.id, name: unit.name, area: unit.area } },
        payments: [
          {
            id: 'payment-1',
            periodStart: '2026-11-01T00:00:00Z',
            dueDate: '2026-11-01T00:00:00Z',
            amountDue: '3500',
            amountPaid: '1000',
            currency: 'AED',
            paidAt: null,
            method: null,
            reference: null,
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
        contractId: 'contract-1',
        version: 1,
        metadata: { urgency: 'NORMAL', category: 'Plumbing' },
        createdAt: '2026-11-01T08:00:00Z',
        updatedAt: '2026-11-01T08:00:00Z',
        events: [
          {
            id: 'event-1',
            kind: 'SUBMITTED',
            message: 'Synthetic request for the preview.',
            actorUserId: 'preview-TENANT',
            actorName: 'Demo Tenant',
            actorRole: 'TENANT',
            sequence: 1,
            createdAt: '2026-11-01T08:00:00Z',
          },
        ],
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
  if (path === '/profile/preferences' && ['get', 'patch'].includes(method)) {
    const current = store.preferences?.[role] ?? {
      preferredLanguage: 'en',
      timezone: 'Asia/Dubai',
      profileVersion: 0,
      deliveryPreference: 'BOTH',
    };
    if (method === 'patch') {
      if (data.expectedVersion !== current.profileVersion)
        return fail('Preferences changed. Reload before another edit', 409);
      if (
        !['EMAIL', 'WHATSAPP', 'BOTH'].includes(data.deliveryPreference) ||
        typeof data.preferredLanguage !== 'string' ||
        typeof data.timezone !== 'string'
      )
        return fail('Invalid preferences', 422);
      try {
        Intl.getCanonicalLocales(data.preferredLanguage);
        new Intl.DateTimeFormat('en', { timeZone: data.timezone });
      } catch {
        return fail('Invalid language or timezone', 422);
      }
      store.preferences ??= {};
      store.preferences[role] = {
        preferredLanguage: data.preferredLanguage,
        timezone: data.timezone,
        deliveryPreference: data.deliveryPreference,
        profileVersion: Number(current.profileVersion) + 1,
      };
      localStorage.setItem(storageKey, JSON.stringify(store));
    }
    return respond({
      ...(store.preferences?.[role] ?? current),
      securityNotice:
        'Critical account notices retain the account email channel regardless of these preferences.',
    });
  }
  const expenseResult = previewExpenses(config, store, role, respond, fail, () =>
    localStorage.setItem(storageKey, JSON.stringify(store)),
  );
  if (expenseResult) return expenseResult;
  const deadline = /^\/requests\/([^/]+)\/deadline$/.exec(path);
  if (deadline && method === 'post') {
    if (role !== 'LEASING_MANAGER') return fail('Insufficient permissions', 403);
    const record = store.requests.find((row) => row.id === deadline[1] && row.status !== 'DRAFT');
    if (!record) return fail('Request not found', 404);
    record.events ??= [];
    const prior = record.events.find((event: RecordData) => event.clientId === data.clientId);
    const intent = JSON.stringify({
      dueAt: data.dueAt,
      reason: data.reason,
      expectedVersion: data.expectedVersion,
    });
    if (prior) {
      if (prior.metadata?.intent !== intent || prior.kind !== 'DEADLINE_CHANGED')
        return fail('Deadline key reused with different content', 409);
      return respond(previewCase(record, store.contracts, role));
    }
    if (
      !previewCaseTypes.includes(record.type) ||
      ['DRAFT', 'CLOSED', 'ACCEPTED', 'REJECTED', 'RESOLVED'].includes(record.status)
    )
      return fail('A deadline requires an open operational case', 409);
    if (data.expectedVersion !== (record.version ?? 0))
      return fail('Case changed. Review the latest history', 409);
    if (
      !data.clientId ||
      typeof data.reason !== 'string' ||
      data.reason.trim().length < 3 ||
      (data.dueAt !== null &&
        (!Number.isFinite(Date.parse(data.dueAt)) || Date.parse(data.dueAt) <= Date.now()))
    )
      return fail('Choose a future deadline and add a reason', 422);
    record.version = (record.version ?? 0) + 1;
    record.events.push({
      id: crypto.randomUUID(),
      clientId: data.clientId,
      kind: 'DEADLINE_CHANGED',
      actorName: 'Demo Manager',
      actorRole: 'LEASING_MANAGER',
      sequence: record.version,
      createdAt: new Date().toISOString(),
      metadata: { intent },
      message: `Response deadline: ${record.decisionDueAt ?? 'none'} -> ${data.dueAt ?? 'none'}. Reason: ${data.reason}`,
    });
    record.decisionDueAt = data.dueAt;
    localStorage.setItem(storageKey, JSON.stringify(store));
    return respond(previewCase(record, store.contracts, role));
  }
  if (path === '/notifications/deliveries' && method === 'get')
    return role === 'ADMIN'
      ? fail('Insufficient permissions', 403)
      : respond({ items: [], total: 0, pageSize: 20, enabledChannels: [] });
  if (path === '/operations/jobs')
    return role === 'ADMIN'
      ? respond({
          observedAt: new Date().toISOString(),
          reports: [],
          files: [],
          emails: [],
          notices: [],
          recovery: 'Synthetic preview only. Real provider and file jobs require the live API.',
        })
      : fail('Insufficient permissions', 403);
  const profile = store.profile ?? {
    id: 'preview-TENANT',
    email: 'tenant@preview.invalid',
    phone: null,
    phoneVerifiedAt: null,
    preferredLanguage: 'en',
    timezone: 'Asia/Dubai',
    profileVersion: 0,
    deliveryPreference: 'BOTH',
    securityEmail: 'tenant@preview.invalid',
    tenant: {
      id: 'tenant-1',
      fullName: 'Demo Tenant',
      nationality: null,
      gender: null,
      dateOfBirth: null,
      pendingPhone: null,
      matchingPreferences: {},
    },
  };
  if (path === '/profile') {
    if (role !== 'TENANT') return fail('Insufficient permissions', 403);
    if (method === 'get') return respond(profile);
    if (method === 'patch') {
      if (
        Array.isArray(data.matchingPreferences) ||
        Object.keys(data.matchingPreferences ?? {}).some(
          (key) => ![...Object.keys(preferenceFields), 'smoking'].includes(key),
        ) ||
        !['NO_PREFERENCE', 'SMOKING', 'NON_SMOKING'].includes(data.matchingPreferences?.smoking) ||
        (data.dateOfBirth != null &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(data.dateOfBirth) ||
            !Number.isFinite(Date.parse(data.dateOfBirth)) ||
            new Date(data.dateOfBirth).toISOString().slice(0, 10) !== data.dateOfBirth ||
            data.dateOfBirth > new Date().toISOString().slice(0, 10)))
      )
        return fail('Verify the profile fields.', 422);
      if (
        Object.keys(data).some(
          (key) =>
            ![
              'expectedVersion',
              'fullName',
              'dateOfBirth',
              'nationality',
              'gender',
              'pendingPhone',
              'preferredLanguage',
              'timezone',
              'deliveryPreference',
              'matchingPreferences',
            ].includes(key),
        ) ||
        typeof data.fullName !== 'string' ||
        data.fullName.trim().length < 2 ||
        data.fullName.trim().length > 150 ||
        !['EMAIL', 'WHATSAPP', 'BOTH'].includes(data.deliveryPreference) ||
        !data.matchingPreferences ||
        typeof data.matchingPreferences !== 'object' ||
        (data.pendingPhone !== null && !/^\+[1-9]\d{7,14}$/.test(data.pendingPhone ?? ''))
      )
        return fail('Verify the profile fields.', 422);
      if (data.expectedVersion !== profile.profileVersion)
        return fail('Profile changed. Reload before another edit', 409);
      try {
        Intl.getCanonicalLocales(data.preferredLanguage);
        new Intl.DateTimeFormat('en', { timeZone: data.timezone });
      } catch {
        return fail('Verify the language and timezone.', 422);
      }
      profile.tenant = {
        ...profile.tenant,
        fullName: data.fullName.trim(),
        dateOfBirth: data.dateOfBirth,
        nationality: data.nationality,
        gender: data.gender,
        pendingPhone: data.pendingPhone,
        matchingPreferences: data.matchingPreferences,
      };
      Object.assign(profile, {
        preferredLanguage: data.preferredLanguage,
        timezone: data.timezone,
        deliveryPreference: data.deliveryPreference,
        profileVersion: profile.profileVersion + 1,
      });
      store.profile = profile;
      localStorage.setItem(storageKey, JSON.stringify(store));
      return respond(profile);
    }
  }
  if (path === '/tenants' || path.startsWith('/tenants/')) {
    if (role !== 'LEASING_MANAGER') return fail('Insufficient permissions', 403);
    if (method !== 'get') return fail('Tenant write workflow not implemented', 501);
    const tenant = {
      id: 'tenant-1',
      fullName: profile.tenant.fullName,
      nationality: profile.tenant.nationality,
      gender: profile.tenant.gender,
      user: {
        email: profile.email,
        phone: profile.phone,
        phoneVerifiedAt: profile.phoneVerifiedAt,
        status: 'ACTIVE',
      },
    };
    if (path === '/tenants') {
      const q = String(config.params?.q ?? '').toLowerCase();
      const page = Number(config.params?.page ?? 1);
      const items = [tenant].filter((item) =>
        (item.fullName + item.user.email).toLowerCase().includes(q),
      );
      return respond({
        items: items.slice((page - 1) * 20, page * 20),
        total: items.length,
        page,
        pageSize: 20,
      });
    }
    if (path === '/tenants/tenant-1')
      return respond({
        ...tenant,
        contracts: store.contracts.map((item) => ({
          id: item.id,
          status: item.status,
          startDate: item.startDate,
          rentalSpace: { name: item.rentalSpace.name, unit: { name: item.rentalSpace.unit.name } },
        })),
      });
    return fail('Tenant not found', 404);
  }
  if (path === '/notifications' || path.startsWith('/notifications/')) {
    if (role === 'ADMIN') return fail('Insufficient permissions', 403);
    const notices = store.requests
      .filter((item) => item.status !== 'DRAFT')
      .flatMap((item) =>
        (item.events ?? [])
          .filter((event: RecordData) => event.kind !== 'DRAFT_CREATED')
          .map((event: RecordData) => ({
            id: role + ':' + event.id,
            readAt: store.readNotices?.[role + ':' + event.id] ?? null,
            createdAt: event.createdAt,
            event: { kind: event.kind, request: { id: item.id, title: item.title } },
          })),
      )
      .reverse();
    if (path === '/notifications/count')
      return respond({ unread: notices.filter((item) => !item.readAt).length });
    if (path === '/notifications' && method === 'get') {
      const status = config.params?.status ?? 'ALL';
      const page = Number(config.params?.page ?? 1);
      const items = notices.filter(
        (item) => status === 'ALL' || (status === 'UNREAD' ? !item.readAt : Boolean(item.readAt)),
      );
      return respond({
        items: items.slice((page - 1) * 20, page * 20),
        total: items.length,
        page,
        pageSize: 20,
      });
    }
    if (
      method === 'post' &&
      (path === '/notifications/read-all' || /^\/notifications\/[^/]+\/read$/.test(path))
    ) {
      const id = path === '/notifications/read-all' ? null : path.split('/')[2];
      const visible = notices.filter((item) => !id || item.id === id);
      if (id && !visible.length) return fail('Notification not found', 404);
      store.readNotices ??= {};
      let updated = 0;
      for (const item of visible)
        if (!item.readAt) {
          store.readNotices[item.id] = new Date().toISOString();
          updated++;
        }
      localStorage.setItem(storageKey, JSON.stringify(store));
      return respond({ updated });
    }
  }
  if (path.startsWith('/admin/')) {
    if (role !== 'ADMIN') return fail('Insufficient permissions', 403);
    if (method !== 'get')
      return fail('Account moderation requires approved MFA and identity/document policies', 409);
    const manager = {
      id: 'preview-review-manager',
      email: 'applicant@preview.invalid',
      phone: '+971500000000',
      status: 'PENDING_APPROVAL',
      createdAt: '2026-11-08T00:00:00Z',
      emailVerifiedAt: '2026-11-08T00:00:00Z',
      phoneVerifiedAt: '2026-11-08T00:00:00Z',
      leasingManager: {
        fullName: 'Demo Applicant',
        nationality: 'Egyptian',
        emiratesIdNumber: '****1234',
        licenseNumber: '****5678',
        declarationAcceptedAt: '2026-11-08T00:00:00Z',
      },
    };
    if (path === '/admin/managers') {
      const q = String(config.params?.q ?? '').toLowerCase();
      const page = Number(config.params?.page ?? 1);
      const rows = [manager].filter(
        (item) =>
          (!config.params?.status || item.status === config.params.status) &&
          (!q || (item.email + item.leasingManager.fullName).toLowerCase().includes(q)),
      );
      return respond({
        items: rows.slice((page - 1) * 20, page * 20),
        total: rows.length,
        page,
        pageSize: 20,
      });
    }
    if (path === '/admin/managers/' + manager.id)
      return respond({
        ...manager,
        history: [],
        moderationAvailable: false,
        documentsAvailable: false,
      });
    if (path === '/admin/audit')
      return respond({ items: [], total: 0, page: Number(config.params?.page ?? 1), pageSize: 20 });
    return fail('Record not found', 404);
  }
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
  const units = (): RecordData[] =>
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
  if (method === 'get' && path === '/inventory/units') {
    const status = config.params?.status ?? 'CURRENT';
    const q = String(config.params?.q ?? '').toLowerCase();
    return respond(
      units().filter(
        (unit) =>
          (status === 'ALL' ||
            (status === 'ARCHIVED' ? Boolean(unit.archivedAt) : !unit.archivedAt)) &&
          (!q ||
            [unit.name, unit.area, unit.building].some((value) =>
              String(value ?? '')
                .toLowerCase()
                .includes(q),
            )),
      ),
    );
  }
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
      ? respond({
          contracts: store.contracts.map((contract) => ({
            ...contract,
            requests: store.requests.filter(
              (item) =>
                (item.contractId ?? 'contract-1') === contract.id &&
                !['ACCEPTED', 'CLOSED', 'REJECTED'].includes(item.status),
            ),
          })),
        })
      : fail('Insufficient permissions', 403);
  if (path === '/dashboard/manager') {
    if (role !== 'LEASING_MANAGER') return fail('Insufficient permissions', 403);
    const spaces = store.units.filter((unit) => !unit.archivedAt).flatMap((unit) => unit.spaces);
    return respond({
      units: store.units.filter((unit) => !unit.archivedAt).length,
      occupied: spaces.filter((space) => space.status === 'OCCUPIED').length,
      vacant: spaces.filter((space) => space.status === 'AVAILABLE').length,
      openRequests: store.requests.filter(
        (item) => !['DRAFT', 'ACCEPTED', 'CLOSED', 'REJECTED'].includes(item.status),
      ).length,
      maintenance: spaces.filter((space) => space.status === 'MAINTENANCE').length,
      awaitingManager: store.requests.filter((item) =>
        ['SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'REOPENED'].includes(item.status),
      ).length,
      deadlines: store.requests
        .filter((item) => item.decisionDueAt)
        .map((item) => ({ id: item.id, title: item.title, decisionDueAt: item.decisionDueAt })),
      financialRecords: [],
      financialBasis: 'Synthetic preview. Financial records require the live API.',
    });
  }
  if (path === '/contracts/options' && method === 'get')
    return role === 'LEASING_MANAGER'
      ? respond({
          tenants: [],
          spaces: [],
          activationEnabled: false,
          limit: 500,
          policy:
            'Contract setup requires the live API. This preview does not store personal identity documents or create backend contracts.',
        })
      : fail('Insufficient permissions', 403);
  if (path === '/contracts' && method === 'get')
    return role !== 'ADMIN' ? respond(store.contracts) : fail('Insufficient permissions', 403);
  if (/^\/payments\/[^/]+\/receipts$/.test(path) && method === 'get') {
    if (!['LEASING_MANAGER', 'TENANT'].includes(role)) return fail('Insufficient permissions', 403);
    if (
      !store.contracts.some((contract) =>
        ((contract.payments ?? []) as RecordData[]).some(
          (payment) => payment.id === path.split('/')[2],
        ),
      )
    )
      return fail('Payment not found', 404);
    return respond({
      items: [],
      total: 0,
      page: 1,
      pageSize: 20,
      recordEnabled: false,
      basis: 'Synthetic preview; individual payment records require the live API.',
    });
  }
  if (/^\/contracts\/[^/]+(?:\/records)?$/.test(path) && method === 'get') {
    if (role === 'ADMIN') return fail('Insufficient permissions', 403);
    const contract = store.contracts.find((item) => item.id === path.split('/')[2]);
    if (!contract) return fail('Contract not found', 404);
    if (!path.endsWith('/records')) {
      return respond(
        Object.fromEntries(
          [
            'id',
            'status',
            'startDate',
            'monthlyRent',
            'currency',
            'dueDay',
            'noticeDays',
            'depositAmount',
            'tenant',
            'rentalSpace',
          ]
            .map((key) => [key, contract[key]])
            .concat([['endDate', contract.endDate ?? null]]),
        ),
      );
    }
    const section = config.params?.section;
    const page = Number(config.params?.page ?? 1);
    if (
      !['payments', 'deposits', 'requests'].includes(section) ||
      !Number.isInteger(page) ||
      page < 1 ||
      page > 10000
    )
      return fail('Invalid record query', 422);
    const rows =
      section === 'payments'
        ? (contract.payments ?? []).map((item: RecordData) => ({
            ...item,
            currency: item.currency ?? contract.currency,
            periodStart: item.periodStart ?? item.dueDate,
          }))
        : section === 'deposits'
          ? []
          : store.requests
              .filter(
                (item) =>
                  (item.contractId ?? 'contract-1') === contract.id &&
                  (role === 'TENANT' || item.status !== 'DRAFT'),
              )
              .map(({ id, title, type, status, createdAt }) => ({
                id,
                title,
                type,
                status,
                createdAt,
              }));
    return respond({
      items: rows.slice((page - 1) * 20, page * 20),
      total: rows.length,
      page,
      pageSize: 20,
    });
  }
  if (path === '/requests' || path.startsWith('/requests/')) {
    if (role === 'ADMIN') return fail('Insufficient permissions', 403);
    if (path === '/requests/options' && method === 'get') {
      if (role !== 'TENANT') return fail('Insufficient permissions', 403);
      return respond({
        types: previewCaseTypes,
        contracts: store.contracts
          .filter((contract) =>
            ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status),
          )
          .map(previewCaseContract),
      });
    }
    if (path === '/requests' && method === 'get') {
      const query = String(config.params?.q ?? '')
        .trim()
        .toLowerCase();
      return respond(
        store.requests
          .filter(
            (item) =>
              (role !== 'LEASING_MANAGER' || item.status !== 'DRAFT') &&
              (!config.params?.status || item.status === config.params.status) &&
              (!config.params?.type || item.type === config.params.type) &&
              (!query || item.title.toLowerCase().includes(query)),
          )
          .map((item) => previewCase(item, store.contracts, role)),
      );
    }
    if (path === '/requests' && method === 'post') {
      if (role !== 'TENANT') return fail('Insufficient permissions', 403);
      if (!previewCaseTypes.includes(data.type))
        return fail('Dedicated workflow not implemented', 409);
      if (
        Object.keys(data).some(
          (key) =>
            ![
              'contractId',
              'clientId',
              'type',
              'title',
              'description',
              'category',
              'urgency',
              'draft',
            ].includes(key),
        ) ||
        typeof data.title !== 'string' ||
        data.title.trim().length < 3 ||
        data.title.trim().length > 160 ||
        typeof data.description !== 'string' ||
        data.description.trim().length < 3 ||
        data.description.trim().length > 5000 ||
        !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data.clientId ?? '') ||
        (data.category != null &&
          (typeof data.category !== 'string' || data.category.length > 100)) ||
        !['NORMAL', 'URGENT'].includes(data.urgency ?? 'NORMAL') ||
        (data.draft !== undefined && typeof data.draft !== 'boolean')
      )
        return fail('Verify the request fields.', 422);
      const contract = store.contracts.find((item) => item.id === data.contractId);
      if (!contract) return fail('Contract not found', 404);
      const content = {
        type: data.type,
        title: data.title.trim(),
        description: data.description.trim(),
        metadata: { category: data.category?.trim() || null, urgency: data.urgency ?? 'NORMAL' },
      };
      let record = store.requests.find(
        (item) => item.contractId === data.contractId && item.clientId === data.clientId,
      );
      if (record) {
        if ((record.events?.[0]?.kind === 'DRAFT_CREATED') !== Boolean(data.draft))
          return fail('Submission key reused with different content', 409);
        if (
          Object.entries(content).some(
            ([key, value]) => JSON.stringify(record![key]) !== JSON.stringify(value),
          )
        )
          return fail('Submission key reused with different content', 409);
      } else {
        if (!['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status))
          return fail('A new request requires an open contract', 409);
        const now = new Date().toISOString();
        record = {
          id: crypto.randomUUID(),
          ...content,
          contractId: contract.id,
          clientId: data.clientId,
          status: data.draft ? 'DRAFT' : 'SUBMITTED',
          version: 1,
          createdAt: now,
          updatedAt: now,
          events: [
            {
              id: crypto.randomUUID(),
              kind: data.draft ? 'DRAFT_CREATED' : 'SUBMITTED',
              message: content.description,
              actorUserId: 'preview-TENANT',
              actorName: profile.tenant.fullName,
              actorRole: 'TENANT',
              sequence: 1,
              createdAt: now,
            },
          ],
        };
        store.requests.push(record);
        localStorage.setItem(storageKey, JSON.stringify(store));
      }
      return respond(previewCase(record, store.contracts, role), 201);
    }
    const maintenance = path.match(/^\/requests\/([^/]+)\/maintenance(?:\/([^/]+)\/respond)?$/);
    if (maintenance && method === 'post') {
      const record = store.requests.find(
        (item) =>
          item.id === maintenance[1] && (role !== 'LEASING_MANAGER' || item.status !== 'DRAFT'),
      );
      if (!record) return fail('Request not found', 404);
      const contract = store.contracts.find(
        (item) => item.id === (record.contractId ?? 'contract-1'),
      );
      if (!contract) return fail('Contract not found', 404);
      mutatePreviewMaintenance(
        record,
        data,
        role,
        fail,
        contract.currency,
        role === 'TENANT' ? profile.tenant.fullName : 'Demo Manager',
        maintenance[2],
      );
      localStorage.setItem(storageKey, JSON.stringify(store));
      return respond(previewCase(record, store.contracts, role), maintenance[2] ? 200 : 201);
    }
    const match = path.match(/^\/requests\/([^/]+)(?:\/(messages|respond))?$/);
    if (match) {
      const record = store.requests.find(
        (item) => item.id === match[1] && (role !== 'LEASING_MANAGER' || item.status !== 'DRAFT'),
      );
      if (!record) return fail('Request not found', 404);
      if (!match[2] && method === 'get') return respond(previewCase(record, store.contracts, role));
      if (match[2] && method === 'post') {
        if (
          data.status === 'SUBMITTED' &&
          record.status === 'DRAFT' &&
          !store.contracts.some(
            (contract) =>
              contract.id === (record.contractId ?? 'contract-1') &&
              ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(contract.status),
          )
        )
          return fail('Submission requires an open contract', 409);
        mutatePreviewCase(
          record,
          match[2],
          data,
          role,
          fail,
          role === 'TENANT' ? profile.tenant.fullName : 'Demo Manager',
        );
        localStorage.setItem(storageKey, JSON.stringify(store));
        return respond(
          previewCase(record, store.contracts, role),
          match[2] === 'messages' ? 201 : 200,
        );
      }
    }
  }
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
    } else if (/^\/inventory\/units\/[^/]+\/(archive|restore)$/.test(path) && method === 'post') {
      const unit = store.units.find((record) => record.id === path.split('/')[3]);
      if (!unit) return fail('Unit not found', 404);
      if (path.endsWith('/archive') === Boolean(unit.archivedAt)) return respond(unit);
      if (
        path.endsWith('/archive') &&
        store.contracts.some(
          (contract) =>
            unit.spaces.some((space: RecordData) => space.id === contract.rentalSpace?.id) &&
            !['CLOSED', 'CANCELLED'].includes(contract.status),
        )
      )
        return fail('Resolve open contracts before unit archive', 409);
      unit.archivedAt = path.endsWith('/archive')
        ? (unit.archivedAt ?? new Date().toISOString())
        : null;
      unit.active = false;
      item = unit;
    } else if (/^\/inventory\/spaces\/[^/]+$/.test(path) && method === 'patch') {
      const space = store.units
        .flatMap((unit) => unit.spaces)
        .find((space) => space.id === path.split('/').at(-1));
      if (!space) return fail('Room not found', 404);
      if (
        store.units.some(
          (unit) => unit.archivedAt && unit.spaces.some((item: RecordData) => item.id === space.id),
        )
      )
        return fail('Room not found', 404);
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
      if (unit.archivedAt) return fail('Restore the unit before a new room', 409);
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
        if (existing.archivedAt) return fail('Restore the unit before an edit', 409);
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
