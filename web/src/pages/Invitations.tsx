import { useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { previewMode } from '../session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { QueryFeedback } from '@/components/query-feedback';
type Invitation = {
  id: string;
  email: string;
  fullName: string;
  status: string;
  expiresAt: string;
  resendCount: number;
};
export function AccountInvitations() {
  const client = useQueryClient(),
    key = useRef({ signature: '', id: crypto.randomUUID() });
  const revokeTrigger = useRef<HTMLButtonElement | null>(null);
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [revoke, setRevoke] = useState<Invitation | null>(null);
  const query = useQuery({
    queryKey: ['invitations', page, status],
    enabled: !previewMode,
    queryFn: ({ signal }) =>
      api
        .get<{ items: Invitation[]; total: number; pageSize: number }>('/invitations', {
          params: { page, status: status || undefined },
          signal,
        })
        .then((response) => response.data),
  });
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['invitations'] });
    } catch (cause) {
      setError(
        isAxiosError(cause)
          ? (cause.response?.data?.message ?? 'The request failed. Retry.')
          : 'The request failed. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget,
      form = new FormData(element),
      email = String(form.get('email')).trim().toLowerCase(),
      fullName = String(form.get('fullName')).trim();
    const signature = JSON.stringify({ email, fullName });
    if (key.current.signature !== signature) key.current = { signature, id: crypto.randomUUID() };
    void run(async () => {
      await api.post('/invitations', { email, fullName, clientId: key.current.id });
      element.reset();
      key.current = { signature: '', id: crypto.randomUUID() };
      setPage(1);
      setSuccess('Invitation saved. Email delivery is queued.');
    });
  }
  return (
    <div className="space-y-6">
      <h1 id="invitation-heading" tabIndex={-1} className="text-2xl font-semibold">
        Tenant invitations
      </h1>
      {previewMode ? (
        <p>Invitations require the live API and configured email provider.</p>
      ) : (
        <>
          <form
            onSubmit={create}
            className="grid gap-4 rounded-md border p-4 sm:grid-cols-2"
            aria-label="Invite tenant"
          >
            <div className="space-y-2">
              <Label htmlFor="invite-name">Tenant name</Label>
              <Input
                id="invite-name"
                name="fullName"
                required
                minLength={2}
                maxLength={150}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Tenant email</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
                maxLength={191}
                disabled={busy}
              />
            </div>
            <Button disabled={busy}>Invite tenant</Button>
          </form>
          {error && !revoke && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && <p role="status">{success}</p>}
          <div className="max-w-sm space-y-2">
            <Label htmlFor="invitation-status">Invitation status</Label>
            <select
              id="invitation-status"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All</option>
              {['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          {query.isPending || query.error ? (
            <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
          ) : !query.data?.items.length ? (
            <p>No invitations.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {query.data.items.map((row) => (
                  <li key={row.id} className="min-w-0 space-y-3 rounded-md border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-words">{row.fullName}</strong>
                      <Badge variant="outline">{row.status}</Badge>
                    </div>
                    <p className="break-words">{row.email}</p>
                    <p className="text-sm">
                      Expiry:{' '}
                      {new Date(row.expiresAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
                      Asia/Dubai
                    </p>
                    {['PENDING', 'EXPIRED'].includes(row.status) && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          disabled={busy || row.resendCount >= 5}
                          onClick={() =>
                            void run(async () => {
                              await api.post('/invitations/' + row.id + '/resend', {});
                              setSuccess('Invitation email queued. Previous links no longer work.');
                            })
                          }
                        >
                          Resend invitation
                        </Button>
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={(event) => {
                            revokeTrigger.current = event.currentTarget;
                            setError('');
                            setRevoke(row);
                          }}
                        >
                          Revoke invitation
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button
                  variant="outline"
                  disabled={page === 1 || busy}
                  onClick={() => setPage(page - 1)}
                >
                  Previous invitations
                </Button>
                <span className="text-sm">Page {page}</span>
                <Button
                  variant="outline"
                  disabled={page * query.data.pageSize >= query.data.total || busy}
                  onClick={() => setPage(page + 1)}
                >
                  Next invitations
                </Button>
              </div>
            </>
          )}
          <Sheet
            open={Boolean(revoke)}
            onOpenChange={(open) => {
              if (!open && !busy) setRevoke(null);
            }}
          >
            {revoke && (
              <SheetContent
                role="alertdialog"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  if (revokeTrigger.current?.isConnected && !revokeTrigger.current.disabled)
                    revokeTrigger.current.focus();
                  else document.getElementById('invitation-heading')?.focus();
                }}
              >
                <SheetHeader>
                  <SheetTitle>Revoke invitation?</SheetTitle>
                  <SheetDescription>Revoke the invitation for {revoke.email}?</SheetDescription>
                </SheetHeader>
                <div className="space-y-4 px-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <div className="flex gap-2">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await api.post('/invitations/' + revoke.id + '/revoke', {});
                          setRevoke(null);
                          setSuccess('Invitation revoked.');
                        })
                      }
                    >
                      Confirm revocation
                    </Button>
                    <Button variant="outline" disabled={busy} onClick={() => setRevoke(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              </SheetContent>
            )}
          </Sheet>
        </>
      )}
    </div>
  );
}
