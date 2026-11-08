import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { RecordEditor } from '@/components/record-editor';
import { QueryFeedback } from '@/components/query-feedback';
import type { Unit } from './Units';

export function UnitDetail() {
  const { id } = useParams();
  const client = useQueryClient();
  const [editor, setEditor] = useState<Unit['spaces'][number] | 'new' | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ['unit', id],
    queryFn: () => api.get<Unit>('/inventory/units/' + id).then((response) => response.data),
  });
  if (isPending || error || !data)
    return <QueryFeedback pending={isPending} onRetry={() => void refetch()} />;
  return (
    <div className="space-y-6">
      <Link to="/units" className="text-sm text-primary underline">
        Back to units
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-2xl font-semibold break-words">{data.name}</h1>
          <p className="text-sm break-words text-muted-foreground">
            {data.area} ·{' '}
            {data.landlord?.id ? (
              <Link to={'/landlords/' + data.landlord.id} className="text-primary underline">
                {data.landlord.name}
              </Link>
            ) : (
              data.landlord?.name || 'No landlord linked'
            )}
          </p>
        </div>
        <Badge variant="secondary">{data.active ? 'Active' : 'Draft'}</Badge>
      </div>
      <dl className="grid gap-4 border-y py-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">Owner rent</dt>
          <dd>
            {data.currency} {Number(data.ownerMonthlyRent ?? 0).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Default deposit</dt>
          <dd>
            {data.currency} {Number(data.defaultDeposit).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Building</dt>
          <dd className="break-words">{data.building || '-'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Street</dt>
          <dd className="break-words">{data.street || '-'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Emirate</dt>
          <dd className="break-words">{data.emirate || '-'}</dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">Coordinates</dt>
          <dd>
            {data.latitude ?? '-'}, {data.longitude ?? '-'}
          </dd>
        </div>
        <div className="sm:col-span-3">
          <dt className="text-sm text-muted-foreground">Address notes</dt>
          <dd className="whitespace-pre-wrap break-words">{data.addressNotes || '-'}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rental spaces</h2>
        <Button onClick={() => setEditor('new')}>Add room</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>Asking rent</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.spaces.map((space) => (
            <TableRow key={space.id}>
              <TableCell>{space.name}</TableCell>
              <TableCell>{space.type?.replaceAll('_', ' ')}</TableCell>
              <TableCell>{space.capacity}</TableCell>
              <TableCell>
                {data.currency} {Number(space.askingRent ?? 0).toLocaleString()}
              </TableCell>
              <TableCell>
                <Badge variant="secondary">{space.status}</Badge>
              </TableCell>
              <TableCell>
                <Button variant="ghost" size="sm" onClick={() => setEditor(space)}>
                  Edit<span className="sr-only"> {space.name}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
          {!data.spaces.length && (
            <TableRow>
              <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                No rooms yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {editor && (
        <RecordEditor
          key={editor === 'new' ? 'new' : editor.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={editor === 'new' ? 'Add room' : 'Edit room'}
          fields={[
            { name: 'name', label: 'Room name', required: true },
            {
              name: 'type',
              label: 'Type',
              value: 'ROOM',
              options: [
                { value: 'ROOM', label: 'Room' },
                { value: 'MASTER_ROOM', label: 'Master Room' },
              ],
            },
            {
              name: 'capacity',
              label: 'Capacity',
              type: 'number',
              min: 1,
              max: 10,
              value: 1,
              required: true,
            },
            { name: 'askingRent', label: 'Asking rent', type: 'number', min: 0, step: '0.01' },
            { name: 'privateBathroom', label: 'Private bathroom', type: 'checkbox' },
            ...(editor === 'new'
              ? []
              : [
                  {
                    name: 'availability',
                    label: 'Availability',
                    value:
                      editor.status === 'MAINTENANCE' || editor.status === 'INACTIVE'
                        ? editor.status
                        : 'ACTIVE',
                    options: [
                      { value: 'ACTIVE', label: 'Active' },
                      { value: 'MAINTENANCE', label: 'Maintenance' },
                      { value: 'INACTIVE', label: 'Inactive' },
                    ],
                  },
                ]),
          ].map((field) => ({
            ...field,
            value:
              editor === 'new' || field.name === 'availability'
                ? field.value
                : field.name === 'privateBathroom'
                  ? String(editor.amenities?.privateBathroom === true)
                  : String(editor[field.name as keyof typeof editor] ?? field.value ?? ''),
          }))}
          onSave={async (form) => {
            const body = {
              name: form.get('name'),
              type: form.get('type'),
              capacity: Number(form.get('capacity')),
              askingRent: form.get('askingRent') || null,
              amenities: {
                ...(editor === 'new' ? {} : editor.amenities),
                privateBathroom: form.has('privateBathroom'),
              },
            };
            if (editor === 'new') await api.post('/inventory/units/' + id + '/spaces', body);
            else
              await api.patch('/inventory/spaces/' + editor.id, {
                ...body,
                availability: form.get('availability'),
              });
            await client.invalidateQueries({ queryKey: ['unit', id] });
            await client.invalidateQueries({ queryKey: ['units'] });
            await client.invalidateQueries({ queryKey: ['dashboard'] });
          }}
        />
      )}
    </div>
  );
}
