import { occupancyElapsed } from '../calendar';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { QueryFeedback } from '@/components/query-feedback';

export function AdminDashboard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard', 'ADMIN'],
    queryFn: () =>
      api.get<Record<string, number>>('/dashboard/admin').then((response) => response.data),
  });
  if (isPending || error)
    return <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Platform overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['managers', 'Leasing Managers'],
          ['pendingApproval', 'Await approval'],
          ['suspended', 'Suspended managers'],
          ['tenants', 'Tenants'],
        ].map(([key, label]) => (
          <Card key={key}>
            <CardContent>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold">{data?.[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

type TenantContract = {
  id: string;
  status: string;
  currency: string;
  monthlyRent: number | string;
  depositAmount: number | string;
  startDate: string;
  occupants?: {
    id: string;
    role: string;
    fullName: string;
    recordComplete: boolean;
    identityExpired: boolean;
    documentAvailable: boolean;
  }[];
  dueDay: number;
  noticeDays: number;
  rentalSpace: { name: string; unit: { name: string } };
  payments: {
    id: string;
    dueDate: string;
    amountDue: number | string;
    amountPaid: number | string;
    status: string;
  }[];
  requests: {
    id: string;
    title: string;
    status: string;
    updatedAt?: string;
    decisionDueAt?: string | null;
  }[];
};
export function TenantDashboard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard', 'TENANT'],
    queryFn: () =>
      api
        .get<{
          contracts: TenantContract[];
          unresolvedRequests?: {
            id: string;
            title: string;
            status: string;
            events: {
              id: string;
              actorName: string | null;
              actorRole: string | null;
              message: string | null;
              createdAt: string;
            }[];
          }[];
          unresolvedCount?: number;
          pendingAcknowledgements?: number;
        }>('/dashboard/tenant')
        .then((response) => response.data),
  });
  if (isPending || error)
    return <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />;
  const contract = data?.contracts.find((item) =>
    ['ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING'].includes(item.status),
  );
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">My accommodation</h1>
      {contract ? (
        <>
          <section className="space-y-3 border-b pb-6">
            <h2 className="text-lg font-semibold">
              <Link className="text-primary underline" to={'/contracts/' + contract.id}>
                {contract.rentalSpace.name} · {contract.rentalSpace.unit.name}
              </Link>
            </h2>
            <Badge variant="secondary">{contract.status.replaceAll('_', ' ')}</Badge>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">Monthly rent</dt>
                <dd>
                  {contract.currency} {Number(contract.monthlyRent).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Due day</dt>
                <dd>{contract.dueDay}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">Notice period</dt>
                <dd>{contract.noticeDays} days</dd>
              </div>
            </dl>
          </section>
          <section className="space-y-3 border-b pb-6">
            <h2 className="font-semibold">Occupancy</h2>
            <p>
              Move-in:{' '}
              {new Date(contract.startDate).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
              (Asia/Dubai)
            </p>
            <p>
              {(() => {
                const elapsed = occupancyElapsed(contract.startDate);
                return elapsed
                  ? elapsed.started
                    ? 'Elapsed occupancy: ' +
                      elapsed.months +
                      ' months and ' +
                      elapsed.days +
                      ' days (Asia/Dubai calendar)'
                    : 'Move-in is scheduled; occupancy has not started.'
                  : 'Occupancy duration is unavailable.';
              })()}
            </p>
            {contract.occupants?.map((row) => (
              <p key={row.id}>
                {row.role === 'PRIMARY' ? 'Primary tenant' : 'Secondary occupant'}: {row.fullName} ·
                Identity record {row.recordComplete ? 'complete' : 'incomplete'}
                {row.identityExpired ? ' · expired' : ''} · Contract document{' '}
                {row.documentAvailable ? 'available' : 'absent'}
              </p>
            ))}
          </section>
          <section className="space-y-3">
            <h2 className="font-semibold">Recent payment records</h2>
            <p className="text-sm text-muted-foreground">
              Latest 20 records. Open the contract for full history.
            </p>
            {contract.payments.map((payment) => (
              <div key={payment.id} className="flex flex-wrap justify-between gap-3 border-b py-3">
                <span>
                  {new Date(payment.dueDate).toLocaleDateString('en-GB', {
                    timeZone: 'Asia/Dubai',
                  })}
                </span>
                <span>
                  {contract.currency} {Number(payment.amountDue).toLocaleString()} due ·{' '}
                  {Number(payment.amountPaid).toLocaleString()} paid
                </span>
                <Badge variant="outline">{payment.status.replaceAll('_', ' ')}</Badge>
              </div>
            ))}
          </section>
        </>
      ) : (
        <p className="text-muted-foreground">No active accommodation contract.</p>
      )}
      <section className="space-y-3" aria-labelledby="unresolved-requests">
        <h2 id="unresolved-requests" className="font-semibold">
          Unresolved requests
        </h2>
        <p className="text-sm text-muted-foreground">
          {data?.unresolvedCount ?? 0} unresolved · {data?.pendingAcknowledgements ?? 0} await your
          acknowledgement. Latest 20 requests across your contracts. Open My requests for full
          history.
        </p>
        {(data?.unresolvedRequests ?? []).map((item) => (
          <article key={item.id} className="space-y-2 rounded-md border p-3">
            <Link className="text-primary underline" to={'/requests/' + item.id}>
              {item.title}
            </Link>
            <p>
              {item.status.replaceAll('_', ' ')}
              {item.status === 'RESOLVED' ? ' · Your acknowledgement is required' : ''}
            </p>
            {item.events.map((event) => (
              <div key={event.id} className="space-y-1 text-sm">
                <p>
                  Latest reply · {event.actorName ?? event.actorRole ?? 'Participant'} ·{' '}
                  {new Date(event.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
                  (Asia/Dubai)
                </p>
                <p className="whitespace-pre-wrap break-words">{event.message}</p>
              </div>
            ))}
          </article>
        ))}
        {!data?.unresolvedRequests?.length && <p>No unresolved requests.</p>}
      </section>
      <div className="flex gap-4 text-sm text-primary underline">
        <Link to="/contracts">My contracts</Link>
        <Link to="/requests">My requests</Link>
      </div>
    </div>
  );
}
