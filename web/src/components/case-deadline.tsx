import { FormFieldErrors } from './field-errors';
import { validationFields } from '../form-errors';
import { requestError } from '../api-errors';
import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { useAuth } from '../auth';
import { caseDate, type CaseRecord } from '../cases';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';

export function CaseDeadline({ data }: { data: CaseRecord }) {
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const { user } = useAuth();
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [key, setKey] = useState(crypto.randomUUID());
  const [version, setVersion] = useState(data.version);
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  const permitted =
    user?.role === 'LEASING_MANAGER' &&
    ['MAINTENANCE', 'GENERAL', 'KEY_LOCK_CHANGE', 'NEIGHBOR_COMPLAINT'].includes(data.type) &&
    !['DRAFT', 'CLOSED', 'ACCEPTED', 'REJECTED', 'RESOLVED'].includes(data.status);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const response = await api.post<CaseRecord>('/requests/' + data.id + '/deadline', {
        clientId: key,
        expectedVersion: version,
        dueAt: date ? new Date(date + 'Z').toISOString() : null,
        reason,
      });
      client.setQueryData(['request', data.id], response.data);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['requests'] }),
        client.invalidateQueries({ queryKey: ['dashboard'] }),
      ]);
      setOpen(false);
      setReason('');
      setConflict(false);
      setKey(crypto.randomUUID());
    } catch (cause) {
      setFieldErrors(validationFields(cause));

      setError(requestError(cause, 'Deadline update failed. Retry.'));
      if (isAxiosError(cause) && cause.response?.status === 409) setConflict(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <FormFieldErrors value={fieldErrors}>
      <section className="space-y-3 rounded-md border p-4" aria-labelledby="response-deadline">
        <h2 id="response-deadline" className="font-semibold">
          Response deadline
        </h2>
        <p>
          {data.decisionDueAt
            ? caseDate(data.decisionDueAt) + ' (Asia/Dubai)'
            : 'No deadline recorded.'}
        </p>
        <p className="text-sm text-muted-foreground">
          This deadline does not approve, reject, or close the case automatically.
        </p>
        {permitted && !open && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setOpen(true);
              setVersion(data.version);
              setDate(data.decisionDueAt?.slice(0, 16) ?? '');
              setKey(crypto.randomUUID());
            }}
          >
            Set response deadline
          </Button>
        )}
        {permitted && open && (
          <form onSubmit={submit} className="grid max-w-lg gap-3">
            <Label htmlFor="case-deadline-date">Deadline (UTC; leave empty to remove)</Label>
            <Input
              id="case-deadline-date"
              name="dueAt"
              type="datetime-local"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              disabled={busy}
            />
            <Label htmlFor="case-deadline-reason">Reason</Label>
            <Input
              id="case-deadline-reason"
              name="reason"
              required
              minLength={3}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              disabled={busy}
            />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {conflict && (
              <Button
                type="button"
                variant="outline"
                onClick={async () => {
                  setBusy(true);
                  try {
                    const response = await api.get<CaseRecord>('/requests/' + data.id);
                    client.setQueryData(['request', data.id], response.data);
                    setVersion(response.data.version);
                    setKey(crypto.randomUUID());
                    setConflict(false);
                    setError('Review the latest case, then submit again.');
                  } catch (cause) {
                    setError(requestError(cause, 'Unable to load the latest case. Retry.'));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Load latest case
              </Button>
            )}
            <div className="flex gap-2">
              <Button disabled={busy || conflict}>Save deadline</Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        )}
      </section>
    </FormFieldErrors>
  );
}
