import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CaseRecord } from '../cases';
import { Button } from './ui/button';
import { RecordEditor } from './record-editor';

export function MoveOutResponse({ record }: { record: CaseRecord }) {
  const [open, setOpen] = useState(false);
  const key = useRef('');
  const version = useRef(0);
  const client = useQueryClient();
  const notice = record.metadata?.moveOut;
  const response = record.metadata?.moveOutResponse;
  if (!notice) return null;
  const contract = '/contracts/' + encodeURIComponent(record.contractId);
  if (response)
    return (
      <section className="space-y-2 rounded-md border p-4">
        <h2 className="font-semibold">Manager response</h2>
        <p>
          {Number(response.amount) > 0
            ? 'Proposed notice deduction: ' + response.currency + ' ' + response.amount
            : 'No notice deduction proposed.'}
        </p>
        <p className="whitespace-pre-wrap break-words">{response.explanation}</p>
        {response.proposalId && (
          <Link className="text-primary underline" to={contract + '?section=deposits'}>
            View notice deduction in the deposit ledger
          </Link>
        )}
      </section>
    );
  if (!record.canRespondMoveOut) return null;
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          key.current = crypto.randomUUID();
          version.current = record.version;
          setOpen(true);
        }}
      >
        Respond to notice
      </Button>
      {open && (
        <RecordEditor
          open
          onOpenChange={setOpen}
          title="Respond to move-out notice"
          notice={
            <p>Enter zero to waive the deduction. Positive amounts require tenant acceptance.</p>
          }
          fields={[
            {
              name: 'amount',
              label: 'Notice deduction (' + notice.currency + ')',
              type: 'number',
              min: 0,
              max: Number(notice.proposedDeduction),
              step: '0.01',
              value: notice.proposedDeduction,
              required: true,
            },
            {
              name: 'explanation',
              label: 'Reason',
              type: 'textarea',
              required: true,
              maxLength: 3000,
            },
          ]}
          onSave={async (form) => {
            await api.post(contract + '/move-out/' + encodeURIComponent(record.id) + '/response', {
              clientId: key.current,
              expectedVersion: version.current,
              amount: String(form.get('amount')),
              explanation: String(form.get('explanation')),
            });
            await Promise.all(
              [
                ['request', record.id],
                ['requests'],
                ['dashboard'],
                ['deposit', record.contractId],
                ['contract-records', record.contractId],
              ].map((queryKey) => client.invalidateQueries({ queryKey })),
            );
          }}
        />
      )}
    </>
  );
}
