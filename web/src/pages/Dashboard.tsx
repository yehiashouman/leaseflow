import { useQuery } from '@tanstack/react-query';
import {
  Building2,
  DoorOpen,
  Inbox,
  Receipt,
  ShieldCheck,
  TriangleAlert,
  TrendingUp,
  Users,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { QueryFeedback } from '@/components/query-feedback';
import { useAuth } from '../auth';
import { AdminDashboard, TenantDashboard } from './RoleDashboards';

const metrics = [
  { key: 'units', label: 'Units', icon: Building2 },
  { key: 'occupied', label: 'Occupied', icon: Users },
  { key: 'vacant', label: 'Vacant spaces', icon: DoorOpen },
  { key: 'openRequests', label: 'Open requests', icon: Inbox },
  { key: 'overdue', label: 'Overdue (AED)', icon: TriangleAlert },
  { key: 'depositsHeld', label: 'Deposits held (AED)', icon: ShieldCheck },
  { key: 'income', label: 'Recorded income (AED)', icon: TrendingUp },
  { key: 'expenses', label: 'Expenses (AED)', icon: Receipt },
];

function ManagerDashboard() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () =>
      api
        .get<Record<string, number | string>>('/dashboard/manager')
        .then((response) => response.data),
  });
  if (isPending || error)
    return <QueryFeedback pending={isPending} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Portfolio overview</h1>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardContent className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-2">
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="break-words text-2xl font-semibold tabular-nums">
                  {Number(data?.[key] ?? 0).toLocaleString()}
                </p>
              </div>
              <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>
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
