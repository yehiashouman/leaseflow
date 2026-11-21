import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { RecordEditor } from './record-editor';
import { QueryFeedback } from './query-feedback';
import { Documents } from './documents';
import { previewMode } from '../session';
import { caseDateWithZone } from '../cases';

const actionLabel = {
  ACKNOWLEDGE: 'Acknowledge receipt',
  REPORT_ERROR: 'Report a receipt error',
  REVERSE: 'Reverse receipt',
} as const;
const eventLabel: Record<string, string> = {
  ACKNOWLEDGE: 'Tenant acknowledged receipt',
  REPORT_ERROR: 'Tenant reported an error',
  REVERSE: 'Manager reversed receipt',
};
type ReceiptAction = keyof typeof actionLabel;
type Receipt = {
  id: string;
  amount: string;
  currency: string;
  paidAt: string;
  daysLate?: number;
  method: string;
  reference: string | null;
  recordedBalance: string;
  createdAt: string;
  payerName?: string | null;
  notes?: string | null;
  periodStart?: string;
  hasPaymentEvidence?: boolean;
  events?: { id: string; kind: string; reason: string | null; createdAt: string }[];
};
export function PaymentReceipts({
  paymentId,
  currency,
  initialOpen = false,
}: {
  paymentId: string;
  currency: string;
  initialOpen?: boolean;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(initialOpen),
    [editor, setEditor] = useState(false),
    [page, setPage] = useState(1);
  const [command, setCommand] = useState<{
    action: ReceiptAction;
    receiptId: string;
    key: string;
  } | null>(null);
  const key = useRef(crypto.randomUUID()),
    client = useQueryClient();
  const query = useQuery({
    queryKey: ['payment-receipts', paymentId, page],
    enabled: open,
    queryFn: ({ signal }) =>
      api
        .get<{
          items: Receipt[];
          total: number;
          pageSize: number;
          recordEnabled: boolean;
          basis: string;
        }>('/payments/' + paymentId + '/receipts', { params: { page }, signal })
        .then((response) => response.data),
  });
  const refresh = () =>
    Promise.all(
      [['payment-receipts', paymentId], ['contract-records'], ['dashboard'], ['cash-report']].map(
        (queryKey) => client.invalidateQueries({ queryKey }),
      ),
    );
  const date = (value: string) =>
    new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }) + ' (Asia/Dubai)';
  return (
    <div className="space-y-3 border-t pt-3">
      <Button variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? 'Hide payment receipts' : 'View payment receipts'}
      </Button>
      {open && (
        <section aria-label="External payment receipts" className="space-y-3">
          {query.isPending || query.error ? (
            <QueryFeedback
              pending={query.isPending}
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{query.data!.basis}</p>
              {query.data!.items.map((receipt) => (
                <article key={receipt.id} className="space-y-1 rounded-md border p-3 text-sm">
                  <p>
                    {receipt.currency} {receipt.amount} · {receipt.method}
                  </p>
                  {receipt.reference && <p className="break-words">{receipt.reference}</p>}
                  <div className="flex flex-wrap items-center gap-2">
                    <p>External payment date: {date(receipt.paidAt)}</p>
                    {typeof receipt.daysLate === 'number' && receipt.daysLate > 0 && (
                      <Badge variant="destructive">
                        {receipt.daysLate} {receipt.daysLate === 1 ? 'day' : 'days'} late
                      </Badge>
                    )}
                  </div>
                  {receipt.payerName && <p>Payer: {receipt.payerName}</p>}
                  {receipt.periodStart && (
                    <p>Rent period (Dubai): {receipt.periodStart.slice(0, 7)}</p>
                  )}
                  {receipt.hasPaymentEvidence !== undefined && (
                    <p>
                      {receipt.hasPaymentEvidence
                        ? 'Verified evidence on the rent obligation'
                        : 'No verified evidence on the rent obligation'}
                    </p>
                  )}
                  {receipt.notes && (
                    <p className="whitespace-pre-wrap break-words">{receipt.notes}</p>
                  )}
                  <p>Recorded: {date(receipt.createdAt)}</p>
                  <p>
                    Recorded paid total after this receipt: {receipt.currency}{' '}
                    {receipt.recordedBalance}
                  </p>
                  {receipt.events?.map((event) => (
                    <div key={event.id} className="border-t pt-2">
                      <p>
                        {eventLabel[event.kind] ?? event.kind} · {caseDateWithZone(event.createdAt)}
                      </p>
                      {event.reason && (
                        <p className="whitespace-pre-wrap break-words">{event.reason}</p>
                      )}
                    </div>
                  ))}
                  {!previewMode && !receipt.events?.some(({ kind }) => kind === 'REVERSE') && (
                    <div className="flex flex-wrap gap-2">
                      {(user?.role === 'TENANT'
                        ? (['ACKNOWLEDGE', 'REPORT_ERROR'] as const)
                        : query.data?.recordEnabled
                          ? (['REVERSE'] as const)
                          : []
                      )
                        .filter((action) => !receipt.events?.some(({ kind }) => kind === action))
                        .map((action) => (
                          <Button
                            key={action}
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setCommand({
                                action,
                                receiptId: receipt.id,
                                key: crypto.randomUUID(),
                              })
                            }
                          >
                            {actionLabel[action]}
                          </Button>
                        ))}
                    </div>
                  )}
                </article>
              ))}
              {!query.data!.items.length && <p>No individual receipt records.</p>}
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous receipts
                </Button>
                <span>
                  Page {page} · {query.data!.total} receipts
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page * query.data!.pageSize >= query.data!.total}
                  onClick={() => setPage(page + 1)}
                >
                  Next receipts
                </Button>
              </div>
              {user?.role === 'LEASING_MANAGER' && query.data!.recordEnabled && (
                <Button
                  size="sm"
                  onClick={() => {
                    key.current = crypto.randomUUID();
                    setEditor(true);
                  }}
                >
                  Record external rent payment
                </Button>
              )}
              {!query.data!.recordEnabled && (
                <p className="text-sm text-muted-foreground">
                  Payment records require the live development API or approved production policies.
                </p>
              )}
              <Documents
                purpose="PAYMENT_EVIDENCE"
                targetId={paymentId}
                heading="Payment evidence"
                readOnly={user?.role !== 'LEASING_MANAGER'}
              />
            </>
          )}
        </section>
      )}
      {command && (
        <RecordEditor
          open
          title={actionLabel[command.action]}
          onOpenChange={(visible) => {
            if (!visible) setCommand(null);
          }}
          fields={
            command.action === 'ACKNOWLEDGE'
              ? []
              : [
                  {
                    name: 'reason',
                    label: 'Reason',
                    type: 'textarea',
                    maxLength: 3000,
                    required: true,
                  },
                ]
          }
          onSave={async (form) => {
            await api.post(
              '/payments/' + paymentId + '/receipts/' + command.receiptId + '/events',
              {
                action: command.action,
                clientId: command.key,
                ...(command.action === 'ACKNOWLEDGE' ? {} : { reason: String(form.get('reason')) }),
              },
            );
            await refresh();
          }}
        />
      )}
      {editor && (
        <RecordEditor
          open
          title="Record external rent payment"
          onOpenChange={setEditor}
          fields={[
            {
              name: 'amountPaid',
              label: 'Amount (' + currency + ')',
              type: 'number',
              min: 0.01,
              max: 9999999999.99,
              step: '0.01',
              required: true,
            },
            {
              name: 'paidAt',
              label: 'External payment date and time (UTC)',
              type: 'datetime-local',
              required: true,
            },
            { name: 'method', label: 'Payment method', required: true, maxLength: 50 },
            { name: 'reference', label: 'Payment reference', maxLength: 150 },
            ...(!previewMode
              ? [
                  {
                    name: 'payerName',
                    label: 'Payer name (defaults to primary tenant)',
                    maxLength: 150,
                  },
                  {
                    name: 'notes',
                    label: 'Payment notes',
                    type: 'textarea' as const,
                    maxLength: 3000,
                  },
                ]
              : []),
            {
              name: 'confirm',
              label: 'I confirm this external rent payment already happened',
              type: 'checkbox',
              required: true,
            },
          ]}
          onSave={async (form) => {
            if (!form.has('confirm')) throw new Error('Confirm the external payment.');
            await api.post('/payments/' + paymentId + '/record', {
              clientId: key.current,
              amountPaid: String(form.get('amountPaid')),
              paidAt: new Date(String(form.get('paidAt')) + 'Z').toISOString(),
              method: String(form.get('method')),
              reference: String(form.get('reference') ?? '').trim() || null,
              ...(form.get('payerName') ? { payerName: String(form.get('payerName')) } : {}),
              ...(form.get('notes') ? { notes: String(form.get('notes')) } : {}),
            });
            await refresh();
          }}
        />
      )}
    </div>
  );
}
