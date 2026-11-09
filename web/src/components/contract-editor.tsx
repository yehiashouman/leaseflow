import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { RecordEditor, type EditorField } from './record-editor';
import { QueryFeedback } from './query-feedback';
import { Button } from './ui/button';

type Options = {
  tenants: { id: string; fullName: string }[];
  spaces: {
    id: string;
    name: string;
    capacity: number;
    unit: { name: string; currency: string; defaultDeposit: string };
  }[];
  activationEnabled: boolean;
  limit: number;
  policy: string;
};
export function ContractEditor({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const key = useRef(crypto.randomUUID()),
    client = useQueryClient();
  const [couple, setCouple] = useState(false);
  const query = useQuery({
    queryKey: ['contract-options', key.current],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      api.get<Options>('/contracts/options', { signal }).then((response) => response.data),
  });
  if (
    query.isPending ||
    query.error ||
    !query.data?.activationEnabled ||
    !query.data.tenants.length ||
    !query.data.spaces.length
  )
    return (
      <section className="space-y-3 rounded-md border p-4">
        {query.isPending || query.error ? (
          <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
        ) : (
          <p>
            {!query.data?.activationEnabled
              ? query.data?.policy
              : 'Contract setup requires an active tenant and an available enabled space.'}
          </p>
        )}
        <Button variant="outline" onClick={onClose}>
          Close contract setup
        </Button>
      </section>
    );
  const options = query.data;
  const secondary: EditorField[] = couple
    ? [
        {
          name: 'secondaryName',
          errorPath: 'secondaryOccupant.fullName',
          label: 'Secondary occupant full name',
          required: true,
          maxLength: 150,
        },
        {
          name: 'secondaryDob',
          errorPath: 'secondaryOccupant.dateOfBirth',
          label: 'Secondary occupant date of birth',
          required: true,
          type: 'date',
        },
        {
          name: 'secondaryNationality',
          errorPath: 'secondaryOccupant.nationality',
          label: 'Secondary occupant nationality',
          required: true,
          maxLength: 100,
        },
        {
          name: 'secondaryId',
          errorPath: 'secondaryOccupant.emiratesIdNumber',
          label: 'Secondary occupant Emirates ID',
          required: true,
          maxLength: 20,
        },
        {
          name: 'secondaryExpiry',
          errorPath: 'secondaryOccupant.emiratesIdExpiresAt',
          label: 'Secondary occupant Emirates ID expiry',
          required: true,
          type: 'date',
        },
      ]
    : [];
  return (
    <RecordEditor
      open
      title="Create monthly contract"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      fields={[
        {
          name: 'tenantId',
          label: 'Primary tenant',
          required: true,
          value: options.tenants[0]!.id,
          options: options.tenants.map((row) => ({ value: row.id, label: row.fullName })),
        },
        {
          name: 'rentalSpaceId',
          label: 'Rental space',
          required: true,
          value: options.spaces[0]!.id,
          options: options.spaces.map((row) => ({
            value: row.id,
            label: row.unit.name + ' / ' + row.name + ' (capacity ' + row.capacity + ')',
          })),
        },
        {
          name: 'startDate',
          label: 'Move-in calendar date (Asia/Dubai)',
          required: true,
          type: 'date',
        },
        {
          name: 'monthlyRent',
          label: 'Negotiated monthly rent',
          required: true,
          type: 'number',
          min: 0.01,
          max: 9999999999.99,
          step: '0.01',
        },
        {
          name: 'currency',
          label: 'Contract currency',
          value: 'AED',
          options: ['AED', 'USD'].map((value) => ({ value, label: value })),
        },
        {
          name: 'dueDay',
          label: 'Monthly due day',
          required: true,
          type: 'number',
          value: 1,
          min: 1,
          max: 28,
        },
        {
          name: 'noticeDays',
          label: 'Notice period (calendar days)',
          required: true,
          type: 'number',
          value: 30,
          min: 0,
          max: 90,
        },
        {
          name: 'depositAmount',
          label: 'Negotiated deposit (leave empty for unit default)',
          type: 'number',
          min: 0,
          max: 9999999999.99,
          step: '0.01',
        },
        {
          name: 'occupancy',
          label: 'Occupancy arrangement',
          value: 'SINGLE',
          options: [
            { value: 'SINGLE', label: 'Single primary tenant' },
            { value: 'COUPLE', label: 'Primary tenant and secondary occupant (couple)' },
          ],
          onChange: (value) => setCouple(value === 'COUPLE'),
        },
        ...secondary,
        {
          name: 'responsibility',
          label:
            'The primary tenant remains responsible; secondary occupants receive no separate account',
          required: true,
          type: 'checkbox',
        },
        {
          name: 'confirmed',
          label: 'I confirm these monthly terms and the immediate allocation of available space',
          required: true,
          type: 'checkbox',
        },
      ]}
      onSave={async (form) => {
        const deposit = String(form.get('depositAmount') || '');
        const response = await api.post<{ id: string }>('/contracts', {
          clientId: key.current,
          tenantId: form.get('tenantId'),
          rentalSpaceId: form.get('rentalSpaceId'),
          startDate: form.get('startDate'),
          monthlyRent: String(form.get('monthlyRent')),
          currency: form.get('currency'),
          dueDay: Number(form.get('dueDay')),
          noticeDays: Number(form.get('noticeDays')),
          ...(deposit ? { depositAmount: deposit } : {}),
          ...(form.get('occupancy') === 'COUPLE'
            ? {
                secondaryOccupant: {
                  fullName: form.get('secondaryName'),
                  dateOfBirth: form.get('secondaryDob'),
                  nationality: form.get('secondaryNationality'),
                  emiratesIdNumber: form.get('secondaryId'),
                  emiratesIdExpiry: form.get('secondaryExpiry'),
                },
              }
            : {}),
        });
        await Promise.all([
          client.invalidateQueries({ queryKey: ['contracts'] }),
          client.invalidateQueries({ queryKey: ['dashboard'] }),
          client.invalidateQueries({ queryKey: ['units'] }),
        ]);
        onCreated(response.data.id);
      }}
    />
  );
}
