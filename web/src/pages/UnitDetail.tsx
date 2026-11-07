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
  const [open, setOpen] = useState(false);
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
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-sm text-muted-foreground">
            {data.area} · {data.landlord?.name || 'No landlord linked'}
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
          <dd>{data.building || '-'}</dd>
        </div>
      </dl>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rental spaces</h2>
        <Button onClick={() => setOpen(true)}>Add room</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Capacity</TableHead>
            <TableHead>Asking rent</TableHead>
            <TableHead>Status</TableHead>
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
            </TableRow>
          ))}
          {!data.spaces.length && (
            <TableRow>
              <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                No rooms yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      {open && (
        <RecordEditor
          open
          onOpenChange={setOpen}
          title="Add room"
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
          ]}
          onSave={async (form) => {
            await api.post('/inventory/units/' + id + '/spaces', {
              name: form.get('name'),
              type: form.get('type'),
              capacity: Number(form.get('capacity')),
              askingRent: form.get('askingRent') || null,
              amenities: { privateBathroom: form.has('privateBathroom') },
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
