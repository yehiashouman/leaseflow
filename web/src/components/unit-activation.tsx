import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { QueryFeedback } from './query-feedback';
import { RecordEditor } from './record-editor';

type ActivationDocument = { id: string; title: string; purpose: 'PROPERTY_DOCUMENT' | 'CONSENT' };

export function UnitActivation({ id, onClose }: { id: string; onClose: () => void }) {
  const client = useQueryClient();
  const path = '/inventory/units/' + id;
  const query = useQuery({
    queryKey: ['unit-activation', id],
    queryFn: ({ signal }) =>
      api
        .get<{ documents: ActivationDocument[] }>(path + '/activation', { signal })
        .then((response) => response.data),
  });
  const choices = (purpose: ActivationDocument['purpose']) =>
    (query.data?.documents ?? [])
      .filter((document) => document.purpose === purpose)
      .map((document) => ({ value: document.id, label: document.title }));
  const proof = choices('PROPERTY_DOCUMENT');
  return (
    <RecordEditor
      open
      title="Activate unit"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      notice={
        query.isPending || query.error ? (
          <QueryFeedback
            pending={query.isPending}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        ) : !proof.length ? (
          <p className="text-sm text-muted-foreground">
            Upload current proof under Property documents and wait for the scan before activation.
          </p>
        ) : undefined
      }
      fields={[
        {
          name: 'proofKind',
          label: 'Proof type',
          required: true,
          options: [
            { value: '', label: 'Select proof type' },
            { value: 'OWNERSHIP', label: 'Proof of ownership' },
            { value: 'TENANCY', label: 'Tenancy contract' },
          ],
        },
        {
          name: 'proofId',
          label: 'Proof of ownership or tenancy',
          required: true,
          options: [{ value: '', label: 'Select a document' }, ...proof],
        },
        {
          name: 'consentRequired',
          label: 'Does this unit require written landlord consent?',
          required: true,
          options: [
            { value: '', label: 'Select yes or no' },
            { value: 'YES', label: 'Yes' },
            { value: 'NO', label: 'No' },
          ],
        },
        {
          name: 'consentId',
          label: 'Written landlord consent (if required)',
          options: [{ value: '', label: 'Select a document if required' }, ...choices('CONSENT')],
        },
        {
          name: 'declarationAccepted',
          label: 'I confirm this evidence is current and I am authorized to let this unit',
          type: 'checkbox',
          required: true,
        },
      ]}
      onSave={async (form) => {
        const consentId = String(form.get('consentId') || '');
        await api.post(path + '/activate', {
          proofKind: form.get('proofKind'),
          proofId: form.get('proofId'),
          consentRequired: form.get('consentRequired') === 'YES',
          ...(consentId ? { consentId } : {}),
          declarationAccepted: form.has('declarationAccepted'),
        });
        await Promise.all([
          client.invalidateQueries({ queryKey: ['unit', id] }),
          client.invalidateQueries({ queryKey: ['units'] }),
          client.invalidateQueries({ queryKey: ['dashboard'] }),
          client.invalidateQueries({ queryKey: ['contract-options'] }),
        ]);
      }}
    />
  );
}
