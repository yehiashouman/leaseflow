import { recoverableQueryError } from '../api-errors';
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { QueryFeedback, CachedQueryNotice } from '@/components/query-feedback';
import { RecordEditor } from '@/components/record-editor';
type Review = {
  id: string;
  contractId: string;
  dueAt: string;
  reviewedAt: string | null;
  decision: string | null;
  deferredUntil: string | null;
  version: number;
  milestoneMonths: number | null;
  sameSpaceSince: string | null;
  contract: {
    monthlyRent: string;
    currency: string;
    tenant: { fullName: string };
    rentalSpace: { name: string; unit: { name: string } };
  };
  rentalSpace: { name: string; unit: { name: string } } | null;
  events: {
    id: string;
    kind: string;
    note: string | null;
    actorName: string | null;
    proposedRent: string | null;
    currency: string | null;
    effectiveMonth: string | null;
    deferredUntil: string | null;
    createdAt: string;
    amendment: { id: string; status: string } | null;
  }[];
};
const date = (value: string) =>
  new Date(value).toLocaleDateString('en-GB', { timeZone: 'Asia/Dubai' }) + ' (Asia/Dubai)';
const decisionLabel = (value: string | null) =>
  ({
    NO_CHANGE: 'Reviewed / No Change',
    PROPOSED_PRICE: 'Price proposal recorded',
    DEFERRED: 'Deferred review',
  })[value ?? ''] ?? 'Review due';
export function Reviews() {
  const [page, setPage] = useState(1),
    [status, setStatus] = useState('ALL'),
    [q, setQ] = useState('');
  const query = useQuery({
    queryKey: ['reviews', page, status, q],
    queryFn: ({ signal }) =>
      api
        .get<{ items: Review[]; total: number; pageSize: number }>('/reviews', {
          params: { page, status, q },
          signal,
        })
        .then((response) => response.data),
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Annual contract reviews</h1>
      <p className="text-sm text-muted-foreground">
        Same-space anniversaries create review records. Rent never changes automatically.
      </p>
      <div className="flex flex-wrap gap-3">
        <Input
          aria-label="Search reviews"
          placeholder="Unit, space, or primary tenant"
          value={q}
          onChange={(event) => {
            setQ(event.target.value);
            setPage(1);
          }}
        />
        <select
          aria-label="Review status"
          className="h-9 rounded-md border bg-background px-3"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          {['ALL', 'OPEN', 'REVIEWED', 'DEFERRED'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      {query.isPending || query.error ? (
        <QueryFeedback
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {query.data!.items.map((row) => (
              <li key={row.id} className="space-y-2 rounded-md border p-4">
                <Link className="break-words text-primary underline" to={'/reviews/' + row.id}>
                  {(row.rentalSpace ?? row.contract.rentalSpace).unit.name} /{' '}
                  {(row.rentalSpace ?? row.contract.rentalSpace).name}
                </Link>
                <p>
                  {row.contract.tenant.fullName} · {row.milestoneMonths ?? 'Historical'} months
                </p>
                <p>Review date: {date(row.dueAt)}</p>
                <Badge variant="outline">{decisionLabel(row.decision)}</Badge>
              </li>
            ))}
          </ul>
          {!query.data!.items.length && <p>No annual reviews match these filters.</p>}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span>
              Page {page} · {query.data!.total} reviews
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
    </div>
  );
}
export function ReviewDetail() {
  const { id } = useParams(),
    { user } = useAuth(),
    client = useQueryClient();
  const [decision, setDecision] = useState<string | null>(null),
    key = useRef(crypto.randomUUID()),
    version = useRef(0);
  const query = useQuery({
    queryKey: ['review', id],
    queryFn: ({ signal }) =>
      api.get<Review>('/reviews/' + id, { signal }).then((response) => response.data),
  });
  if (query.isPending || (query.error && !recoverableQueryError(query.error)) || !query.data)
    return (
      <QueryFeedback
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const row = query.data;
  return (
    <div className="space-y-5">
      <CachedQueryNotice error={query.error} onRetry={() => void query.refetch()} />
      <h1 className="text-2xl font-semibold">Annual contract review</h1>
      <p>
        {(row.rentalSpace ?? row.contract.rentalSpace).unit.name} /{' '}
        {(row.rentalSpace ?? row.contract.rentalSpace).name} · {row.contract.tenant.fullName}
      </p>
      <p>
        Review date: {date(row.dueAt)} · {row.milestoneMonths ?? 'Historical'} months in this space
      </p>
      <p>
        Current contract rent: {row.contract.currency} {row.contract.monthlyRent}
      </p>
      <p className="text-sm text-muted-foreground">
        A review or proposal never changes rent. Amendment effect and tenant acknowledgement require
        the approved contract policy.
      </p>
      <Badge variant="outline">{decisionLabel(row.decision)}</Badge>
      {row.deferredUntil && <p>Deferred review date: {date(row.deferredUntil)}</p>}
      {user?.role === 'LEASING_MANAGER' && !row.reviewedAt && (
        <div className="flex flex-wrap gap-3">
          {[
            ['NO_CHANGE', 'Reviewed / No Change'],
            ['PROPOSED_PRICE', 'Propose next-month rent'],
            ['DEFERRED', 'Defer review'],
          ].map(([value, label]) => (
            <Button
              key={value}
              variant="outline"
              onClick={() => {
                key.current = crypto.randomUUID();
                version.current = row.version;
                setDecision(value);
              }}
            >
              {label}
            </Button>
          ))}
        </div>
      )}
      <section className="space-y-3" aria-label="Review history">
        <h2 className="font-semibold">Review history</h2>
        {row.events.map((event) => (
          <article key={event.id} className="space-y-2 rounded-md border p-4">
            <p>
              {event.kind === 'REVIEW_DUE' ? 'Annual review is due' : decisionLabel(event.kind)} ·{' '}
              {event.actorName ?? 'System'}
            </p>
            <p className="whitespace-pre-wrap break-words">{event.note}</p>
            {event.proposedRent && (
              <p>
                Proposed rent: {event.currency} {event.proposedRent} · Effective month:{' '}
                {date(event.effectiveMonth!)} · Proposal only
              </p>
            )}
            {event.deferredUntil && <p>Deferred date: {date(event.deferredUntil)}</p>}
            <p className="text-sm text-muted-foreground">
              {new Date(event.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
              (Asia/Dubai)
            </p>
          </article>
        ))}
      </section>
      <Link className="text-primary underline" to={'/contracts/' + row.contractId}>
        View original contract
      </Link>
      {decision && (
        <RecordEditor
          open
          title={decisionLabel(decision)}
          onOpenChange={(open) => {
            if (!open) setDecision(null);
          }}
          fields={[
            {
              name: 'note',
              label: 'Shared review note',
              type: 'textarea',
              required: true,
              maxLength: 5000,
            },
            ...(decision === 'PROPOSED_PRICE'
              ? [
                  {
                    name: 'proposedRent',
                    label: 'Proposed monthly rent (' + row.contract.currency + ')',
                    type: 'number',
                    required: true,
                    min: 0.01,
                    max: 9999999999.99,
                    step: '0.01',
                  },
                ]
              : []),
            ...(decision === 'DEFERRED'
              ? [
                  {
                    name: 'deferredUntil',
                    label: 'Deferred review date (Asia/Dubai)',
                    type: 'date',
                    required: true,
                  },
                ]
              : []),
            {
              name: 'confirm',
              label: 'I confirm this review record; contract rent stays unchanged',
              type: 'checkbox',
              required: true,
            },
          ]}
          onSave={async (form) => {
            await api.post('/reviews/' + id + '/decision', {
              clientId: key.current,
              expectedVersion: version.current,
              decision,
              note: String(form.get('note')),
              ...(decision === 'PROPOSED_PRICE'
                ? { proposedRent: String(form.get('proposedRent')) }
                : {}),
              ...(decision === 'DEFERRED'
                ? { deferredUntil: String(form.get('deferredUntil')) }
                : {}),
            });
            await Promise.all([
              client.invalidateQueries({ queryKey: ['review', id] }),
              client.invalidateQueries({ queryKey: ['reviews'] }),
              client.invalidateQueries({ queryKey: ['notifications'] }),
            ]);
          }}
        />
      )}
    </div>
  );
}
