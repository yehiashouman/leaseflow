import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { caseDateWithZone } from '../cases';
import { Documents } from './documents';
import { QueryFeedback } from './query-feedback';
import { RecordEditor, type EditorField } from './record-editor';
import { Button } from './ui/button';

type Action =
  | 'RECEIVE'
  | 'REFUND'
  | 'PROPOSE'
  | 'REVISE'
  | 'ACCEPT'
  | 'DISPUTE'
  | 'DEADLOCK'
  | 'MESSAGE'
  | 'ACKNOWLEDGE_REFUND';
const labels: Record<Action, string> = {
  RECEIVE: 'Record deposit receipt',
  REFUND: 'Record deposit refund',
  PROPOSE: 'Propose deduction',
  REVISE: 'Revise proposal',
  ACCEPT: 'Accept deduction',
  DISPUTE: 'Dispute deduction',
  DEADLOCK: 'Mark external resolution required',
  MESSAGE: 'Add discussion note',
  ACKNOWLEDGE_REFUND: 'Acknowledge refund',
};
const categories = [
  { value: 'NOTICE', label: 'Insufficient notice' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'MISSING_ITEM_OR_KEY', label: 'Missing item or key' },
  { value: 'EXCEPTIONAL_CLEANING', label: 'Exceptional cleaning' },
  { value: 'OTHER', label: 'Other documented charge' },
];
type Entry = {
  id: string;
  type: string;
  amount: string;
  recordedAt: string | null;
  createdAt: string;
  method: string | null;
  reference: string | null;
  description: string | null;
  tenantDisputedAt: string | null;
  tenantAcceptedAt: string | null;
  proposal?: { amount: string; category: string | null; status: string };
  allowedActions: Action[];
  events: {
    id: string;
    action: Action;
    actorRole: string;
    sequence: number;
    message: string | null;
    amount: string | null;
    category: string | null;
    createdAt: string;
  }[];
};
type Ledger = {
  currency: string;
  required: string;
  total: number;
  pageSize: number;
  canReceive: boolean;
  canPropose: boolean;
  canRefund: boolean;
  items: Entry[];
  balance: {
    status: string;
    held: string;
    outstanding: string;
    refundable: string;
    refunded: string;
    reserved: string;
  };
};
const categoryLabel = (value: string) =>
  categories.find((row) => row.value === value)?.label ?? value;

export function DepositLedger({ contractId }: { contractId: string }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ action: Action; entry?: Entry } | null>(null);
  const key = useRef('');
  const client = useQueryClient();
  const path = '/contracts/' + encodeURIComponent(contractId) + '/deposit';
  const query = useQuery({
    queryKey: ['deposit', contractId, page],
    queryFn: ({ signal }) =>
      api.get<Ledger>(path, { params: { page }, signal }).then((r) => r.data),
  });
  if (!query.data || query.isPending || query.error)
    return (
      <QueryFeedback
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const { balance, currency, required, canReceive, canPropose, canRefund, items, total, pageSize } =
    query.data;
  const open = (action: Action, entry?: Entry) => {
    key.current = crypto.randomUUID();
    setSelected({ action, entry });
  };
  const amountText = (value: string) =>
    currency +
    ' ' +
    Number(value).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cash = selected?.action === 'RECEIVE' || selected?.action === 'REFUND';
  const proposal = selected?.action === 'PROPOSE' || selected?.action === 'REVISE';
  const needsMessage =
    proposal ||
    selected?.action === 'DISPUTE' ||
    selected?.action === 'DEADLOCK' ||
    selected?.action === 'MESSAGE';
  const fields: EditorField[] = [
    ...(cash || proposal
      ? [
          {
            name: 'amount',
            label: 'Amount (' + currency + ')',
            required: true,
            type: 'number',
            min: 0.01,
            step: '0.01',
            max: 9999999999.99,
            value: selected?.entry?.proposal?.amount,
          },
        ]
      : []),
    ...(cash
      ? [
          { name: 'date', label: 'External payment date (Dubai)', required: true, type: 'date' },
          { name: 'method', label: 'Payment method', required: true, maxLength: 60 },
          { name: 'reference', label: 'Payment reference', maxLength: 150 },
        ]
      : []),
    ...(proposal
      ? [
          {
            name: 'category',
            label: 'Category',
            required: true,
            options: categories,
            value: selected?.entry?.proposal?.category ?? undefined,
          },
        ]
      : []),
    ...(cash || needsMessage
      ? [
          {
            name: 'message',
            label: cash ? 'Notes' : 'Explanation',
            type: 'textarea',
            required: needsMessage,
            maxLength: 3000,
          },
        ]
      : []),
  ];
  return (
    <section className="space-y-5" aria-label="Deposit ledger">
      <h2 className="text-lg font-semibold">Deposit entries</h2>
      <p className="font-medium">
        {balance.status === 'RECONCILIATION_REQUIRED'
          ? 'Legacy entries require reconciliation'
          : balance.status.replaceAll('_', ' ')}
      </p>
      <dl className="grid grid-cols-2 gap-4">
        {[
          ['Required deposit', required],
          ['Outstanding deposit', balance.outstanding],
          ['Held after accepted deductions and refunds', balance.held],
          ['Refund available', balance.refundable],
          ['Pending or disputed deductions', balance.reserved],
          ['Refunded', balance.refunded],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd>{amountText(value!)}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {canReceive && <Button onClick={() => open('RECEIVE')}>{labels.RECEIVE}</Button>}
        {canPropose && (
          <Button variant="outline" onClick={() => open('PROPOSE')}>
            {labels.PROPOSE}
          </Button>
        )}
        {canRefund && (
          <Button variant="outline" onClick={() => open('REFUND')}>
            {labels.REFUND}
          </Button>
        )}
      </div>
      {!items.length && <p className="text-muted-foreground">No records</p>}
      {items.map((entry) => (
        <article className="space-y-2 rounded-md border p-4" key={entry.id}>
          <h3 className="font-semibold">
            {entry.type.replaceAll('_', ' ')} · {amountText(entry.proposal?.amount ?? entry.amount)}
          </h3>
          {entry.proposal?.category && <p>{categoryLabel(entry.proposal.category)}</p>}
          {entry.proposal?.status === 'DEADLOCK' && <p>External resolution required</p>}
          <p>
            {caseDateWithZone(entry.recordedAt ?? entry.createdAt)}
            {entry.method ? ' · ' + entry.method : ''}
          </p>
          {entry.reference && <p>{entry.reference}</p>}
          {entry.description && (
            <p className="whitespace-pre-wrap break-words">{entry.description}</p>
          )}
          {entry.tenantDisputedAt && (
            <p>Dispute recorded: {caseDateWithZone(entry.tenantDisputedAt)}</p>
          )}
          {entry.tenantAcceptedAt && (
            <p>Acceptance recorded: {caseDateWithZone(entry.tenantAcceptedAt)}</p>
          )}
          {!!entry.events.length && (
            <ol className="space-y-2 border-l pl-3">
              {entry.events.map((event) => (
                <li key={event.id} className="text-sm break-words">
                  <p>
                    {labels[event.action]} · {event.actorRole.replaceAll('_', ' ')} ·{' '}
                    {caseDateWithZone(event.createdAt)}
                  </p>
                  {event.amount && (
                    <p>
                      {amountText(event.amount)}
                      {event.category ? ' · ' + categoryLabel(event.category) : ''}
                    </p>
                  )}
                  {event.message && event.message !== entry.description && (
                    <p className="whitespace-pre-wrap">{event.message}</p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {entry.type !== 'DEDUCTION_ACCEPTED' && (
            <details>
              <summary className="cursor-pointer text-sm">Private evidence</summary>
              <Documents
                purpose="DEPOSIT_EVIDENCE"
                targetId={entry.id}
                heading="Deposit evidence"
              />
            </details>
          )}
          <div className="flex flex-wrap gap-2">
            {entry.allowedActions.map((action) => (
              <Button key={action} variant="outline" onClick={() => open(action, entry)}>
                {labels[action]}
              </Button>
            ))}
          </div>
        </article>
      ))}
      {total > pageSize && (
        <div className="flex gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={page * pageSize >= total}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
      {selected && (
        <RecordEditor
          open
          title={labels[selected.action]}
          fields={fields}
          notice={
            selected.action === 'ACCEPT' && selected.entry?.proposal ? (
              <p>Accept the deduction of {amountText(selected.entry.proposal.amount)}.</p>
            ) : undefined
          }
          onOpenChange={(visible) => {
            if (!visible) setSelected(null);
          }}
          onSave={async (form) => {
            const note = String(form.get('message') ?? '').trim();
            await api.post(path + '/commands', {
              clientId: key.current,
              action: selected.action,
              ...(selected.entry
                ? {
                    entryId: selected.entry.id,
                    expectedSequence: selected.entry.events.at(-1)?.sequence,
                  }
                : {}),
              ...(cash || proposal ? { amount: String(form.get('amount')) } : {}),
              ...(proposal ? { category: form.get('category') } : {}),
              ...(cash
                ? {
                    method: form.get('method'),
                    reference: form.get('reference') || null,
                    recordedAt: String(form.get('date')) + 'T00:00:00+04:00',
                  }
                : {}),
              ...(note ? { message: note } : {}),
            });
            await Promise.all([
              client.invalidateQueries({ queryKey: ['deposit', contractId] }),
              client.invalidateQueries({ queryKey: ['dashboard'] }),
            ]);
            setSelected(null);
          }}
        />
      )}
    </section>
  );
}
