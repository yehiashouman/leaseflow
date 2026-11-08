import { useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import {
  caseCommands,
  caseDate,
  caseEventLabel,
  caseStatuses,
  caseTypes,
  type CaseAction,
  type CaseRecord,
} from '../cases';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { QueryFeedback } from '@/components/query-feedback';

const textareaClass =
  'min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring';
type Decision = CaseAction & { expectedVersion: number; clientId: string };
function errorMessage(cause: unknown) {
  return isAxiosError(cause)
    ? (cause.response?.data?.message ??
        cause.response?.data?.details
          ?.map((item: { message: string }) => item.message)
          .join('; ') ??
        'Request failed. Retry.')
    : 'Request failed. Retry.';
}
export function RequestDetail() {
  const { id } = useParams();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const messageId = useRef(crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [command, setCommand] = useState<Decision | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [decisionError, setDecisionError] = useState('');
  const [conflict, setConflict] = useState(false);
  const query = useQuery({
    queryKey: ['request', id],
    queryFn: ({ signal }) =>
      api.get<CaseRecord>('/requests/' + id, { signal }).then((response) => response.data),
  });
  async function send(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await client.cancelQueries({ queryKey: ['request', id] });
      const response = await api.post<CaseRecord>('/requests/' + id + '/messages', {
        clientId: messageId.current,
        message: message.trim(),
      });
      client.setQueryData(['request', id], response.data);
      setMessage('');
      messageId.current = crypto.randomUUID();
      await client.invalidateQueries({ queryKey: ['requests'] });
    } catch (cause) {
      setError(errorMessage(cause));
      if (isAxiosError(cause) && cause.response?.status === 409) await query.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function decide(event: FormEvent) {
    event.preventDefault();
    if (!command) return;
    setBusy(true);
    setDecisionError('');
    try {
      await client.cancelQueries({ queryKey: ['request', id] });
      const response = await api.post<CaseRecord>('/requests/' + id + '/respond', {
        status: command.status,
        clientId: command.clientId,
        expectedVersion: command.expectedVersion,
        message: reasons[command.status] ?? '',
      });
      client.setQueryData(['request', id], response.data);
      setReasons((previous) => ({ ...previous, [command.status]: '' }));
      setCommand(null);
      setConflict(false);
      await client.invalidateQueries({ queryKey: ['requests'] });
    } catch (cause) {
      setDecisionError(errorMessage(cause));
      if (isAxiosError(cause) && cause.response?.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  if (query.isPending || query.error || !query.data)
    return <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const events = data.events ?? [];
  const initialMessage = events.some(
    (event) =>
      ['SUBMITTED', 'DRAFT_CREATED'].includes(event.kind) && event.message === data.description,
  );
  return (
    <div className="space-y-6">
      <Link to="/requests" className="text-sm text-primary underline">
        Back to requests
      </Link>
      <div className="min-w-0 space-y-3">
        <h1 className="text-2xl font-semibold break-words">{data.title}</h1>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{caseTypes[data.type] ?? data.type}</Badge>
          <Badge variant="secondary" className="max-w-full whitespace-normal">
            {caseStatuses[data.status] ?? data.status}
          </Badge>
          {data.metadata?.urgency === 'URGENT' && <Badge variant="destructive">Urgent</Badge>}
        </div>
        <p className="text-sm break-words text-muted-foreground">
          {data.contract?.rentalSpace?.unit.name} / {data.contract?.rentalSpace?.name}
          {data.contract?.tenant?.fullName ? ' / ' + data.contract.tenant.fullName : ''}
        </p>
        {data.metadata?.category && <p className="text-sm">{data.metadata.category}</p>}
      </div>
      {!!data.allowedActions?.length && (
        <div className="flex flex-wrap gap-2">
          {data.allowedActions.map((action) => (
            <Button
              key={action.status}
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setCommand({
                  ...action,
                  expectedVersion: data.version,
                  clientId: crypto.randomUUID(),
                });
                setConflict(false);
                setDecisionError('');
              }}
            >
              {caseCommands[action.status] ?? action.status}
            </Button>
          ))}
        </div>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!initialMessage && <p className="whitespace-pre-wrap break-words">{data.description}</p>}
      <section className="space-y-4 border-t pt-5" aria-labelledby="case-history">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="case-history" className="text-lg font-semibold">
            Case history
          </h2>
          <span className="text-xs text-muted-foreground">Times: Asia/Dubai</span>
        </div>
        <ol className="space-y-5">
          {events.map((event) => (
            <li key={event.id} className="space-y-2 border-l-2 pl-4">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="min-w-0 flex-1 basis-48 font-medium break-words">
                  {event.actorName ||
                    (event.actorUserId ? 'Participant ' + event.actorUserId : 'System')}
                </p>
                <time className="text-xs text-muted-foreground" dateTime={event.createdAt}>
                  {caseDate(event.createdAt)}
                </time>
              </div>
              <p className="text-xs text-muted-foreground">
                {event.actorRole === 'LEASING_MANAGER'
                  ? 'Leasing Manager'
                  : event.actorRole === 'TENANT'
                    ? 'Tenant'
                    : event.actorUserId && !event.actorName
                      ? 'Legacy author ID'
                      : (event.actorRole ?? 'System')}{' '}
                · {caseEventLabel(event.kind)}
              </p>
              {event.fromStatus && (
                <p className="text-xs text-muted-foreground">
                  From {caseStatuses[event.fromStatus] ?? event.fromStatus}
                </p>
              )}
              {event.message && <p className="whitespace-pre-wrap break-words">{event.message}</p>}
            </li>
          ))}
        </ol>
        {!events.length && <p className="text-sm text-muted-foreground">No recorded events</p>}
      </section>
      {data.canMessage && (
        <form onSubmit={send} className="max-w-2xl space-y-3 border-t pt-5" aria-busy={busy}>
          <Label htmlFor="case-message">Message</Label>
          <textarea
            id="case-message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              messageId.current = crypto.randomUUID();
            }}
            rows={4}
            maxLength={5000}
            required
            disabled={busy}
            className={textareaClass}
          />
          <Button type="submit" disabled={busy || !message.trim()}>
            Send message
          </Button>
        </form>
      )}
      <Sheet
        open={Boolean(command)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setCommand(null);
            setDecisionError('');
            setConflict(false);
          }
        }}
      >
        <SheetContent role="alertdialog">
          <SheetHeader>
            <SheetTitle>
              {command ? (caseCommands[command.status] ?? command.status) : 'Case decision'}
            </SheetTitle>
            <SheetDescription className="sr-only">Confirm case decision</SheetDescription>
          </SheetHeader>
          <form onSubmit={decide} className="space-y-4 px-4" aria-busy={busy}>
            {decisionError && (
              <Alert variant="destructive">
                <AlertDescription>{decisionError}</AlertDescription>
              </Alert>
            )}
            <Label htmlFor="case-response">Response{command?.requiresMessage ? ' *' : ''}</Label>
            <textarea
              id="case-response"
              className={textareaClass}
              rows={4}
              maxLength={5000}
              required={command?.requiresMessage}
              minLength={command?.requiresMessage ? 3 : undefined}
              value={command ? (reasons[command.status] ?? '') : ''}
              disabled={busy}
              onChange={(event) => {
                if (command)
                  setReasons((previous) => ({ ...previous, [command.status]: event.target.value }));
              }}
            />
            <div className="flex flex-wrap gap-2">
              {conflict ? (
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setCommand(null);
                    setConflict(false);
                    void query.refetch();
                  }}
                >
                  Review latest
                </Button>
              ) : (
                <Button type="submit" disabled={busy}>
                  Confirm
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCommand(null)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </div>
  );
}
