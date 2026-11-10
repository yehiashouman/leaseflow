import { requestError } from '../api-errors';
import { recoverableQueryError } from '../api-errors';
import { Documents } from '@/components/documents';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Landlord } from './Landlords';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryFeedback, CachedQueryNotice } from '@/components/query-feedback';
import { LandlordEditor } from '@/components/landlord-editor';

export function LandlordDetail() {
  const { id } = useParams();
  const client = useQueryClient();
  const [editor, setEditor] = useState(false);
  const [command, setCommand] = useState<'archive' | 'restore' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const {
    data,
    isPending,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['landlord', id],
    queryFn: ({ signal }) =>
      api.get<Landlord>('/inventory/landlords/' + id, { signal }).then((response) => response.data),
  });
  if (isPending || (queryError && !recoverableQueryError(queryError)) || !data)
    return <QueryFeedback pending={isPending} error={queryError} onRetry={() => void refetch()} />;
  const units = data.units ?? [];
  async function execute() {
    setBusy(true);
    setError('');
    try {
      await api.post('/inventory/landlords/' + id + '/' + command);
      await client.invalidateQueries({ queryKey: ['landlord', id] });
      await client.invalidateQueries({ queryKey: ['landlords'] });
      setCommand(null);
    } catch (cause) {
      setError(requestError(cause, 'Request failed. Retry.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <CachedQueryNotice error={queryError} onRetry={() => void refetch()} />
      <Link to="/landlords" className="text-sm text-primary underline">
        Back to landlords
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64 space-y-1">
          <h1 className="text-2xl font-semibold break-words">{data.name}</h1>
          {data.companyName && (
            <p className="text-muted-foreground break-words">{data.companyName}</p>
          )}
          <Badge variant="secondary">{data.archivedAt ? 'Archived' : 'Active'}</Badge>
        </div>
        <div className="flex gap-2">
          {!data.archivedAt && (
            <Button variant="outline" onClick={() => setEditor(true)}>
              Edit landlord
            </Button>
          )}
          <Button
            variant="outline"
            disabled={busy || (!data.archivedAt && units.length > 0)}
            aria-describedby={!data.archivedAt && units.length ? 'archive-blocked' : undefined}
            onClick={() => setCommand(data.archivedAt ? 'restore' : 'archive')}
          >
            {data.archivedAt ? 'Restore landlord' : 'Archive landlord'}
          </Button>
        </div>
      </div>
      {!data.archivedAt && units.length > 0 && (
        <p id="archive-blocked" className="text-sm text-muted-foreground">
          Linked units prevent archive.
        </p>
      )}
      <dl className="grid gap-5 border-y py-5 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ['Email', data.email],
          ['Phone', data.phone],
          ['WhatsApp', data.whatsapp],
          [
            'Preferred contact',
            data.preferredContactMethod === 'WHATSAPP'
              ? 'WhatsApp'
              : data.preferredContactMethod === 'PHONE'
                ? 'Phone'
                : data.preferredContactMethod === 'EMAIL'
                  ? 'Email'
                  : null,
          ],
          ['Address', data.address],
          ['Notes', data.notes],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="whitespace-pre-wrap break-words">{value || '-'}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-3" aria-labelledby="landlord-units">
        <h2 id="landlord-units" className="text-lg font-semibold">
          Linked units
        </h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Unit</TableHead>
              <TableHead>Area</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {units.map((unit) => (
              <TableRow key={unit.id}>
                <TableCell>
                  <Link to={'/units/' + unit.id} className="font-medium text-primary underline">
                    {unit.name}
                  </Link>
                </TableCell>
                <TableCell>{unit.area}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{unit.active ? 'Active' : 'Draft'}</Badge>
                </TableCell>
              </TableRow>
            ))}
            {!units.length && (
              <TableRow>
                <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                  No linked units
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
      {editor && <LandlordEditor landlord={data} onClose={() => setEditor(false)} />}
      <Documents purpose="LANDLORD_DOCUMENT" targetId={data.id} heading="Landlord documents" />
      <Sheet
        open={Boolean(command)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCommand(null);
            setError('');
          }
        }}
      >
        <SheetContent role="alertdialog">
          <SheetHeader>
            <SheetTitle>
              {command === 'archive' ? 'Archive landlord?' : 'Restore landlord?'}
            </SheetTitle>
            <SheetDescription className="sr-only">Confirm landlord status change</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void execute()}>
                Confirm
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setCommand(null);
                  setError('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
