import { recoverableQueryError } from '../api-errors';
import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { previewMode } from '../session';
import { caseTypes, type CaseContract, type RequestCategory, type CaseRecord } from '../cases';
import { RecordEditor } from './record-editor';
import { QueryFeedback, CachedQueryNotice } from './query-feedback';
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
  const [contractId, setContractId] = useState('');
  const [type, setType] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const options = useQuery({
    queryKey: ['case-options', key.current],
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    queryFn: ({ signal }) =>
      api
        .get<{ types: string[]; contracts: CaseContract[]; categories?: RequestCategory[] }>(
          '/requests/options',
          { signal },
        )
        .then((response) => response.data),
  });
  const selectedContract = contractId || options.data?.contracts[0]?.id;
  const selectedType = type || options.data?.types[0];
  const categoryChoices = (options.data?.categories ?? []).filter(
    (category) => category.type === selectedType,
  );
  const category = categoryChoices.find((item) => item.id === categoryId);
  const isComplaint = selectedType === 'NEIGHBOR_COMPLAINT';
  const isKeyLock = selectedType === 'KEY_LOCK_CHANGE';
  const isLatePayment = selectedType === 'LATE_PAYMENT';
  const [selectedPayment, setSelectedPayment] = useState('');
  const lateOptions = useQuery({
    queryKey: ['late-payment-options', selectedContract],
    enabled: isLatePayment && !!selectedContract,
    queryFn: ({ signal }) =>
      api
        .get<{
          windowDays: number;
          extensionDays: number;
          nextApprovalAt: string | null;
          obligations: {
            id: string;
            originalDate: string;
            earliestDate: string;
            latestDate: string;
          }[];
        }>('/requests/options/' + encodeURIComponent(selectedContract!) + '/late-payments', {
          signal,
        })
        .then((response) => response.data),
  });
  const paymentOptions = lateOptions.data?.obligations ?? [];
  const selectedObligation = paymentOptions.find(({ id }) => id === selectedPayment);
  const expectedDates = selectedObligation
    ? Array.from({ length: 5 }, (_, index) => {
        const date = new Date(selectedObligation.earliestDate + 'T00:00:00Z');
        date.setUTCDate(date.getUTCDate() + index);
        return date.toISOString().slice(0, 10);
      }).filter((date) => date <= selectedObligation.latestDate)
    : [];
  const relatedOccupants = useQuery({
    queryKey: ['complaint-occupants', key.current, selectedContract],
    enabled: !previewMode && isComplaint && !!selectedContract,
    queryFn: ({ signal }) =>
      api
        .get<{ occupants: { id: string; label: string }[] }>(
          '/requests/options/' + encodeURIComponent(selectedContract!) + '/occupants',
          { signal },
        )
        .then((response) => response.data.occupants),
  });
  if (
    options.isPending ||
    (options.error && !recoverableQueryError(options.error)) ||
    !options.data?.contracts.length
  )
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
              <QueryFeedback
                pending={options.isPending}
                error={options.error}
                onRetry={() => void options.refetch()}
              />
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
      notice={
        <>
          <CachedQueryNotice error={options.error} onRetry={() => void options.refetch()} />
          {isLatePayment && (lateOptions.isPending || lateOptions.error) && (
            <QueryFeedback
              pending={lateOptions.isPending}
              error={lateOptions.error}
              onRetry={() => void lateOptions.refetch()}
            />
          )}
          {isLatePayment && lateOptions.data && (
            <div className="space-y-1 text-sm">
              <p>
                Request window: {lateOptions.data.windowDays} days before the original due date.
              </p>
              <p>Maximum extension: {lateOptions.data.extensionDays} days.</p>
              {lateOptions.data.nextApprovalAt && (
                <p>
                  Next approval from{' '}
                  {new Date(lateOptions.data.nextApprovalAt).toLocaleDateString('en-GB', {
                    timeZone: 'Asia/Dubai',
                  })}{' '}
                  (Asia/Dubai).
                </p>
              )}
              {!paymentOptions.length && <p>No rent obligations are eligible today.</p>}
            </div>
          )}
        </>
      }
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
          onChange: (value) => {
            setContractId(value);
            setSelectedPayment('');
          },
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
          onChange: (value) => {
            setType(value);
            setCategoryId('');
            setSelectedPayment('');
          },
          options: options.data.types.map((type) => ({
            value: type,
            label: caseTypes[type] ?? type,
          })),
        },
        ...(isComplaint
          ? [
              {
                name: 'involvedOccupantId',
                label: 'Involved occupant',
                options: [
                  {
                    value: '',
                    label: relatedOccupants.isFetching
                      ? 'Loading occupants…'
                      : relatedOccupants.isError
                        ? 'Occupants unavailable'
                        : 'Unknown or not listed',
                  },
                  ...(relatedOccupants.data ?? []).map(({ id, label }) => ({ value: id, label })),
                ],
              },
            ]
          : []),
        ...(isLatePayment
          ? [
              {
                name: 'paymentId-' + selectedContract,
                errorPath: 'latePayment.paymentId',
                label: 'Rent obligation',
                required: true,
                onChange: setSelectedPayment,
                options: [
                  { value: '', label: 'Select the original due date' },
                  ...paymentOptions.map(({ id, originalDate }) => ({
                    value: id,
                    label: originalDate + ' (Asia/Dubai)',
                  })),
                ],
              },
              {
                name: 'requestedDate-' + selectedPayment,
                errorPath: 'latePayment.requestedDate',
                label: 'Requested payment date',
                required: true,
                options: [
                  { value: '', label: 'Select a date' },
                  ...expectedDates.map((date) => ({ value: date, label: date + ' (Asia/Dubai)' })),
                ],
              },
            ]
          : []),
        { name: 'title', label: 'Title', required: true, maxLength: 160 },
        {
          name: 'description',
          label: isKeyLock ? 'Reason for key or lock change' : 'Description',
          type: 'textarea',
          required: true,
          maxLength: 5000,
        },
        ...(categoryChoices.length
          ? [
              {
                name: 'category-' + selectedType,
                errorPath: 'configuredCategory',
                label: 'Category',
                onChange: setCategoryId,
                options: [
                  { value: '', label: 'No category' },
                  ...categoryChoices.map(({ id, name }) => ({ value: id, label: name })),
                ],
              },
            ]
          : []),
        ...(category?.prompt
          ? [
              {
                name: 'answer-' + category.id,
                errorPath: 'configuredCategory.answer',
                label: category.prompt,
                required: category.answerRequired,
                type: 'textarea',
                maxLength: 2000,
              },
            ]
          : []),
        ...(!isLatePayment
          ? [{ name: 'draft', label: 'Save as private draft', type: 'checkbox' }]
          : []),
        {
          name: 'urgency',
          errorPath: 'metadata.urgency',
          label: isKeyLock ? 'Security urgency' : 'Urgency',
          value: 'NORMAL',
          options: [
            { value: 'NORMAL', label: 'Normal' },
            { value: 'URGENT', label: 'Urgent' },
          ],
        },
      ]}
      onSave={async (form) => {
        const involvedOccupantId = form.get('involvedOccupantId');
        const response = await api.post<CaseRecord>('/requests', {
          clientId: key.current,
          contractId: form.get('contractId'),
          type: form.get('type'),
          title: form.get('title'),
          description: form.get('description'),
          ...(category
            ? {
                configuredCategory: {
                  id: category.id,
                  version: category.version,
                  answer: form.get('answer-' + category.id) || null,
                },
              }
            : {}),
          urgency: form.get('urgency'),
          ...(involvedOccupantId ? { involvedOccupantId } : {}),
          draft: form.has('draft'),
          ...(isLatePayment
            ? {
                latePayment: {
                  paymentId: selectedPayment,
                  requestedDate: form.get('requestedDate-' + selectedPayment),
                },
              }
            : {}),
        });
        client.setQueryData(['request', response.data.id], response.data);
        await client.invalidateQueries({ queryKey: ['requests'] });
        onCreated(response.data.id);
      }}
    />
  );
}
