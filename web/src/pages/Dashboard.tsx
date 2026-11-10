import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  DoorOpen,
  Inbox,
  Users,
  ArrowUpRight,
  CalendarDays,
  Plus,
  Clock3,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { caseTypes } from '../cases';
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
  deadlineSummary?: { overdue: number; approaching: number };
};
function ManagerDashboard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      api.get<PortfolioDashboard>('/dashboard/manager').then((response) => response.data),
  });
  if (isPending || error)
    return <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Your workspace · Dubai
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-[34px]">
            Portfolio overview
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            A clear view of your properties, people, and priorities.
          </p>
        </div>
        <Button asChild>
          <Link to="/units">
            <Plus aria-hidden="true" />
            Manage properties
          </Link>
        </Button>
      </div>
      <div className="relative overflow-hidden rounded-2xl bg-[#153c39] p-5 text-white sm:p-7">
        <div className="pointer-events-none absolute -top-20 -right-12 size-72 rounded-full border-[35px] border-white/[0.035]" />
        <div className="relative flex flex-wrap items-center justify-between gap-5">
          <div>
            <span className="mb-3 inline-flex items-center gap-2 text-xs text-teal-100/80">
              <CalendarDays className="size-4" aria-hidden="true" />
              {new Date().toLocaleDateString('en-GB', {
                timeZone: 'Asia/Dubai',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
            <h2 className="text-xl font-medium tracking-tight sm:text-2xl">
              Your portfolio, at a glance.
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-teal-100/75">
              Stay close to occupancy, tenant requests, and the next decision.
            </p>
          </div>
          <Link
            to="/requests"
            className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-medium hover:bg-white/10"
          >
            Review requests
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
      <p className="text-sm text-muted-foreground">
        Space totals include enabled spaces in active, unarchived units.
      </p>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon }) => (
          <Card
            key={key}
            className="relative overflow-hidden border-border/70 py-5 shadow-[0_2px_8px_#10272703]"
          >
            <CardContent className="flex items-start justify-between gap-2 px-4 sm:px-5">
              <div className="min-w-0 space-y-2">
                <p className="text-xs leading-5 text-muted-foreground sm:text-[13px]">{label}</p>
                <p className="break-words text-3xl font-semibold tracking-tight tabular-nums">
                  {typeof data?.[key] === 'number' ? data[key].toLocaleString() : '—'}
                </p>
              </div>
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-teal-700">
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[1.25fr_1fr]">
        <section
          className="rounded-2xl border border-border/70 bg-white p-5 sm:p-6"
          aria-labelledby="case-deadlines"
        >
          <div className="mb-5 flex items-center justify-between">
            <span className="grid size-10 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <Clock3 className="size-5" aria-hidden="true" />
            </span>
            <Link
              to="/requests"
              className="flex items-center gap-1 text-xs font-medium text-primary"
            >
              View requests
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
          <h2 id="case-deadlines" className="text-base font-semibold">
            Request deadlines
          </h2>
          {data?.deadlineSummary && (
            <p className="my-3 text-sm">
              {data.deadlineSummary.overdue} overdue · {data.deadlineSummary.approaching} due within
              seven days
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Earliest ten open request deadlines. Each date links to the authorized request.
          </p>
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
        <section
          className="space-y-4 rounded-2xl border border-border/70 bg-white p-5 sm:p-6"
          aria-labelledby="open-case-types"
        >
          <h2 id="open-case-types" className="font-semibold">
            Open requests by type
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(caseTypes).map(([key, label]) => (
              <div key={key}>
                <dt className="text-xs leading-5 text-muted-foreground sm:text-[13px]">{label}</dt>
                <dd>{data?.requestsByType ? (data.requestsByType[key] ?? 0) : 'Unavailable'}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
      <section
        className="space-y-4 rounded-2xl border border-border/70 bg-white p-5 sm:p-6"
        aria-labelledby="recorded-amounts"
      >
        <h2 id="recorded-amounts" className="font-semibold">
          Recorded amounts
        </h2>
        <p className="text-sm text-muted-foreground">
          {data?.financialBasis ?? 'Financial summaries require the live API.'}
        </p>
        {data?.financialRecords?.map((row) => (
          <div key={row.currency} className="space-y-4 rounded-xl bg-slate-50 p-5">
            <h3 className="font-semibold">{row.currency}</h3>
            <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
              {[
                ['outstanding', 'Outstanding'],
                ['overdue', 'Overdue balance'],
                ['received', 'Recorded payments'],
                ['expenses', 'Recorded expenses'],
              ].map(([key, label]) => (
                <div key={key}>
                  <dt className="text-xs leading-5 text-muted-foreground sm:text-[13px]">
                    {label}
                  </dt>
                  <dd className="mt-1 text-lg font-semibold tracking-tight">
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
