import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/query-feedback';
import { RecordEditor } from '@/components/record-editor';
type Job = {
  id: string;
  kind: string;
  state: string;
  attempts: number;
  retryCount: number;
  processed: number;
  nextRunAt: string;
  failureCode: string | null;
  lastSuccessAt: string | null;
};
export function BusinessJobs() {
  const [page, setPage] = useState(1),
    [state, setState] = useState(''),
    [selected, setSelected] = useState<Job | null>(null),
    key = useRef(crypto.randomUUID()),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ['business-jobs', page, state],
    queryFn: ({ signal }) =>
      api
        .get<{
          items: Job[];
          total: number;
          pageSize: number;
          recoveryEnabled: boolean;
          workers?: {
            recorded: number;
            active: number;
            redisDegraded: number;
            stale: number;
            stopped: number;
            limit: number;
          };
        }>('/operations/business-jobs', { params: { page, state: state || undefined }, signal })
        .then((response) => response.data),
    refetchInterval: 15000,
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Scheduled business jobs</h1>
      <p className="text-sm text-muted-foreground">
        Schedules, cursors, effects, and recovery records persist in MySQL. Redis supplies wake
        signals and scan checkpoints.
      </p>
      <select
        aria-label="Scheduled job state"
        className="h-9 rounded-md border bg-background px-3"
        value={state}
        onChange={(event) => {
          setState(event.target.value);
          setPage(1);
        }}
      >
        {['', 'QUEUED', 'RUNNING', 'PAUSED', 'FAILED', 'STOPPED'].map((value) => (
          <option key={value} value={value}>
            {value || 'All states'}
          </option>
        ))}
      </select>
      {query.isPending || query.error ? (
        <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {query.data!.workers && (
            <p role="status">
              {query.data!.workers.recorded
                ? 'Worker heartbeats: ' +
                  query.data!.workers.active +
                  ' active · ' +
                  query.data!.workers.redisDegraded +
                  ' Redis degraded · ' +
                  query.data!.workers.stale +
                  ' stale · ' +
                  query.data!.workers.stopped +
                  ' stopped (latest 100)'
                : 'No worker heartbeat received. Verify the standalone worker.'}
            </p>
          )}
          <div className="space-y-3">
            {query.data!.items.map((job) => (
              <article key={job.id} className="space-y-2 rounded-md border p-4">
                <p>
                  {job.kind.replaceAll('_', ' ')} · {job.state}
                </p>
                <p>
                  Attempts: {job.attempts} · Completed executions: {job.processed} · Manual retries:{' '}
                  {job.retryCount}
                </p>
                <p>
                  Next eligible time:{' '}
                  {new Date(job.nextRunAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
                  (Asia/Dubai)
                </p>
                {job.failureCode && <p role="status">Failure code: {job.failureCode}</p>}
                {query.data!.recoveryEnabled &&
                  ['FAILED', 'PAUSED'].includes(job.state) &&
                  job.retryCount < 2 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        key.current = crypto.randomUUID();
                        setSelected(job);
                      }}
                    >
                      Retry scheduled job
                    </Button>
                  )}
              </article>
            ))}
          </div>
          {!query.data!.items.length && <p>No scheduled jobs match these filters.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} · {query.data!.total} jobs
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
      {selected && (
        <RecordEditor
          open
          title="Retry scheduled job"
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          fields={[
            {
              name: 'reason',
              label: 'Recovery reason',
              type: 'textarea',
              maxLength: 1000,
              required: true,
            },
          ]}
          onSave={async (form) => {
            await api.post('/operations/business-jobs/' + selected.id + '/retry', {
              clientId: key.current,
              expectedRetryCount: selected.retryCount,
              reason: String(form.get('reason')),
            });
            await client.invalidateQueries({ queryKey: ['business-jobs'] });
          }}
        />
      )}
    </div>
  );
}
