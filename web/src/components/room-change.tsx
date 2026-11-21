import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { caseDateWithZone, type CaseRecord } from '../cases';
import { Button } from './ui/button';
import { QueryFeedback } from './query-feedback';
import { RecordEditor } from './record-editor';

const labels = {
  APPROVE: 'Approve room change',
  REJECT: 'Reject room change',
  WITHDRAW: 'Withdraw room change',
  CANCEL: 'Cancel room change',
  EXTEND: 'Extend negotiation by seven days',
  VIEWING: 'Record viewing or discussion outcome',
} as const;
type Action = keyof typeof labels;
const path = (contractId: string) =>
  '/contracts/' + encodeURIComponent(contractId) + '/room-change';
export function SubmitRoomChange({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const key = useRef('');
  const client = useQueryClient();
  const navigate = useNavigate();
  const url = path(contractId);
  const query = useQuery({
    queryKey: ['room-change', contractId],
    enabled: open,
    queryFn: ({ signal }) =>
      api
        .get<{ pendingId: string | null; nextApprovalAt: string | null }>(url, { signal })
        .then(({ data }) => data),
  });
  if (!open)
    return (
      <Button
        variant="outline"
        onClick={() => {
          key.current = crypto.randomUUID();
          setOpen(true);
        }}
      >
        Request room change
      </Button>
    );
  if (!query.data || query.error || query.data.pendingId || query.data.nextApprovalAt)
    return (
      <section className="space-y-2 rounded-md border p-4">
        <h2 className="font-semibold">Room change</h2>
        <QueryFeedback
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
        {query.data?.pendingId && (
          <Link className="text-primary underline" to={'/requests/' + query.data.pendingId}>
            View open room-change request
          </Link>
        )}
        {query.data?.nextApprovalAt && (
          <p>Next eligible date: {caseDateWithZone(query.data.nextApprovalAt)}</p>
        )}
        <Button variant="outline" onClick={() => setOpen(false)}>
          Close
        </Button>
      </section>
    );
  return (
    <RecordEditor
      open
      onOpenChange={setOpen}
      title="Request room change"
      notice={
        <p>
          The manager has five calendar days to decide. Approval starts a seven-day negotiation
          period.
        </p>
      }
      fields={[
        { name: 'explanation', label: 'Reason', type: 'textarea', required: true, maxLength: 5000 },
        {
          name: 'preferences',
          label: 'Destination preferences (optional)',
          type: 'textarea',
          maxLength: 3000,
        },
      ]}
      onSave={async (form) => {
        const { data } = await api.post<{ requestId: string }>(url, {
          clientId: key.current,
          explanation: String(form.get('explanation')),
          preferences: String(form.get('preferences') ?? ''),
        });
        await Promise.all(
          [['room-change', contractId], ['requests'], ['dashboard'], ['notifications']].map(
            (queryKey) => client.invalidateQueries({ queryKey }),
          ),
        );
        navigate('/requests/' + data.requestId);
      }}
    />
  );
}
export function RoomChangeDetail({ record }: { record: CaseRecord }) {
  const client = useQueryClient();
  const { user } = useAuth();
  const [command, setCommand] = useState<{ action: Action; version: number; key: string } | null>(
    null,
  );
  const snapshot = record.metadata?.roomChange;
  if (!snapshot) return null;
  const active = record.decisionDueAt && new Date(record.decisionDueAt).getTime() > Date.now();
  const approved = record.status === 'APPROVED';
  const manager = user?.role === 'LEASING_MANAGER';
  const actions: Action[] = !active
    ? []
    : approved
      ? manager
        ? ['VIEWING', 'CANCEL', ...(snapshot.extended ? [] : ['EXTEND' as const])]
        : ['VIEWING', 'WITHDRAW']
      : ['SUBMITTED', 'SEEN', 'AWAITING_MANAGER', 'REOPENED'].includes(record.status)
        ? manager
          ? ['APPROVE', 'REJECT']
          : ['WITHDRAW']
        : [];
  return (
    <section className="space-y-3 rounded-md border p-4">
      <h2 className="font-semibold">Room-change terms</h2>
      {snapshot.preferences && (
        <p className="whitespace-pre-wrap break-words">{snapshot.preferences}</p>
      )}
      {snapshot.approvedAt && <p>Approved: {caseDateWithZone(snapshot.approvedAt)}</p>}
      {record.decisionDueAt && (
        <p>
          {approved ? 'Negotiation deadline: ' : 'Approval deadline: '}
          {caseDateWithZone(record.decisionDueAt)}
        </p>
      )}
      {snapshot.extended && <p>The manager used the available extension.</p>}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant="outline"
            onClick={() =>
              setCommand({
                action,
                version: record.version,
                key: crypto.randomUUID(),
              })
            }
          >
            {labels[action]}
          </Button>
        ))}
      </div>
      {command && (
        <RecordEditor
          open
          onOpenChange={(visible) => {
            if (!visible) setCommand(null);
          }}
          title={labels[command.action]}
          fields={[
            {
              name: 'explanation',
              label: 'Explanation',
              type: 'textarea',
              required: true,
              maxLength: 3000,
            },
          ]}
          onSave={async (form) => {
            await api.post(
              path(record.contractId) + '/' + encodeURIComponent(record.id) + '/commands',
              {
                clientId: command.key,
                expectedVersion: command.version,
                action: command.action,
                explanation: String(form.get('explanation')),
              },
            );
            await Promise.all(
              [
                ['request', record.id],
                ['requests'],
                ['dashboard'],
                ['room-change', record.contractId],
                ['notifications'],
              ].map((queryKey) => client.invalidateQueries({ queryKey })),
            );
          }}
        />
      )}
    </section>
  );
}
