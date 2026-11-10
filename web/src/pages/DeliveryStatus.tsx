import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { caseDate } from '../cases';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { QueryFeedback } from '@/components/query-feedback';
import { RecordEditor } from '@/components/record-editor';
type Delivery = {
  id: string;
  channel: 'EMAIL' | 'WHATSAPP';
  language: string;
  state: string;
  recipientHint: string | null;
  attempts: number;
  retrySequence: number;
  canRetry: boolean;
  failureCode: string | null;
  createdAt: string;
  acceptedAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  notification: { event: { kind: string; request: { id: string; title: string } } | null };
  subject?: { path: string; title: string };
  attemptLog: {
    number: number;
    state: string;
    failureCode: string | null;
    startedAt: string;
    finishedAt: string | null;
  }[];
};
const stateLabels: Record<string, string> = {
  PAUSED: 'Paused',
  QUEUED: 'Queued',
  RUNNING: 'Dispatch active',
  ACCEPTED: 'Provider accepted',
  SENT: 'Provider reported sent',
  DELIVERED: 'Provider reported delivery',
  READ: 'Provider reported read',
  FAILED: 'Failed',
  UNKNOWN: 'Send result uncertain',
  SUPPRESSED: 'Dispatch withheld',
};
const failureLabels: Record<string, string> = {
  PROVIDER_REJECTED: 'The provider rejected this notice.',
  PROVIDER_TEMPORARY_REJECTION: 'The provider requested a later retry.',
  PROVIDER_THROTTLED: 'The provider requested a lower send rate.',
  PROVIDER_RESULT_UNKNOWN: 'The provider result is uncertain.',
  PROVIDER_DELIVERY_FAILED: 'The provider reported a delivery failure.',
  WORKER_INTERRUPTED: 'The send result is uncertain after interruption.',
  RECIPIENT_UNVERIFIED_OR_INACTIVE: 'Contact verification is required.',
  RECIPIENT_NO_LONGER_ELIGIBLE: 'Your contact, preferences, or record access changed.',
  ANOTHER_ATTEMPT_ACCEPTED: 'Another attempt already reached the provider.',
  PROVIDER_NOT_CONFIGURED: 'The provider is not configured.',
  ATTEMPT_LIMIT: 'The attempt limit is reached.',
};
export function DeliveryStatus() {
  const [page, setPage] = useState(1),
    [state, setState] = useState(''),
    [selected, setSelected] = useState<Delivery | null>(null),
    key = useRef(crypto.randomUUID());
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['delivery-status', state, page],
    queryFn: ({ signal }) =>
      api
        .get<{ items: Delivery[]; total: number; pageSize: number; enabledChannels: string[] }>(
          '/notifications/deliveries',
          { params: { page, state: state || undefined }, signal },
        )
        .then((response) => response.data),
    refetchInterval: 15000,
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">Delivery status</h1>
        <Link className="text-primary underline" to="/notifications">
          My notifications
        </Link>
      </div>
      <p className="text-sm text-muted-foreground">
        These records track your external case notices. Paused notices await provider configuration.
        Times: Asia/Dubai.
      </p>
      <select
        className="h-9 rounded-md border bg-background px-3"
        aria-label="Delivery state"
        value={state}
        onChange={(event) => {
          setState(event.target.value);
          setPage(1);
        }}
      >
        <option value="">All states</option>
        {Object.entries(stateLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      {query.isPending || query.error ? (
        <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <div className="space-y-4">
            {query.data!.items.map((row) => (
              <article key={row.id} className="space-y-3 rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <Link
                    className="min-w-0 flex-1 break-words text-primary underline"
                    to={row.subject?.path ?? '/requests/' + row.notification.event!.request.id}
                  >
                    {row.subject?.title ?? row.notification.event!.request.title}
                  </Link>
                  <Badge variant="outline">
                    {row.channel === 'EMAIL' && row.state === 'ACCEPTED'
                      ? 'SMTP server accepted'
                      : (stateLabels[row.state] ?? row.state)}
                  </Badge>
                </div>
                <p className="text-sm">
                  {row.channel} · {row.recipientHint ?? 'No verified contact'} · Template language:{' '}
                  {row.language} · Resend sequence: {row.retrySequence}
                </p>
                <p className="text-sm text-muted-foreground">Created: {caseDate(row.createdAt)}</p>
                {row.channel === 'EMAIL' && row.state === 'ACCEPTED' && (
                  <p className="text-sm text-muted-foreground">
                    Inbox delivery remains unverified.
                  </p>
                )}
                {row.failureCode && (
                  <p className="text-sm">
                    {failureLabels[row.failureCode] ?? 'This notice needs attention.'}
                  </p>
                )}
                {row.deliveredAt && (
                  <p className="text-sm">Delivery notice received: {caseDate(row.deliveredAt)}</p>
                )}
                {row.readAt && (
                  <p className="text-sm">Read notice received: {caseDate(row.readAt)}</p>
                )}
                <details>
                  <summary className="cursor-pointer text-sm">Attempts ({row.attempts})</summary>
                  <ol className="mt-2 space-y-2">
                    {row.attemptLog.map((attempt) => (
                      <li key={attempt.number} className="text-sm">
                        Attempt {attempt.number} · {stateLabels[attempt.state] ?? attempt.state} ·{' '}
                        {caseDate(attempt.startedAt)}
                        {attempt.failureCode
                          ? ' · ' +
                            (failureLabels[attempt.failureCode] ?? 'Attempt needs attention.')
                          : ''}
                      </li>
                    ))}
                  </ol>
                </details>
                {row.canRetry && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      key.current = crypto.randomUUID();
                      setSelected(row);
                    }}
                  >
                    Retry notice
                  </Button>
                )}
              </article>
            ))}
            {!query.data!.items.length && <p>No external notice records match these filters.</p>}
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
      {selected && (
        <RecordEditor
          open
          title="Retry my notice"
          onOpenChange={(open) => {
            if (!open) setSelected(null);
          }}
          fields={[
            {
              name: 'confirm',
              label: 'Send another notice to my current verified contact',
              required: true,
              type: 'checkbox',
            },
            ...(selected.state === 'UNKNOWN'
              ? [
                  {
                    name: 'acknowledge',
                    label: 'I understand the previous notice can already have arrived',
                    required: true,
                    type: 'checkbox',
                  },
                ]
              : []),
          ]}
          onSave={async (form) => {
            await api.post('/notifications/deliveries/' + selected.id + '/retry', {
              clientId: key.current,
              acknowledgePossibleDuplicate: form.has('acknowledge'),
            });
            await client.invalidateQueries({ queryKey: ['delivery-status'] });
          }}
        />
      )}
    </div>
  );
}
