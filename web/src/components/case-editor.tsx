import { useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { caseTypes, type CaseContract, type CaseRecord } from '../cases';
import { RecordEditor } from './record-editor';
import { QueryFeedback } from './query-feedback';
import { Button } from './ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';

export function CaseEditor({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const client = useQueryClient();
  const key = useRef(crypto.randomUUID());
  const options = useQuery({
    queryKey: ['case-options'],
    queryFn: ({ signal }) =>
      api
        .get<{ types: string[]; contracts: CaseContract[] }>('/requests/options', { signal })
        .then((response) => response.data),
  });
  if (options.isPending || options.error || !options.data?.contracts.length)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent>
          <SheetHeader>
            <SheetTitle>New request</SheetTitle>
            <SheetDescription className="sr-only">Request details</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            {options.isPending || options.error ? (
              <QueryFeedback pending={options.isPending} onRetry={() => void options.refetch()} />
            ) : (
              <p className="text-sm text-muted-foreground">No open contracts</p>
            )}
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  return (
    <RecordEditor
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title="New request"
      fields={[
        {
          name: 'contractId',
          label: 'Contract',
          value: options.data.contracts[0]!.id,
          required: true,
          options: options.data.contracts.map((contract) => ({
            value: contract.id,
            label:
              (contract.rentalSpace?.unit.name ?? 'Unit') +
              ' / ' +
              (contract.rentalSpace?.name ?? 'Space'),
          })),
        },
        {
          name: 'type',
          label: 'Request type',
          value: options.data.types[0],
          required: true,
          options: options.data.types.map((type) => ({
            value: type,
            label: caseTypes[type] ?? type,
          })),
        },
        { name: 'title', label: 'Title', required: true, maxLength: 160 },
        {
          name: 'description',
          label: 'Description',
          type: 'textarea',
          required: true,
          maxLength: 5000,
        },
        { name: 'category', label: 'Category', maxLength: 100 },
        { name: 'draft', label: 'Save as private draft', type: 'checkbox' },
        {
          name: 'urgency',
          label: 'Urgency',
          value: 'NORMAL',
          options: [
            { value: 'NORMAL', label: 'Normal' },
            { value: 'URGENT', label: 'Urgent' },
          ],
        },
      ]}
      onSave={async (form) => {
        const response = await api.post<CaseRecord>('/requests', {
          clientId: key.current,
          contractId: form.get('contractId'),
          type: form.get('type'),
          title: form.get('title'),
          description: form.get('description'),
          category: form.get('category') || null,
          urgency: form.get('urgency'),
          draft: form.has('draft'),
        });
        client.setQueryData(['request', response.data.id], response.data);
        await client.invalidateQueries({ queryKey: ['requests'] });
        onCreated(response.data.id);
      }}
    />
  );
}
