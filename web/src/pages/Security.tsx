import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { previewMode } from '../session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QueryFeedback } from '@/components/query-feedback';
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

type Session = {
  id: string;
  current: boolean;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
};
type Command = { title: string; run: () => Promise<void> };
export function Security() {
  const client = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [command, setCommand] = useState<Command | null>(null);
  const {
    data = [],
    isPending,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => api.get<Session[]>('/auth/sessions').then((response) => response.data),
  });
  const date = (value: string) =>
    new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
  async function execute(run: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await run();
      setCommand(null);
    } catch (cause) {
      setError(
        isAxiosError(cause)
          ? (cause.response?.data?.message ?? 'Request failed. Retry.')
          : 'Request failed. Retry.',
      );
    } finally {
      setBusy(false);
    }
  }
  function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    if (fields.get('newPassword') !== fields.get('confirmPassword')) {
      setError('New passwords do not match.');
      return;
    }
    setCommand({
      title: 'Change password and sign out all sessions?',
      run: async () => {
        await api.post('/auth/password', {
          currentPassword: fields.get('currentPassword'),
          newPassword: fields.get('newPassword'),
        });
        form.reset();
        window.dispatchEvent(new Event('leaseflow:unauthorized'));
      },
    });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Security</h1>
        <Button
          variant="outline"
          disabled={busy || !data.length}
          onClick={() =>
            setCommand({
              title: 'Sign out all sessions?',
              run: async () => {
                await api.post('/auth/logout-all');
                window.dispatchEvent(new Event('leaseflow:unauthorized'));
              },
            })
          }
        >
          Sign out all sessions
        </Button>
      </div>
      {error && !command && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
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
            <SheetTitle>{command?.title}</SheetTitle>
            <SheetDescription className="sr-only">Confirm account security action</SheetDescription>
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
                onClick={() => {
                  if (command) void execute(command.run);
                }}
              >
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
      <section className="space-y-3" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="text-lg font-semibold">
          Active sessions
        </h2>
        <p className="text-sm text-muted-foreground">Times: Asia/Dubai</p>
        {isPending || queryError ? (
          <QueryFeedback pending={isPending} onRetry={() => void refetch()} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IP address</TableHead>
                <TableHead>Last renewal</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((session) => (
                <TableRow key={session.id}>
                  <TableCell className="max-w-56 whitespace-normal break-words">
                    {session.userAgent || 'Unknown device'}{' '}
                    {session.current && <Badge variant="secondary">Current</Badge>}
                  </TableCell>
                  <TableCell>{session.ip || '-'}</TableCell>
                  <TableCell>{date(session.lastUsedAt)}</TableCell>
                  <TableCell>{date(session.expiresAt)}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      aria-label={
                        session.current ? 'Revoke current session' : 'Revoke session ' + session.id
                      }
                      onClick={() =>
                        setCommand({
                          title: session.current
                            ? 'Revoke this session and sign out?'
                            : 'Revoke the selected session?',
                          run: async () => {
                            await api.delete('/auth/sessions/' + session.id);
                            if (session.current)
                              window.dispatchEvent(new Event('leaseflow:unauthorized'));
                            else await client.invalidateQueries({ queryKey: ['sessions'] });
                          },
                        })
                      }
                    >
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
      {!previewMode && (
        <section className="max-w-lg space-y-4 border-t pt-6" aria-labelledby="password-title">
          <h2 id="password-title" className="text-lg font-semibold">
            Change password
          </h2>
          <form onSubmit={password} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="current-password">Current password</Label>
              <Input
                id="current-password"
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input
                id="confirm-password"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                maxLength={128}
              />
            </div>
            <Button type="submit" disabled={busy}>
              Change password
            </Button>
          </form>
        </section>
      )}
    </div>
  );
}
