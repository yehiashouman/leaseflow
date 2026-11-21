import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

type Preview = {
  desiredDate: string;
  earliestPenaltyFreeDate: string;
  noticeDays: number;
  missingDays: number;
  currency: string;
  held: string;
  reserved: string;
  proposedDeduction: string;
  projectedRefund: string;
};

export function MoveOutNotice({ contractId }: { contractId: string }) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState<{ preview: Preview; fingerprint: string } | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useRef('');
  const navigate = useNavigate();
  const client = useQueryClient();
  const path = '/contracts/' + encodeURIComponent(contractId) + '/move-out';
  async function submit() {
    setBusy(true);
    setError('');
    try {
      if (!preview) {
        const response = await api.post<{ preview: Preview; fingerprint: string }>(
          path + '/preview',
          { desiredDate: date },
        );
        setPreview(response.data);
        setAcknowledged(false);
        id.current = crypto.randomUUID();
      } else if (acknowledged) {
        const response = await api.post<{ requestId: string }>(path, {
          desiredDate: date,
          explanation: notes,
          fingerprint: preview.fingerprint,
          clientId: id.current,
          acknowledged,
        });
        await Promise.all([
          client.invalidateQueries({ queryKey: ['requests'] }),
          client.invalidateQueries({ queryKey: ['dashboard'] }),
          client.invalidateQueries({ queryKey: ['contract-records', contractId] }),
        ]);
        navigate('/requests/' + encodeURIComponent(response.data.requestId));
      }
    } catch (cause) {
      const detail = isAxiosError<{ message?: string }>(cause)
        ? cause.response?.data?.message
        : undefined;
      setError(detail ?? 'Could not save the move-out notice.');
    } finally {
      setBusy(false);
    }
  }
  const summary = preview?.preview;
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Prepare move-out notice
      </Button>
    );
  return (
    <form
      className="space-y-4 rounded-md border p-4"
      aria-label="Move-out notice"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold">Move-out notice</h2>
      <div>
        <Label htmlFor="move-out-date">Desired move-out date (Dubai)</Label>
        <Input
          id="move-out-date"
          type="date"
          value={date}
          required
          disabled={busy}
          onChange={(event) => {
            setDate(event.currentTarget.value);
            setPreview(null);
            setAcknowledged(false);
          }}
        />
      </div>
      <div>
        <Label htmlFor="move-out-explanation">Explanation</Label>
        <textarea
          className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
          id="move-out-explanation"
          value={notes}
          required
          disabled={busy}
          minLength={3}
          maxLength={5000}
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
      </div>
      {summary && (
        <>
          <dl className="grid grid-cols-2 gap-3">
            {[
              ['Earliest penalty-free date', summary.earliestPenaltyFreeDate + ' (Dubai)'],
              ['Notice period', summary.noticeDays + ' days'],
              ['Missing notice', summary.missingDays + ' days'],
              ['Deposit held', summary.currency + ' ' + summary.held],
              ['Reserved deductions', summary.currency + ' ' + summary.reserved],
              ['Projected notice deduction', summary.currency + ' ' + summary.proposedDeduction],
              [
                'Projected refund after this deduction',
                summary.currency + ' ' + summary.projectedRefund,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              disabled={busy}
              required
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.currentTarget.checked)}
            />
            I reviewed the notice dates and projected deposit amounts.
          </label>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy || (!!summary && !acknowledged)}>
          {summary ? 'Submit move-out notice' : 'Preview notice'}
        </Button>
        {summary && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setPreview(null);
              setAcknowledged(false);
            }}
          >
            Refresh preview
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError('');
            setPreview(null);
            setAcknowledged(false);
          }}
        >
          Close
        </Button>
      </div>
    </form>
  );
}
