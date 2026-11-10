import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { QueryFeedback } from '@/components/query-feedback';
import { Card, CardContent } from '@/components/ui/card';
type Row = { status: string; failureCode: string | null; count: number };
type Status = {
  observedAt: string;
  reports: Row[];
  files: Row[];
  emails: Row[];
  business?: { status: string; failureCode: string | null; count: number }[];
  notices: Row[];
  recovery: string;
};
export function Operations() {
  const query = useQuery({
    queryKey: ['operations'],
    queryFn: ({ signal }) =>
      api.get<Status>('/operations/jobs', { signal }).then((response) => response.data),
    refetchInterval: 30000,
  });
  if (query.isPending || query.error)
    return <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />;
  const data = query.data!;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Job status</h1>
      <p className="text-sm text-muted-foreground">
        Observed: {new Date(data.observedAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
        (Asia/Dubai). Refresh interval: 30 seconds.
      </p>
      <div className="grid gap-4 lg:grid-cols-4">
        {(['reports', 'files', 'emails', 'notices', 'business'] as const).map((group) => (
          <Card key={group}>
            <CardContent className="space-y-3">
              <h2 className="font-semibold capitalize">{group}</h2>
              {(data[group] ?? []).length ? (
                (data[group] ?? []).map((row) => (
                  <div
                    key={row.status + ':' + row.failureCode}
                    className="flex flex-wrap justify-between gap-2 border-b pb-2"
                  >
                    <span className="break-words">
                      {row.status.replaceAll('_', ' ')}
                      {row.failureCode ? ' / ' + row.failureCode.replaceAll('_', ' ') : ''}
                    </span>
                    <span>{row.count}</span>
                  </div>
                ))
              ) : (
                <p>No jobs recorded.</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="max-w-3xl text-sm text-muted-foreground">{data.recovery}</p>
    </div>
  );
}
