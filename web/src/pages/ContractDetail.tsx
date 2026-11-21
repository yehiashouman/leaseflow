import { PaymentReceipts } from '@/components/payment-receipts';
import { MoveOutNotice } from '@/components/move-out-notice';
import { DepositLedger } from '@/components/deposit-ledger';
import { previewMode } from '../session';
import { Documents } from '@/components/documents';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api } from '../api';

import { useAuth } from '../auth';
import { caseDateWithZone } from '../cases';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/query-feedback';

type Contract = {
  id: string;
  status: string;
  startDate: string;
  endDate: string | null;
  monthlyRent: string;
  originalMonthlyRent?: string;
  offeredAt?: string | null;
  confirmedAt?: string | null;
  amendments?: {
    id: string;
    effectiveDate: string;
    monthlyRent: string;
    reason: string | null;
    status: string;
    confirmedAt: string | null;
    canConfirm: boolean;
  }[];
  currency: string;
  dueDay: number;
  noticeDays: number;
  depositAmount: string;
  occupants?: {
    id: string;
    role: string;
    fullName: string;
    nationality: string | null;
    maskedIdentity: string | null;
    identityExpiry: string | null;
    recordComplete: boolean;
    identityExpired: boolean;
    documentAvailable: boolean;
    responsibility: string;
  }[];
  tenant: { fullName: string };
  rentalSpace: { name: string; type: string; unit: { name: string; area: string } };
};
type Payment = {
  id: string;
  periodStart: string;
  dueDate: string;
  expectedDate?: string | null;
  amountDue: string;
  amountPaid: string;
  currency: string;
  status: string;
  paidAt: string | null;
  method: string | null;
  reference: string | null;
};
type Deposit = {
  id: string;
  type: string;
  amount: string;
  description: string | null;
  createdAt: string;
  tenantAcceptedAt: string | null;
  tenantDisputedAt: string | null;
};
type Case = { id: string; title: string; type: string; status: string; createdAt: string };
type Section = 'payments' | 'deposits' | 'requests';
const sections: { value: Section; label: string }[] = [
  { value: 'payments', label: 'Payment records' },
  { value: 'deposits', label: 'Deposit entries' },
  { value: 'requests', label: 'Cases' },
];
function amount(currency: string, value: string) {
  return `${currency} ${Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function Records({ id, currency }: { id: string; currency: string }) {
  const [search] = useSearchParams();
  const [section, setSection] = useState<Section>(() =>
    search.get('section') === 'deposits' ? 'deposits' : 'payments',
  );
  const [page, setPage] = useState(1);
  const showLedger = section === 'deposits' && !previewMode;
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['contract-records', id, section, page],
    enabled: !showLedger,
    queryFn: () =>
      api
        .get<{
          items: (Payment | Deposit | Case)[];
          total: number;
          pageSize: number;
        }>(`/contracts/${id}/records`, { params: { section, page } })
        .then((response) => response.data),
  });
  return (
    <section className="space-y-4" aria-label="Contract records">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Record category">
        {sections.map((item) => (
          <Button
            key={item.value}
            variant={section === item.value ? 'default' : 'outline'}
            aria-pressed={section === item.value}
            onClick={() => {
              setSection(item.value);
              setPage(1);
            }}
          >
            {item.label}
          </Button>
        ))}
      </div>
      {showLedger ? (
        <DepositLedger contractId={id} />
      ) : isPending || error ? (
        <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <h2 className="text-lg font-semibold">
            {sections.find((item) => item.value === section)!.label}
          </h2>
          {!data?.items.length && <p className="text-muted-foreground">No records</p>}
          <ul className="divide-y">
            {data?.items.map((row) => (
              <li key={row.id} className="space-y-2 break-words py-4">
                {'amountDue' in row ? (
                  <>
                    <p className="font-medium">Due {caseDateWithZone(row.dueDate)}</p>
                    <Badge variant={row.status === 'LATE' ? 'destructive' : 'outline'}>
                      {row.status.replaceAll('_', ' ')}
                    </Badge>
                    {row.expectedDate && <p>Expected {caseDateWithZone(row.expectedDate)}</p>}
                    <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      {[
                        ['Period starts', caseDateWithZone(row.periodStart)],
                        ['Amount due', amount(row.currency, row.amountDue)],
                        ['Amount recorded paid', amount(row.currency, row.amountPaid)],
                        [
                          'Payment date',
                          row.paidAt ? caseDateWithZone(row.paidAt) : 'Not recorded',
                        ],
                        ['Method', row.method || 'Not recorded'],
                        ['Reference', row.reference || 'Not recorded'],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd>{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <PaymentReceipts paymentId={row.id} currency={row.currency} />
                  </>
                ) : 'amount' in row ? (
                  <>
                    <p className="font-medium">
                      {row.type.replaceAll('_', ' ')} · {amount(currency, row.amount)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {caseDateWithZone(row.createdAt)}
                    </p>
                    {row.description && <p className="whitespace-pre-wrap">{row.description}</p>}
                    {row.tenantAcceptedAt && (
                      <p className="text-sm">
                        Acceptance recorded: {caseDateWithZone(row.tenantAcceptedAt)}
                      </p>
                    )}
                    {row.tenantDisputedAt && (
                      <p className="text-sm">
                        Dispute recorded: {caseDateWithZone(row.tenantDisputedAt)}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <Link className="font-medium text-primary underline" to={'/requests/' + row.id}>
                      {row.title}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {row.type.replaceAll('_', ' ')} · {caseDateWithZone(row.createdAt)}
                    </p>
                    <Badge variant="outline">{row.status.replaceAll('_', ' ')}</Badge>
                  </>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm" aria-live="polite">
              Page {page} · {data?.total ?? 0} records
            </span>
            <Button
              variant="outline"
              disabled={page * (data?.pageSize ?? 20) >= (data?.total ?? 0)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
export function ContractDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const client = useQueryClient();
  const [selection, setSelection] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmationError, setConfirmationError] = useState('');
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.get<Contract>('/contracts/' + id).then((response) => response.data),
  });
  if (isAxiosError(error) && error.response?.status === 404)
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Contract unavailable</h1>
        <Link to="/contracts" className="text-primary underline">
          Back to contracts
        </Link>
      </div>
    );
  if (isPending || error || !data)
    return <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />;
  const offered = data.status === 'DRAFT' && !!data.offeredAt;
  async function confirm() {
    if (!selection) return;
    setSubmitting(true);
    setConfirmationError('');
    try {
      const path =
        selection === 'contract'
          ? '/confirm'
          : '/amendments/' + encodeURIComponent(selection) + '/confirm';
      const response = await api.post<Contract>('/contracts/' + id + path, { confirmed: true });
      client.setQueryData(['contract', id], response.data);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['contracts'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
        client.invalidateQueries({ queryKey: ['contract-records', id] }),
        client.invalidateQueries({ queryKey: ['reviews'] }),
      ]);
      setSelection(null);
    } catch (cause) {
      const message = isAxiosError<{ message?: string }>(cause)
        ? cause.response?.data?.message
        : null;
      setConfirmationError(message || 'Could not confirm the terms. Try again.');
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <div className="space-y-6">
      <Link className="text-sm text-primary underline" to="/contracts">
        Back to contracts
      </Link>
      <div className="space-y-2">
        <h1 className="break-words text-2xl font-semibold">{data.rentalSpace.name} contract</h1>
        <p className="break-words text-muted-foreground">
          {data.rentalSpace.unit.name} · {data.rentalSpace.unit.area}
        </p>
        <Badge variant="secondary">
          {offered ? 'Awaiting tenant confirmation' : data.status.replaceAll('_', ' ')}
        </Badge>
      </div>
      <dl className="grid gap-4 border-y py-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Primary tenant', data.tenant.fullName],
          ['Space type', data.rentalSpace.type.replaceAll('_', ' ')],
          ['Start date', caseDateWithZone(data.startDate)],
          ['End date', data.endDate ? caseDateWithZone(data.endDate) : 'Open-ended'],
          ['Monthly rent', amount(data.currency, data.monthlyRent)],
          ['Due day', String(data.dueDay)],
          ['Notice period', `${data.noticeDays} days`],
          ['Contract deposit', amount(data.currency, data.depositAmount)],
          ['Contract ID', data.id],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">{value}</dd>
          </div>
        ))}
      </dl>
      {offered && user?.role === 'TENANT' && (
        <Button variant="outline" onClick={() => setSelection('contract')}>
          Review confirmation
        </Button>
      )}
      {data.confirmedAt && <p>Tenant confirmed on {caseDateWithZone(data.confirmedAt)}.</p>}
      {!!data.amendments?.length && (
        <section className="space-y-3" aria-labelledby="rent-amendments">
          <h2 id="rent-amendments" className="text-lg font-semibold">
            Rent amendments
          </h2>
          <p>
            Original monthly rent{' '}
            {amount(data.currency, data.originalMonthlyRent ?? data.monthlyRent)}
          </p>
          {data.amendments.map((row) => (
            <article key={row.id} className="space-y-2 rounded-md border p-4">
              <p>
                {amount(data.currency, row.monthlyRent)} from {caseDateWithZone(row.effectiveDate)}
              </p>
              {row.reason && <p>{row.reason}</p>}
              <p>
                {row.confirmedAt
                  ? 'Tenant confirmed on ' + caseDateWithZone(row.confirmedAt)
                  : row.canConfirm
                    ? 'Awaiting confirmation'
                    : 'Confirmation unavailable'}
              </p>
              {user?.role === 'TENANT' && row.canConfirm && (
                <Button variant="outline" onClick={() => setSelection(row.id)}>
                  Review rent change
                </Button>
              )}
            </article>
          ))}
        </section>
      )}
      {selection && (
        <section className="space-y-3 rounded-md border p-4" aria-label="Tenant confirmation">
          <p>
            {selection === 'contract'
              ? 'Confirm the monthly contract terms shown above.'
              : 'Confirm the selected monthly rent and effective date.'}
          </p>
          {confirmationError && <p role="alert">{confirmationError}</p>}
          <div className="flex gap-2">
            <Button disabled={submitting} onClick={() => void confirm()}>
              Confirm terms
            </Button>
            <Button
              variant="outline"
              disabled={submitting}
              onClick={() => {
                setSelection(null);
                setConfirmationError('');
              }}
            >
              Cancel
            </Button>
          </div>
        </section>
      )}
      <section className="space-y-4" aria-labelledby="contract-occupants">
        <h2 id="contract-occupants" className="text-lg font-semibold">
          Occupants
        </h2>
        <p className="text-sm text-muted-foreground">
          The primary tenant remains responsible for this monthly contract. Unrelated occupants
          require separate accounts and contracts.
        </p>
        {data.occupants?.map((row) => (
          <article key={row.id} className="space-y-3 rounded-md border p-4">
            <h3 className="break-words font-semibold">
              {row.fullName} · {row.role === 'PRIMARY' ? 'Primary tenant' : 'Secondary occupant'}
            </h3>
            <p>{row.responsibility}</p>
            <p>
              Identity record: {row.recordComplete ? 'Complete' : 'Incomplete'}
              {row.identityExpired ? ' · Expired' : ''}
            </p>
            <p>
              {row.maskedIdentity ?? 'ID not recorded'}
              {row.identityExpiry ? ' · Expiry: ' + row.identityExpiry.slice(0, 10) + ' (UTC)' : ''}
            </p>
            <p>Contract identity copy: {row.documentAvailable ? 'Available' : 'Not available'}</p>
            <Documents
              purpose="OCCUPANT_IDENTITY"
              targetId={row.id}
              heading={row.role === 'PRIMARY' ? 'Primary identity copy' : 'Secondary identity copy'}
            />
          </article>
        ))}
        {!data.occupants?.length && (
          <p>Occupant snapshots are absent from this older contract record.</p>
        )}
        <p className="text-sm text-muted-foreground">
          Record completion is not legal certification.
        </p>
      </section>
      {!previewMode && user?.role === 'TENANT' && data.status === 'ACTIVE' && (
        <MoveOutNotice contractId={data.id} />
      )}
      {!offered && <Records key={data.id} id={data.id} currency={data.currency} />}
    </div>
  );
}
