import dubaiBuildings from '../data/dubai-buildings.json';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryFeedback } from '@/components/query-feedback';
import { RecordEditor, formValues, type EditorField } from '@/components/record-editor';
import type { Landlord } from './Landlords';
import { unitAmenities } from '../unit-amenities';
import { Input } from '@/components/ui/input';

export type Unit = {
  id: string;
  name: string;
  building?: string;
  street?: string;
  addressNotes?: string;
  emirate?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  area: string;
  landlordId?: string;
  landlord?: { id?: string; name: string };
  currency: string;
  defaultDeposit: string | number;
  ownerMonthlyRent?: string | number;
  ownerPaymentSchedule?: string;
  archivedAt?: string | null;
  amenities?: Record<string, unknown>;
  spaces: {
    id: string;
    name?: string;
    type?: string;
    capacity?: number;
    askingRent?: string | number;
    status?: string;
    enabled?: boolean;
    amenities?: Record<string, unknown>;
  }[];
  active: boolean;
};

export function Units() {
  const client = useQueryClient();
  const [editor, setEditor] = useState<Unit | 'new' | null>(null);
  const [status, setStatus] = useState('CURRENT');
  const [search, setSearch] = useState('');
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['units', status, search],
    queryFn: ({ signal }) =>
      api
        .get<Unit[]>('/inventory/units', { params: { status, q: search }, signal })
        .then((response) => response.data),
  });
  const landlords = useQuery({
    queryKey: ['landlords'],
    queryFn: () => api.get<Landlord[]>('/inventory/landlords').then((response) => response.data),
  });
  const fields: EditorField[] = [
    { name: 'name', label: 'Unit name', required: true, maxLength: 150 },
    { name: 'area', label: 'Area', required: true, maxLength: 150 },
    {
      name: 'landlordId',
      label: 'Landlord',
      options: [
        { value: '', label: 'No landlord linked' },
        ...(landlords.data ?? []).map((item) => ({ value: item.id, label: item.name })),
      ],
    },
    {
      name: 'building',
      label: 'Building',
      maxLength: 150,
      searchable: true,
      allowCustom: true,
      options: [
        ...new Map(
          [
            ...dubaiBuildings.buildings.map((item) => ({
              value: item.name,
              label: item.name + ' · ' + item.area,
            })),
            ...data
              .filter((item) => item.building)
              .map((item) => ({
                value: item.building!,
                label: item.building! + ' · ' + item.area,
              })),
          ].map((item) => [item.value, item]),
        ).values(),
      ].sort((a, b) => a.label.localeCompare(b.label)),
    },
    { name: 'street', label: 'Street', maxLength: 200 },
    { name: 'addressNotes', label: 'Address notes', type: 'textarea', maxLength: 1000 },
    { name: 'emirate', label: 'Emirate', value: 'Dubai', required: true, maxLength: 100 },
    { name: 'latitude', label: 'Latitude', type: 'number', min: -90, max: 90, step: '0.0000001' },
    {
      name: 'longitude',
      label: 'Longitude',
      type: 'number',
      min: -180,
      max: 180,
      step: '0.0000001',
    },
    {
      name: 'currency',
      label: 'Currency',
      value: 'AED',
      options: [
        { value: 'AED', label: 'AED' },
        { value: 'USD', label: 'USD' },
      ],
    },
    { name: 'ownerMonthlyRent', label: 'Owner monthly rent', type: 'number', min: 0, step: '0.01' },
    {
      name: 'ownerPaymentSchedule',
      label: 'Owner payment schedule',
      type: 'textarea',
      maxLength: 1000,
    },
    {
      name: 'defaultDeposit',
      label: 'Default deposit',
      type: 'number',
      min: 0,
      step: '0.01',
      value: 0,
      required: true,
    },
    ...Object.entries(unitAmenities).map(([key, label]) => ({
      name: 'amenity_' + key,
      errorPath: 'amenities.' + key,
      label,
      type: 'checkbox',
    })),
    {
      name: 'additionalAmenities',
      errorPath: 'amenities.additional',
      label: 'Additional amenities',
      type: 'textarea',
      maxLength: 1600,
    },
    {
      name: 'declarationAccepted',
      label:
        'I confirm the property and authorization information is genuine and legally sufficient.',
      type: 'checkbox',
      required: true,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            Property portfolio
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Units</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your Dubai properties, spaces, and availability.
          </p>
        </div>
        <Button onClick={() => setEditor('new')}>
          <Plus aria-hidden="true" />
          Add unit
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[
          ['Total units', data.length],
          ['Active units', data.filter((unit) => unit.active && !unit.archivedAt).length],
          ['Rental spaces', data.reduce((total, unit) => total + unit.spaces.length, 0)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-2xl border border-border/70 bg-white p-4 sm:p-5">
            <p className="text-[11px] text-muted-foreground sm:text-xs">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">
              {isPending || error ? '—' : value}
            </p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 rounded-2xl border border-border/70 bg-white p-3">
        <Input
          type="search"
          aria-label="Search units"
          placeholder="Search units"
          maxLength={150}
          className="max-w-sm"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          aria-label="Unit status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="CURRENT">Current</option>
          <option value="ARCHIVED">Archived</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Landlord</TableHead>
              <TableHead>Spaces</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell>
                  <Link to={'/units/' + unit.id} className="font-medium text-primary underline">
                    {unit.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{unit.building}</span>
                </TableCell>
                <TableCell>{unit.area}</TableCell>
                <TableCell>{unit.landlord?.name ?? '-'}</TableCell>
                <TableCell>{unit.spaces.length}</TableCell>
                <TableCell>
                  <Badge variant={unit.active ? 'default' : 'secondary'}>
                    {unit.archivedAt ? 'Archived' : unit.active ? 'Active' : 'Draft'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={Boolean(unit.archivedAt)}
                    onClick={() => setEditor(unit)}
                  >
                    Edit<span className="sr-only"> {unit.name}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!data.length && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No units yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {editor && (
        <RecordEditor
          key={editor === 'new' ? 'new' : editor.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={editor === 'new' ? 'Add unit' : 'Edit unit'}
          fields={fields.map((field) => ({
            ...field,
            value: field.name.startsWith('amenity_')
              ? String(editor !== 'new' && editor.amenities?.[field.name.slice(8)] === true)
              : field.name === 'additionalAmenities'
                ? editor !== 'new' && Array.isArray(editor.amenities?.additional)
                  ? editor.amenities.additional.join('\n')
                  : ''
                : editor === 'new'
                  ? field.value
                  : String(editor[field.name as keyof Unit] ?? field.value ?? ''),
          }))}
          onSave={async (form) => {
            const body = {
              ...formValues(
                form,
                fields
                  .filter(
                    (field) => field.type !== 'checkbox' && field.name !== 'additionalAmenities',
                  )
                  .map((field) => field.name),
              ),
              amenities: {
                ...(editor === 'new' ? {} : editor.amenities),
                ...Object.fromEntries(
                  Object.keys(unitAmenities).map((key) => [key, form.has('amenity_' + key)]),
                ),
                additional: [
                  ...new Set(
                    String(form.get('additionalAmenities') ?? '')
                      .split('\n')
                      .map((value) => value.trim())
                      .filter(Boolean),
                  ),
                ],
              },
              declarationAccepted: form.has('declarationAccepted'),
            };
            if (editor === 'new') await api.post('/inventory/units', body);
            else await api.patch('/inventory/units/' + editor.id, body);
            await client.invalidateQueries({ queryKey: ['units'] });
            await client.invalidateQueries({ queryKey: ['unit'] });
            await client.invalidateQueries({ queryKey: ['landlords'] });
            await client.invalidateQueries({ queryKey: ['landlord'] });
            await client.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}
