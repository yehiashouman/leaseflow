import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { caseDate, caseEventLabel } from '../cases';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QueryFeedback } from '@/components/query-feedback';
type Notice = {
  id: string;
  createdAt: string;
  readAt: string | null;
  event: { kind: string; request: { id: string; title: string } } | null;
  subject?: { kind: string; path: string; title: string };
};
export function Notifications() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('ALL');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['notifications', status, page],
    queryFn: ({ signal }) =>
      api
        .get<{ items: Notice[]; total: number }>('/notifications', {
          params: { page, status },
          signal,
        })
        .then((response) => response.data),
  });
  async function read(id?: string) {
    setBusy(true);
    setError('');
    try {
      await api.post(id ? '/notifications/' + id + '/read' : '/notifications/read-all');
      await client.invalidateQueries({ queryKey: ['notifications'] });
    } catch (cause) {
      setError(
        isAxiosError(cause)
          ? (cause.response?.data?.message ?? 'Request failed. Retry.')
          : 'Request failed. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <Button
          variant="outline"
          disabled={busy || !query.data?.items.length}
          onClick={() => void read()}
        >
          Mark all read
        </Button>
      </div>
      <Link className="text-primary underline" to="/delivery">
        External delivery status
      </Link>
      <select
        aria-label="Notification status"
        className="h-9 rounded-md border bg-background px-3 text-sm"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value);
          setPage(1);
        }}
      >
        <option value="ALL">All</option>
        <option value="UNREAD">Unread</option>
        <option value="READ">Read</option>
      </select>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {query.isPending || query.error || !query.data ? (
        <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ul className="divide-y">
            {query.data.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1 basis-56 space-y-2">
                  <Link
                    className="break-words font-medium text-primary underline"
                    to={item.subject?.path ?? '/requests/' + item.event!.request.id}
                  >
                    {item.subject?.title ?? item.event!.request.title}
                  </Link>
                  <p className="text-sm">
                    {caseEventLabel(item.subject?.kind ?? item.event!.kind)}
                  </p>
                  <time className="text-xs text-muted-foreground">
                    {caseDate(item.createdAt)} / Asia/Dubai
                  </time>
                </div>
                {item.readAt ? (
                  <Badge variant="outline">Read</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void read(item.id)}
                  >
                    Mark read
                    <span className="sr-only">
                      {' '}
                      {item.subject?.title ?? item.event!.request.title}
                    </span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {!query.data.items.length && (
            <p className="py-12 text-center text-muted-foreground">No notifications</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {query.data.total} notices / Page {page}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                disabled={page === 1 || busy}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page * 20 >= query.data!.total || busy}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
