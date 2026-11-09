import { useQuery } from '@tanstack/react-query';
import { Building2, DoorOpen, Inbox, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QueryFeedback } from '@/components/query-feedback';
import { useAuth } from '../auth';
import { AdminDashboard, TenantDashboard } from './RoleDashboards';

const metrics = [
  { key: 'units', label: 'Units', icon: Building2 },
  { key: 'spaces', label: 'Enabled spaces', icon: DoorOpen },
  { key: 'partial', label: 'Partially occupied spaces', icon: Users },
  { key: 'occupied', label: 'Occupied', icon: Users },
  { key: 'vacant', label: 'Vacant spaces', icon: DoorOpen },
  { key: 'openRequests', label: 'Open requests', icon: Inbox },
  { key: 'maintenance', label: 'Maintenance blocks', icon: DoorOpen },
  { key: 'awaitingManager', label: 'Await manager', icon: Inbox },
];

type PortfolioDashboard = Record<string, unknown> & {
  deadlines?: { id: string; title: string; decisionDueAt: string }[];
  requestsByType?: Record<string, number>;
  financialRecords?: {
    currency: string;
    outstanding: string;
    overdue: string;
    received: string;
    expenses: string;
  }[];
  financialBasis?: string;
};
function ManagerDashboard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      api.get<PortfolioDashboard>('/dashboard/manager').then((response) => response.data),
  });
  if (isPending || error)
    return <QueryFeedback pending={isPending} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Portfolio overview</h1>
      <p className="text-sm text-muted-foreground">
        Space totals include enabled spaces in active, unarchived units.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="break-words text-2xl font-semibold tabular-nums">
                  {typeof data?.[key] === 'number' ? data[key].toLocaleString() : 'Unavailable'}
                </p>
              </div>
              <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="space-y-3 border-t pt-6" aria-labelledby="case-deadlines">
        <h2 id="case-deadlines" className="font-semibold">
          Request deadlines
        </h2>
        {data?.deadlines?.length ? (
          data.deadlines.map((item) => (
            <p key={item.id} className="flex flex-wrap justify-between gap-3 border-b py-2">
              <Link className="text-primary underline" to={'/requests/' + item.id}>
                {item.title}
              </Link>
              <time dateTime={item.decisionDueAt}>
                {new Date(item.decisionDueAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
                (Asia/Dubai)
              </time>
            </p>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">No recorded request deadlines.</p>
        )}
      </section>
      <section className="space-y-3 border-t pt-6" aria-labelledby="recorded-amounts">
        <h2 id="recorded-amounts" className="font-semibold">
          Recorded amounts
        </h2>
        <p className="text-sm text-muted-foreground">
          {data?.financialBasis ?? 'Financial summaries require the live API.'}
        </p>
        {data?.financialRecords?.map((row) => (
          <div key={row.currency} className="space-y-2 rounded-md border p-4">
            <h3 className="font-semibold">{row.currency}</h3>
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ['outstanding', 'Outstanding'],
                ['overdue', 'Overdue balance'],
                ['received', 'Recorded payments'],
                ['expenses', 'Recorded expenses'],
              ].map(([key, label]) => (
                <div key={key}>
                  <dt className="text-sm text-muted-foreground">{label}</dt>
                  <dd>
                    {row.currency} {row[key as keyof typeof row]}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
        <p className="text-sm text-muted-foreground">
          Deposit liabilities require a verified deposit ledger.
        </p>
      </section>
      <section className="space-y-3 border-t pt-6" aria-labelledby="portfolio-records">
        <h2 id="portfolio-records" className="text-base font-semibold">
          Portfolio records
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to="/units">View units</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/contracts">View contracts</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/requests">View requests</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}

export function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'ADMIN') return <AdminDashboard />;
  if (user?.role === 'TENANT') return <TenantDashboard />;
  return <ManagerDashboard />;
}
