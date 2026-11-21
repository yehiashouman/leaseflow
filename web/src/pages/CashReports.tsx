import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QueryFeedback } from '@/components/query-feedback';
import { ListPager } from '@/components/list-controls';

type Amounts = {
  rent: string;
  rentReversals: string;
  recoveries: string;
  ownerRent: string;
  otherExpenses: string;
  cashResult: string;
};
type Result = {
  units: { id: string; name: string }[];
  totals: Amounts;
  undatedExpenses: number;
  sharedCosts: {
    expenseId: string;
    spaceId: string;
    spaceName: string;
    unitName: string;
    amount: string;
    month: string;
  }[];
  spaceTotals: ({ id: string; sharedCosts: string; afterShared: string } & Amounts)[];
  unitTotals: ({ id: string | null; name: string } & Amounts)[];
  lines: {
    id: string;
    date: string;
    kind: string;
    category: string | null;
    amount: string;
    unitId: string | null;
  }[];
};
const columns = [
  ['rent', 'Rent received'],
  ['rentReversals', 'Rent receipts reversed'],
  ['recoveries', 'Expense recoveries'],
  ['ownerRent', 'Owner rent paid'],
  ['otherExpenses', 'Other expenses paid'],
  ['cashResult', 'Net recorded cash'],
] as const;
const categories: Record<string, string> = {
  RENT_RECEIPT: 'Rent receipt',
  RENT_REVERSAL: 'Rent receipt reversal',
  EXPENSE_PAYMENT: 'Expense payment',
  EXPENSE_RECOVERY: 'Expense recovery',
};
function monthInDubai() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    timeZone: 'Asia/Dubai',
  }).formatToParts();
  return (
    parts.find(({ type }) => type === 'year')!.value +
    '-' +
    parts.find(({ type }) => type === 'month')!.value
  );
}
export function CashReports() {
  const [month, setMonth] = useState(monthInDubai);
  const [currency, setCurrency] = useState('AED');
  const [unitId, setUnitId] = useState('');
  const [page, setPage] = useState(1);
  const [sharesPage, setSharesPage] = useState(1);
  const [downloadState, setDownloadState] = useState<'idle' | 'busy' | 'failed'>('idle');
  const params = { month, currency, ...(unitId ? { unitId } : {}) };
  const query = useQuery({
    queryKey: ['cash-report', params],
    queryFn: ({ signal }) =>
      api.get<Result>('/cash-reports', { params, signal }).then(({ data }) => data),
  });
  const options = useQuery({
    queryKey: ['cash-report-units'],
    queryFn: ({ signal }) =>
      api
        .get<{ units: Result['units'] }>('/expenses/options', { signal })
        .then(({ data }) => data.units),
  });
  const pageSize = 20;
  async function download() {
    setDownloadState('busy');
    try {
      const { data } = await api.get<Blob>('/cash-reports/export.csv', {
        params,
        responseType: 'blob',
      });
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'leaseflow-cash-' + month + '-' + currency + '.csv';
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadState('idle');
    } catch {
      setDownloadState('failed');
    }
  }
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Cash reports</h1>
        <p className="text-muted-foreground">
          Cash basis · Dubai calendar. Totals use dated rent receipts, paid expenses, and expense
          recoveries.
        </p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor="cash-month">Month (Dubai)</Label>
          <Input
            id="cash-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (event.target.value) setMonth(event.target.value);
              setPage(1);
              setSharesPage(1);
            }}
          />
        </div>
        <div>
          <Label htmlFor="cash-currency">Currency</Label>
          <select
            id="cash-currency"
            className="block h-9 w-full rounded-md border bg-background px-3"
            value={currency}
            onChange={(event) => {
              setCurrency(event.target.value);
              setPage(1);
              setSharesPage(1);
            }}
          >
            <option>AED</option>
            <option>USD</option>
          </select>
        </div>
        <div>
          <Label htmlFor="cash-unit">Unit</Label>
          <select
            id="cash-unit"
            className="block h-9 w-full rounded-md border bg-background px-3"
            value={unitId}
            onChange={(event) => {
              setUnitId(event.target.value);
              setPage(1);
              setSharesPage(1);
            }}
          >
            <option value="">Entire portfolio</option>
            {options.data?.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
          {options.error && (
            <Button variant="ghost" onClick={() => void options.refetch()}>
              Retry unit list
            </Button>
          )}
        </div>
      </div>
      <QueryFeedback
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
      {query.data && (
        <>
          <dl className="grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3 lg:grid-cols-5">
            {columns.map(([field, label]) => (
              <div key={field}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="font-semibold tabular-nums">
                  {currency} {query.data.totals[field]}
                </dd>
              </div>
            ))}
          </dl>
          {query.data.undatedExpenses > 0 && (
            <p>
              {query.data.undatedExpenses} expenses incurred this month have no recorded paid date.
            </p>
          )}
          {query.data.unitTotals.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-semibold">Cash by unit</h2>
              {query.data.unitTotals.map((unit) => (
                <div
                  className="flex justify-between gap-4 border-b py-2"
                  key={unit.id ?? 'unassigned'}
                >
                  {unit.id ? (
                    <Link to={'/units/' + unit.id} className="text-primary underline">
                      {unit.name}
                    </Link>
                  ) : (
                    <span>{unit.name}</span>
                  )}
                  <span>
                    {currency} {unit.cashResult}
                  </span>
                </div>
              ))}
            </section>
          )}
          {query.data.sharedCosts.length > 0 && (
            <section className="space-y-3" aria-label="Shared cost allocations">
              <h2 className="font-semibold">Shared cost allocations</h2>
              <ul className="divide-y">
                {query.data.sharedCosts
                  .slice((sharesPage - 1) * pageSize, sharesPage * pageSize)
                  .map((share) => (
                    <li
                      key={share.expenseId + ':' + share.spaceId}
                      className="flex flex-wrap justify-between gap-2 py-2"
                    >
                      <span>
                        {share.unitName} / {share.spaceName} · {share.month}
                      </span>
                      <Link to={'/expenses/' + share.expenseId} className="text-primary underline">
                        {currency} {share.amount}
                      </Link>
                    </li>
                  ))}
              </ul>
              <ListPager
                page={sharesPage}
                pageSize={pageSize}
                total={query.data.sharedCosts.length}
                onChange={setSharesPage}
              />
            </section>
          )}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Source records</h2>
              <Button
                variant="outline"
                disabled={downloadState === 'busy'}
                onClick={() => void download()}
              >
                Export CSV
              </Button>
            </div>
            {downloadState === 'failed' && <p role="alert">Could not export the report. Retry.</p>}
            {query.data.lines.length === 0 && <p>No dated cash entries for these filters.</p>}
            <ul className="divide-y">
              {query.data.lines.slice((page - 1) * pageSize, page * pageSize).map((line) => (
                <li key={line.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    {line.date} · {categories[line.kind] ?? line.kind}
                  </span>
                  <span>
                    {currency} {line.amount}
                  </span>
                </li>
              ))}
            </ul>
            <ListPager
              page={page}
              pageSize={pageSize}
              total={query.data.lines.length}
              onChange={setPage}
            />
          </section>
        </>
      )}
    </div>
  );
}
