import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import type { Role } from '../session';
type Row = { id: string; [key: string]: any };
type Store = { expenses?: Row[]; units: Row[]; landlords: Row[]; contracts: Row[]; profile?: Row };
const categories = [
  'OWNER_RENT',
  'ELECTRICITY',
  'WATER',
  'COOLING',
  'INTERNET',
  'MAINTENANCE',
  'CLEANING',
  'FURNISHING',
  'LICENSE_FEE',
  'OTHER',
];
const minor = (value: string) => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
};
const cash = (value: bigint) => String(value / 100n) + '.' + String(value % 100n).padStart(2, '0');
const validAmount = (value: unknown): value is string =>
  typeof value === 'string' && /^(0|[1-9]\d{0,9})(\.\d{1,2})?$/.test(value) && minor(value) > 0n;
const csv = (value: unknown) => {
  let text = String(value ?? '');
  if (/^\s*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
};
export function previewExpenses(
  config: InternalAxiosRequestConfig,
  store: Store,
  role: Role,
  respond: (body: unknown, status?: number) => AxiosResponse,
  fail: (message: string, status: number) => never,
  save: () => void,
): AxiosResponse | undefined {
  const path = (config.url ?? '').replace(/\/$/, '');
  if (!path.startsWith('/expenses')) return;
  if (role !== 'LEASING_MANAGER') return fail('Insufficient permissions', 403);
  store.expenses ??= [];
  const data = typeof config.data === 'string' ? JSON.parse(config.data) : (config.data ?? {}),
    method = config.method ?? 'get';
  const dto = (row: Row) => {
    const recovered = row.recoveries.reduce(
      (sum: bigint, entry: Row) => sum + minor(entry.amount),
      0n,
    );
    return { ...row, recovered: cash(recovered), unrecovered: cash(minor(row.amount) - recovered) };
  };
  if (path === '/expenses/options' && method === 'get')
    return respond({
      categories,
      landlords: store.landlords.filter((row) => !row.archivedAt),
      units: store.units.filter((row) => !row.archivedAt),
      spaces: store.units
        .filter((row) => !row.archivedAt)
        .flatMap((unit) => unit.spaces.map((row: Row) => ({ ...row, unit: { name: unit.name } }))),
      contracts: store.contracts,
      tenants: [{ id: 'tenant-1', fullName: store.profile?.tenant?.fullName ?? 'Demo Tenant' }],
      limit: 500,
    });
  if (method === 'get' && ['/expenses', '/expenses/export.csv'].includes(path)) {
    const query = config.params ?? {},
      page = Math.max(1, Number(query.page ?? 1));
    if (query.from && query.to && query.from > query.to)
      return fail('The start date must precede the end date', 422);
    const rows = store.expenses
      .filter(
        (row) =>
          (query.status === 'ALL' || (query.status === 'VOID' ? !!row.void : !row.void)) &&
          (!query.currency || row.currency === query.currency) &&
          (!query.category || row.category === query.category) &&
          (!query.q ||
            (row.vendor + ' ' + row.description)
              .toLowerCase()
              .includes(String(query.q).toLowerCase())) &&
          (!query.from || row.incurredAt.slice(0, 10) >= query.from) &&
          (!query.to || row.incurredAt.slice(0, 10) <= query.to),
      )
      .sort((a, b) => b.incurredAt.localeCompare(a.incurredAt) || b.id.localeCompare(a.id));
    if (path.endsWith('.csv')) {
      const content = [
        [
          'Record ID',
          'Date (UTC)',
          'Category',
          'Vendor',
          'Currency',
          'Gross expense',
          'Recovered',
          'Scope',
          'Status',
          'Notes',
        ],
        ...rows.map((row) => [
          row.id,
          row.incurredAt.slice(0, 10),
          row.category,
          row.vendor,
          row.currency,
          row.amount,
          dto(row).recovered,
          row.scopeKind,
          row.void ? 'VOID' : 'ACTIVE',
          row.description,
        ]),
      ]
        .map((row) => row.map(csv).join(','))
        .join('\r\n');
      return respond(new Blob([content], { type: 'text/csv' }));
    }
    const sums = new Map<string, bigint>();
    for (const row of rows)
      sums.set(row.currency, (sums.get(row.currency) ?? 0n) + minor(row.amount));
    return respond({
      items: rows.slice((page - 1) * 20, page * 20).map(dto),
      total: rows.length,
      page,
      pageSize: 20,
      totals: [...sums].map(([currency, amount]) => ({ currency, grossAmount: cash(amount) })),
    });
  }
  if (path === '/expenses' && method === 'post') {
    if (
      !validAmount(data.amount) ||
      !categories.includes(data.category) ||
      !['AED', 'USD'].includes(data.currency) ||
      !data.vendor?.trim() ||
      !data.clientId ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.incurredAt)
    )
      return fail('Verify the expense fields', 422);
    const intent = JSON.stringify({ ...data, amount: cash(minor(data.amount)) });
    const duplicate = store.expenses.find((row) => row.clientId === data.clientId);
    if (duplicate) {
      if (duplicate.intent !== intent)
        return fail('Expense key reused with different content', 409);
      return respond(dto(duplicate), 201);
    }
    let unit: Row | undefined,
      rentalSpace: Row | undefined,
      landlord: Row | undefined,
      contract: Row | undefined;
    if (data.scopeKind === 'LANDLORD')
      landlord = store.landlords.find((row) => row.id === data.targetId && !row.archivedAt);
    else if (data.scopeKind === 'UNIT')
      unit = store.units.find((row) => row.id === data.targetId && !row.archivedAt);
    else if (data.scopeKind === 'SPACE') {
      unit = store.units.find(
        (row) => !row.archivedAt && row.spaces.some((space: Row) => space.id === data.targetId),
      );
      rentalSpace = unit?.spaces.find((space: Row) => space.id === data.targetId);
    } else if (data.scopeKind === 'CONTRACT') {
      contract = store.contracts.find((row) => row.id === data.targetId);
      rentalSpace = contract?.rentalSpace;
      unit = rentalSpace?.unit;
    } else if (data.scopeKind !== 'PORTFOLIO' || data.targetId) return fail('Scope not found', 404);
    if (data.scopeKind !== 'PORTFOLIO' && !unit && !landlord && !contract)
      return fail('Scope not found', 404);
    const row = {
      ...data,
      id: crypto.randomUUID(),
      amount: cash(minor(data.amount)),
      incurredAt: data.incurredAt + 'T00:00:00Z',
      createdAt: new Date().toISOString(),
      void: null,
      recoveries: [],
      unit,
      landlord,
      rentalSpace,
      contract: contract ? { id: contract.id } : null,
      intent,
    };
    store.expenses.push(row);
    save();
    return respond(dto(row), 201);
  }
  const match = /^\/expenses\/([^/]+)(?:\/(void|recoveries))?$/.exec(path);
  if (!match) return fail('Preview expense route not found', 404);
  const row = store.expenses.find((item) => item.id === match[1]);
  if (!row) return fail('Expense not found', 404);
  if (!match[2] && method === 'get') return respond(dto(row));
  if (method !== 'post') return fail('Expense history is immutable', 404);
  if (match[2] === 'void') {
    if (row.void) {
      if (row.void.clientId !== data.clientId || row.void.reason !== data.reason)
        return fail('Expense already void; inspect its history', 409);
      return respond(dto(row));
    }
    if (row.recoveries.length)
      return fail(
        'Expense recovery history requires separate settlement; void is unavailable',
        409,
      );
    if (typeof data.reason !== 'string' || data.reason.trim().length < 3)
      return fail('Add a reason', 422);
    row.void = { ...data, createdAt: new Date().toISOString() };
    save();
    return respond(dto(row));
  }
  if (match[2] === 'recoveries') {
    if (!validAmount(data.amount) || !data.method?.trim() || !data.paidAt || !data.clientId)
      return fail('Verify the recovery fields', 422);
    const intent = JSON.stringify({ ...data, amount: cash(minor(data.amount)) });
    const previous = row.recoveries.find((entry: Row) => entry.clientId === data.clientId);
    if (previous) {
      if (previous.intent !== intent)
        return fail('Recovery key reused with different content', 409);
      return respond(dto(row), 201);
    }
    if (row.void || minor(data.amount) > minor(dto(row).unrecovered))
      return fail('Recovery exceeds unrecovered expense', 409);
    if (data.payerTenantId && data.payerTenantId !== 'tenant-1')
      return fail('Payer tenant not found', 404);
    row.recoveries.push({
      ...data,
      payerName: data.payerTenantId ? (store.profile?.tenant?.fullName ?? 'Demo Tenant') : null,
      amount: cash(minor(data.amount)),
      paidAt: data.paidAt + 'T00:00:00Z',
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      intent,
    });
    save();
    return respond(dto(row), 201);
  }
  return fail('Expense history is immutable', 404);
}
