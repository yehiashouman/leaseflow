import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { CaseRecord } from '../cases';
import { Button } from './ui/button';
import { RecordEditor } from './record-editor';

type Decision = { assigned: boolean; clientId: string; expectedVersion: number };
export function CaseAssignment({ data }: { data: CaseRecord }) {
  const client = useQueryClient();
  const [decision, setDecision] = useState<Decision | null>(null);
  function start(assigned: boolean) {
    setDecision({ assigned, clientId: crypto.randomUUID(), expectedVersion: data.version });
  }
  return (
    <section className="space-y-3 rounded-md border p-4" aria-labelledby="case-assignment">
      <h2 id="case-assignment" className="font-semibold">
        Case assignment
      </h2>
      <p>{data.assignment ? (data.assignment.managerName ?? 'Leasing manager') : 'Unassigned'}</p>
      {data.canManageAssignment && (
        <div className="flex flex-wrap gap-2">
          {!data.assignment?.isMine && (
            <Button variant="outline" size="sm" onClick={() => start(true)}>
              Assign to me
            </Button>
          )}
          {data.assignment && (
            <Button variant="outline" size="sm" onClick={() => start(false)}>
              Clear assignment
            </Button>
          )}
        </div>
      )}
      {decision && (
        <RecordEditor
          open
          onOpenChange={(open) => {
            if (!open) setDecision(null);
          }}
          title={decision.assigned ? 'Assign case to yourself' : 'Clear case assignment'}
          fields={[{ name: 'reason', label: 'Reason', required: true, maxLength: 1000 }]}
          onSave={async (form) => {
            try {
              await client.cancelQueries({ queryKey: ['request', data.id] });
              const updated = await api.post<CaseRecord>('/requests/' + data.id + '/assignment', {
                ...decision,
                reason: form.get('reason'),
              });
              client.setQueryData(['request', data.id], updated.data);
              await client.invalidateQueries({ queryKey: ['requests'] });
            } catch (cause) {
              if (isAxiosError(cause) && cause.response?.status === 409)
                void client.invalidateQueries({ queryKey: ['request', data.id] });
              throw cause;
            }
          }}
        />
      )}
    </section>
  );
}
