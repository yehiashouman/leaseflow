import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RecordEditor, type EditorField } from '@/components/record-editor';
import { QueryFeedback } from '@/components/query-feedback';
import { Documents } from '@/components/documents';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';

type Expense = {
  id: string;
  category: string;
  amount: string;
  currency: string;
  vendor: string | null;
  incurredAt: string;
  description: string | null;
  scopeKind: string;
  unit?: { id: string; name: string } | null;
  landlord?: { id: string; name: string } | null;
  rentalSpace?: { id: string; name: string } | null;
  contract?: { id: string } | null;
  void: { reason: string; createdAt: string } | null;
  recovered: string;
  unrecovered: string;
  recoveries: {
    id: string;
    amount: string;
    paidAt: string;
    method: string;
    reference: string | null;
    payerName?: string | null;
    notes: string | null;
  }[];
};
type Options = {
  categories: string[];
  landlords: { id: string; name: string }[];
  units: { id: string; name: string }[];
  spaces: { id: string; name: string; unit: { name: string } }[];
  contracts: { id: string; tenant: { fullName: string }; rentalSpace: { name: string } }[];
  tenants?: { id: string; fullName: string }[];
  limit: number;
};
const today = () => new Date().toISOString().slice(0, 10);
const date = (value: string) => value.slice(0, 10);
const errorText = (cause: unknown) =>
  isAxiosError(cause)
    ? (cause.response?.data?.message ?? 'Request failed. Retry.')
    : 'Request failed. Retry.';
const moneyField = (currency: string): EditorField => ({
  name: 'amount',
  label: 'Amount (' + currency + ')',
  required: true,
  type: 'number',
  min: 0.01,
  max: 9999999999.99,
  step: '0.01',
});
function ExpenseEditor({ onClose }: { onClose: () => void }) {
  const key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const options = useQuery({
    queryKey: ['expense-options', key.current],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: () => api.get<Options>('/expenses/options').then((response) => response.data),
  });
  if (options.isPending || options.error)
    return (
      <div className="space-y-3 rounded-md border p-4">
        <QueryFeedback pending={options.isPending} onRetry={() => void options.refetch()} />
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    );
  const data = options.data!;
  const scopes = [
    { value: 'PORTFOLIO', label: 'Portfolio' },
    ...data.landlords.map((row) => ({
      value: 'LANDLORD:' + row.id,
      label: 'Landlord: ' + row.name,
    })),
    ...data.units.map((row) => ({ value: 'UNIT:' + row.id, label: 'Unit: ' + row.name })),
    ...data.spaces.map((row) => ({
      value: 'SPACE:' + row.id,
      label: 'Space: ' + row.unit.name + ' / ' + row.name,
    })),
    ...data.contracts.map((row) => ({
      value: 'CONTRACT:' + row.id,
      label: 'Contract: ' + row.tenant.fullName + ' / ' + row.rentalSpace.name,
    })),
  ];
  return (
    <RecordEditor
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="Record expense"
      fields={[
        {
          name: 'category',
          label: 'Category',
          required: true,
          value: data.categories[0],
          options: data.categories.map((value) => ({ value, label: value.replaceAll('_', ' ') })),
        },
        { name: 'vendor', label: 'Vendor', required: true, maxLength: 200 },
        moneyField('selected currency'),
        {
          name: 'currency',
          label: 'Currency',
          value: 'AED',
          options: ['AED', 'USD'].map((value) => ({ value, label: value })),
        },
        {
          name: 'incurredAt',
          label: 'Expense date (UTC)',
          type: 'date',
          value: today(),
          required: true,
        },
        {
          name: 'scope',
          label: 'Direct cost scope (first ' + data.limit + ' records per group)',
          value: 'PORTFOLIO',
          options: scopes,
        },
        { name: 'description', label: 'Notes', type: 'textarea', maxLength: 5000 },
      ]}
      onSave={async (form) => {
        const [scopeKind, targetId] = String(form.get('scope')).split(':');
        await api.post('/expenses', {
          clientId: key.current,
          category: form.get('category'),
          vendor: form.get('vendor'),
          amount: String(form.get('amount')),
          currency: form.get('currency'),
          incurredAt: form.get('incurredAt'),
          scopeKind,
          targetId: targetId ?? null,
          description: form.get('description') || '',
        });
        await Promise.all([
          client.invalidateQueries({ queryKey: ['expenses'] }),
          client.invalidateQueries({ queryKey: ['dashboard'] }),
        ]);
      }}
    />
  );
}
export function Expenses() {
  const [page, setPage] = useState(1),
    [open, setOpen] = useState(false),
    [status, setStatus] = useState('ACTIVE'),
    [currency, setCurrency] = useState(''),
    [search, setSearch] = useState(''),
    [from, setFrom] = useState(''),
    [to, setTo] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const params = {
    page,
    status,
    currency: currency || undefined,
    q: search,
    from: from || undefined,
    to: to || undefined,
  };
  const query = useQuery({
    queryKey: ['expenses', params],
    queryFn: ({ signal }) =>
      api
        .get<{
          items: Expense[];
          total: number;
          pageSize: number;
          totals: { currency: string; grossAmount: string }[];
        }>('/expenses', { params, signal })
        .then((response) => response.data),
  });
  async function download() {
    setBusy(true);
    setError('');
    try {
      const response = await api.get('/expenses/export.csv', { params, responseType: 'blob' });
      const url = URL.createObjectURL(response.data),
        link = document.createElement('a');
      link.href = url;
      link.download = 'leaseflow-expenses.csv';
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">Expenses</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || query.isPending || !!query.error}
            onClick={() => void download()}
          >
            Export CSV
          </Button>
          <Button onClick={() => setOpen(true)}>Record expense</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Original-currency records. Gross expenses and external recoveries remain separate. No
        currency conversion, shared-cost calculation, or deposit movement occurs here.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="expense-search">Search vendor or notes</Label>
          <Input
            id="expense-search"
            type="search"
            value={search}
            maxLength={150}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="expense-status">Status</Label>
          <select
            id="expense-status"
            className="block h-9 rounded-md border bg-background px-3"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            {['ACTIVE', 'VOID', 'ALL'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="expense-currency">Currency</Label>
          <select
            id="expense-currency"
            className="block h-9 rounded-md border bg-background px-3"
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All currencies</option>
            <option>AED</option>
            <option>USD</option>
          </select>
        </div>
        <div>
          <Label htmlFor="expense-from">From (UTC)</Label>
          <Input
            id="expense-from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="expense-to">To (UTC)</Label>
          <Input
            id="expense-to"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {query.isPending || query.error ? (
        <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="flex flex-wrap gap-3">
            {query.data!.totals.map((row) => (
              <Badge key={row.currency} variant="secondary">
                Filtered gross: {row.currency} {row.grossAmount}
              </Badge>
            ))}
          </div>
          <div className="space-y-3">
            {query.data!.items.map((row) => (
              <article
                key={row.id}
                className="flex flex-wrap justify-between gap-3 rounded-md border p-4"
              >
                <div className="min-w-0">
                  <Link className="break-words text-primary underline" to={'/expenses/' + row.id}>
                    {row.vendor || 'Expense record'}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {date(row.incurredAt)} (UTC) · {row.category.replaceAll('_', ' ')} ·{' '}
                    {row.scopeKind}
                    {row.unit ? ' / ' + row.unit.name : ''}
                  </p>
                </div>
                <div>
                  <p>
                    {row.currency} {row.amount}
                  </p>
                  <p className="text-sm">
                    Recovered: {row.currency} {row.recovered}
                  </p>
                  {row.void && <Badge variant="outline">VOID</Badge>}
                </div>
              </article>
            ))}
            {!query.data!.items.length && <p>No expenses match these filters.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} · {query.data!.total} records
            </span>
            <Button
              variant="outline"
              disabled={page * query.data!.pageSize >= query.data!.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
      {open && <ExpenseEditor onClose={() => setOpen(false)} />}
    </div>
  );
}
export function ExpenseDetail() {
  const { id } = useParams(),
    client = useQueryClient();
  const [action, setAction] = useState<'void' | 'recoveries' | null>(null),
    key = useRef(crypto.randomUUID());
  const query = useQuery({
    queryKey: ['expense', id],
    queryFn: ({ signal }) =>
      api.get<Expense>('/expenses/' + id, { signal }).then((response) => response.data),
  });
  const payers = useQuery({
    queryKey: ['expense-options', key.current],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    enabled: action === 'recoveries',
    queryFn: () => api.get<Options>('/expenses/options').then((response) => response.data),
  });
  if (query.isPending || query.error)
    return <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />;
  const data = query.data!;
  return (
    <div className="space-y-6">
      <Link className="text-primary underline" to="/expenses">
        Back to expenses
      </Link>
      <h1 className="break-words text-2xl font-semibold">{data.vendor || 'Expense record'}</h1>
      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ['Gross expense', data.currency + ' ' + data.amount],
          ['External recoveries', data.currency + ' ' + data.recovered],
          ['Unrecovered amount', data.currency + ' ' + data.unrecovered],
          ['Expense date (UTC)', date(data.incurredAt)],
          ['Category', data.category.replaceAll('_', ' ')],
          [
            'Scope',
            [
              data.scopeKind,
              data.landlord?.name,
              data.unit?.name,
              data.rentalSpace?.name,
              data.contract?.id,
            ]
              .filter(Boolean)
              .join(' / '),
          ],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="whitespace-pre-wrap break-words">{data.description}</p>
      {data.void ? (
        <Alert>
          <AlertDescription>
            VOID: {data.void.reason}. The original record and evidence remain available.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              key.current = crypto.randomUUID();
              setAction('recoveries');
            }}
          >
            Record external recovery
          </Button>
          <Button
            variant="outline"
            disabled={data.recoveries.length > 0}
            onClick={() => {
              key.current = crypto.randomUUID();
              setAction('void');
            }}
          >
            Void expense
          </Button>
        </div>
      )}
      <section className="space-y-3">
        <h2 className="font-semibold">External recovery history</h2>
        <p className="text-sm text-muted-foreground">
          These records confirm money already received. They do not create tenant charges or deposit
          deductions.
        </p>
        {data.recoveries.map((row) => (
          <article key={row.id} className="space-y-2 rounded-md border p-3">
            <p>
              {data.currency} {row.amount} · {date(row.paidAt)} (UTC) · {row.method}
            </p>
            <p className="break-words">{row.reference}</p>
            <p>{row.payerName ? 'Payer snapshot: ' + row.payerName : 'Payer tenant not linked'}</p>
            <p className="whitespace-pre-wrap break-words">{row.notes}</p>
          </article>
        ))}
        {!data.recoveries.length && <p>No external recoveries recorded.</p>}
      </section>
      <Documents
        purpose="EXPENSE_EVIDENCE"
        targetId={data.id}
        heading="Expense and recovery evidence"
        readOnly={!!data.void}
      />
      {action && (
        <RecordEditor
          open
          onOpenChange={(open) => {
            if (!open) setAction(null);
          }}
          title={action === 'void' ? 'Confirm expense void' : 'Record external recovery'}
          fields={
            action === 'void'
              ? [
                  { name: 'reason', label: 'Reason', required: true, maxLength: 1000 },
                  {
                    name: 'confirmed',
                    label: 'I confirm this void preserves the original record',
                    required: true,
                    type: 'checkbox',
                  },
                ]
              : [
                  moneyField(data.currency),
                  {
                    name: 'payerTenantId',
                    label: 'Payer tenant (optional)',
                    options: [
                      { value: '', label: 'No tenant link' },
                      ...(payers.data?.tenants ?? []).map((row) => ({
                        value: row.id,
                        label: row.fullName,
                      })),
                    ],
                  },
                  {
                    name: 'paidAt',
                    label: 'Payment date (UTC)',
                    type: 'date',
                    value: today(),
                    required: true,
                  },
                  { name: 'method', label: 'Payment method', required: true, maxLength: 80 },
                  { name: 'reference', label: 'Reference', maxLength: 200 },
                  { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 5000 },
                  {
                    name: 'confirmed',
                    label: 'I confirm this external payment already happened',
                    required: true,
                    type: 'checkbox',
                  },
                ]
          }
          onSave={async (form) => {
            const body =
              action === 'void'
                ? { clientId: key.current, reason: form.get('reason') }
                : {
                    clientId: key.current,
                    amount: String(form.get('amount')),
                    paidAt: form.get('paidAt'),
                    method: form.get('method'),
                    reference: form.get('reference') || '',
                    notes: form.get('notes') || '',
                    ...(form.get('payerTenantId')
                      ? { payerTenantId: String(form.get('payerTenantId')) }
                      : {}),
                  };
            const response = await api.post<Expense>('/expenses/' + id + '/' + action, body);
            client.setQueryData(['expense', id], response.data);
            await Promise.all([
              client.invalidateQueries({ queryKey: ['expenses'] }),
              client.invalidateQueries({ queryKey: ['dashboard'] }),
            ]);
          }}
        />
      )}
    </div>
  );
}
