import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { caseDate, maintenanceLabels, type CaseRecord } from '../cases';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RecordEditor, type EditorField } from './record-editor';

type Command = {
  version: number;
  clientId: string;
  decision?: 'ACCEPTED' | 'DISPUTED';
  assessmentId?: string;
};
export function MaintenanceAssessment({ data }: { data: CaseRecord }) {
  const client = useQueryClient();
  const [command, setCommand] = useState<Command | null>(null);
  const [lastInput, setLastInput] = useState('');
  const [replayKey, setReplayKey] = useState('');
  if (data.type !== 'MAINTENANCE') return null;
  const rows = data.maintenanceAssessments ?? [];
  const latest = rows.at(-1);
  const fields: EditorField[] = command?.decision
    ? [
        {
          name: 'explanation',
          label: 'Response explanation',
          type: 'textarea',
          required: true,
          maxLength: 5000,
        },
      ]
    : [
        {
          name: 'classification',
          label: 'Responsibility',
          value: 'UNDER_REVIEW',
          options: Object.entries(maintenanceLabels).map(([value, label]) => ({ value, label })),
        },
        {
          name: 'proposedAmount',
          label: 'Proposed tenant cost',
          type: 'number',
          min: 0.01,
          max: 9999999999.99,
          step: '0.01',
        },
        {
          name: 'explanation',
          label: 'Explanation',
          type: 'textarea',
          required: true,
          maxLength: 5000,
        },
        { name: 'evidenceNotes', label: 'Evidence notes', type: 'textarea', maxLength: 5000 },
      ];
  function open(decision?: 'ACCEPTED' | 'DISPUTED') {
    const clientId = crypto.randomUUID();
    setLastInput('');
    setReplayKey(clientId);
    setCommand({
      version: data.version,
      clientId,
      decision,
      assessmentId: decision ? latest?.id : undefined,
    });
  }
  async function save(form: FormData) {
    if (!command) return;
    const payload = command.decision
      ? { decision: command.decision, explanation: String(form.get('explanation')).trim() }
      : {
          classification: String(form.get('classification')),
          proposedAmount: String(form.get('proposedAmount') ?? '').trim() || null,
          explanation: String(form.get('explanation')).trim(),
          evidenceNotes: String(form.get('evidenceNotes') ?? '').trim(),
        };
    const signature = JSON.stringify(payload);
    const clientId = lastInput && lastInput !== signature ? crypto.randomUUID() : replayKey;
    setLastInput(signature);
    setReplayKey(clientId);
    try {
      await client.cancelQueries({ queryKey: ['request', data.id] });
      const path =
        `/requests/${data.id}/maintenance` +
        (command.decision ? `/${command.assessmentId}/respond` : '');
      const response = await api.post<CaseRecord>(path, {
        ...payload,
        expectedVersion: command.version,
        clientId,
      });
      client.setQueryData(['request', data.id], response.data);
      await client.invalidateQueries({ queryKey: ['requests'] });
      await client.invalidateQueries({ queryKey: ['notifications'] });
    } catch (cause) {
      if (isAxiosError(cause) && cause.response?.status === 409)
        await client.invalidateQueries({ queryKey: ['request', data.id] });
      throw cause;
    }
  }
  return (
    <section className="space-y-4 border-t pt-5" aria-labelledby="maintenance-responsibility">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="maintenance-responsibility" className="text-lg font-semibold">
          Maintenance responsibility
        </h2>
        {data.canAssessMaintenance && (
          <Button variant="outline" onClick={() => open()}>
            Record responsibility
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">Operational owner: Leasing Manager</p>
      {!rows.length && <p className="text-sm text-muted-foreground">No assessment</p>}
      <ul className="divide-y">
        {[...rows].reverse().map((row) => (
          <li key={row.id} className="space-y-2 break-words py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">
                {maintenanceLabels[row.classification] ?? row.classification}
              </h3>
              <Badge variant={row.id === latest?.id ? 'secondary' : 'outline'}>
                {row.id === latest?.id ? 'Current' : 'Previous'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Version {row.caseVersion} · {caseDate(row.createdAt)}
            </p>
            {row.proposedAmount !== null && (
              <p className="font-medium">
                Proposed tenant cost: {row.currency} {row.proposedAmount}
              </p>
            )}
            <p className="whitespace-pre-wrap">{row.explanation}</p>
            {row.evidenceNotes && (
              <div>
                <h4 className="text-sm font-medium">Evidence notes</h4>
                <p className="whitespace-pre-wrap">{row.evidenceNotes}</p>
              </div>
            )}
            {row.classification === 'TENANT_COST' && (
              <Badge variant={row.decision === 'DISPUTED' ? 'destructive' : 'outline'}>
                {row.decision === 'ACCEPTED'
                  ? 'Cost accepted'
                  : row.decision === 'DISPUTED'
                    ? 'Cost disputed'
                    : row.id === latest?.id
                      ? 'Await tenant response'
                      : 'Superseded'}
              </Badge>
            )}
            {row.responseExplanation && (
              <p className="whitespace-pre-wrap">Tenant response: {row.responseExplanation}</p>
            )}
            {row.respondedAt && (
              <p className="text-xs text-muted-foreground">{caseDate(row.respondedAt)}</p>
            )}
            {row.id === latest?.id && data.canRespondMaintenance && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => open('ACCEPTED')}>
                  Accept proposed cost
                </Button>
                <Button variant="outline" onClick={() => open('DISPUTED')}>
                  Dispute proposed cost
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!!rows.length && (
        <p className="text-sm text-muted-foreground">
          Cost responsibility is separate from repair completion. No charge or deposit deduction
          exists from this workflow.
        </p>
      )}
      <RecordEditor
        open={Boolean(command)}
        onOpenChange={(value) => {
          if (!value) setCommand(null);
        }}
        title={
          command?.decision === 'ACCEPTED'
            ? 'Accept proposed cost'
            : command?.decision === 'DISPUTED'
              ? 'Dispute proposed cost'
              : 'Record maintenance responsibility'
        }
        fields={fields}
        onSave={save}
      />
    </section>
  );
}
