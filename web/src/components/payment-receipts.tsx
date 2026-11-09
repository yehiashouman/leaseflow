import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { useAuth } from '../auth';
import { Button } from './ui/button';
import { RecordEditor } from './record-editor';
import { QueryFeedback } from './query-feedback';
import { Documents } from './documents';

type Receipt = {
  id: string;
  amount: string;
  currency: string;
  paidAt: string;
  method: string;
  reference: string | null;
  recordedBalance: string;
  createdAt: string;
};
export function PaymentReceipts({ paymentId, currency }: { paymentId: string; currency: string }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false),
    [editor, setEditor] = useState(false),
    [page, setPage] = useState(1);
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
            <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{query.data!.basis}</p>
              {query.data!.items.map((receipt) => (
                <article key={receipt.id} className="space-y-1 rounded-md border p-3 text-sm">
                  <p>
                    {receipt.currency} {receipt.amount} · {receipt.method}
                  </p>
                  {receipt.reference && <p className="break-words">{receipt.reference}</p>}
                  <p>External payment date: {date(receipt.paidAt)}</p>
                  <p>Recorded: {date(receipt.createdAt)}</p>
                  <p>
                    Recorded paid total after this receipt: {receipt.currency}{' '}
                    {receipt.recordedBalance}
                  </p>
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
            });
            await Promise.all([
              client.invalidateQueries({ queryKey: ['payment-receipts', paymentId] }),
              client.invalidateQueries({ queryKey: ['contract-records'] }),
              client.invalidateQueries({ queryKey: ['dashboard'] }),
            ]);
          }}
        />
      )}
    </div>
  );
}
