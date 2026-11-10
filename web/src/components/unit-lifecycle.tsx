import { requestError } from '../api-errors';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Button } from './ui/button';
import { Alert, AlertDescription } from './ui/alert';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from './ui/sheet';

export function UnitLifecycle({ id, archived }: { id: string; archived: boolean }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const label = archived ? 'Restore unit' : 'Archive unit';
  async function confirm() {
    setBusy(true);
    setError('');
    try {
      await api.post('/inventory/units/' + id + (archived ? '/restore' : '/archive'));
      await Promise.all(
        ['unit', 'units', 'landlord', 'landlords', 'dashboard'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
      setOpen(false);
    } catch (cause) {
      setError(requestError(cause, 'Request failed. Retry.'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setError('');
          setOpen(true);
        }}
      >
        {label}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <SheetContent role="alertdialog">
          <SheetHeader>
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription>
              {archived
                ? 'Restore as a draft; activation still requires complete evidence.'
                : 'Archive preserves rooms, contracts, and history; open contracts prevent archive.'}
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 px-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button disabled={busy} onClick={() => void confirm()}>
                Confirm
              </Button>
              <Button variant="outline" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
