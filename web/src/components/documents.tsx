import { useId, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosInstance } from 'axios';
import { isAxiosError } from 'axios';
import { api } from '../api';
import { previewMode } from '../session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QueryFeedback } from '@/components/query-feedback';

type Document = {
  id: string;
  seriesId: string;
  version: number;
  title: string;
  mimeType: string;
  availability: string;
  expiresAt: string | null;
  originalSize: number;
  fileSize: number | null;
  fileHash: string | null;
  failureCode: string | null;
  retryCount: number;
  createdAt: string;
  canReplace: boolean;
};
type Policy = { enabled: boolean; maxBytes: number; mimeTypes: string[] };
const labels: Record<string, string> = {
  QUARANTINED: 'Scan queued',
  SCANNING: 'Scan active',
  CLEAN: 'Available',
  REJECTED: 'File rejected',
  FAILED: 'Scan failed',
  EXPIRED: 'Expired',
};
function errorText(cause: unknown) {
  if (!isAxiosError(cause)) return 'The request failed. Retry.';
  const data = cause.response?.data;
  return (
    (typeof data?.message === 'string' ? data.message : 'The request failed. Retry.') +
    (typeof data?.requestId === 'string' ? ' Reference: ' + data.requestId : '')
  );
}
export function Documents({
  purpose,
  targetId,
  heading = 'Private documents',
  readOnly = false,
  transport = api,
}: {
  purpose: string;
  targetId: string;
  heading?: string;
  readOnly?: boolean;
  transport?: AxiosInstance;
}) {
  const uid = useId(),
    client = useQueryClient();
  const documentKey = transport === api ? 'documents' : 'account-documents';
  const [page, setPage] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [replacement, setReplacement] = useState<Document | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const submission = useRef({
    signature: '',
    clientId: crypto.randomUUID(),
    file: null as File | null,
  });
  const policy = useQuery({
    queryKey: ['document-policy', documentKey],
    enabled: !previewMode,
    queryFn: ({ signal }) =>
      transport.get<Policy>('/documents/policy', { signal }).then((response) => response.data),
    retry: false,
  });
  const query = useQuery({
    queryKey: [documentKey, purpose, targetId, page],
    enabled: !previewMode && policy.data?.enabled === true,
    queryFn: ({ signal }) =>
      transport
        .get<{ items: Document[]; total: number; pageSize: number }>('/documents', {
          params: { purpose, targetId, page },
          signal,
        })
        .then((response) => response.data),
    refetchInterval: (state) =>
      state.state.data?.items?.some((row) => ['QUARANTINED', 'SCANNING'].includes(row.availability))
        ? 2000
        : false,
  });
  async function execute(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    const form = new FormData(formRef.current!);
    const file = (formRef.current!.elements.namedItem('file') as HTMLInputElement).files?.[0];
    if (!(file instanceof File) || !file.size) {
      setError('Choose a file.');
      return;
    }
    if (file.size > (policy.data?.maxBytes ?? 0)) {
      setError('The file exceeds the upload limit.');
      return;
    }
    const title = String(form.get('title') ?? '').trim(),
      expiresAt = String(form.get('expiresAt') ?? '') || null;
    const signature = JSON.stringify({ title, expiresAt, seriesId: replacement?.seriesId });
    if (submission.current.signature !== signature || submission.current.file !== file)
      submission.current = { signature, file, clientId: crypto.randomUUID() };
    const body = new FormData();
    body.set(
      'metadata',
      JSON.stringify({
        purpose,
        targetId,
        title,
        expiresAt,
        clientId: submission.current.clientId,
        ...(replacement ? { seriesId: replacement.seriesId } : {}),
      }),
    );
    body.set('file', file);
    await execute(async () => {
      // Axios sets the multipart boundary from FormData.
      await transport.post('/documents', body);
      formRef.current?.reset();
      setReplacement(null);
      setPage(1);
      submission.current = { signature: '', clientId: crypto.randomUUID(), file: null };
      await client.invalidateQueries({ queryKey: [documentKey, purpose, targetId] });
      if (purpose === 'CASE_EVIDENCE') {
        await client.invalidateQueries({ queryKey: ['request', targetId] });
        await client.invalidateQueries({ queryKey: ['requests'] });
      }
      setSuccess('Upload saved. Download requires a successful scan.');
    });
  }
  async function download(row: Document) {
    const grant = await transport.post<{ token: string }>(`/documents/${row.id}/grant`, {});
    const response = await transport.get<Blob>(`/documents/${row.id}/file`, {
      responseType: 'blob',
      headers: { 'X-File-Grant': grant.data.token },
    });
    const url = URL.createObjectURL(response.data),
      link = document.createElement('a');
    link.href = url;
    link.download = `document-${row.id}.${row.mimeType === 'image/png' ? 'png' : row.mimeType === 'image/jpeg' ? 'jpg' : 'pdf'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-4 border-t pt-5" aria-labelledby={uid + '-heading'}>
      <h2 id={uid + '-heading'} className="text-lg font-semibold">
        {heading}
      </h2>
      {previewMode ? (
        <p className="text-sm text-muted-foreground">
          Private files require the live API and a virus scanner.
        </p>
      ) : policy.isPending ? (
        <QueryFeedback pending onRetry={() => void policy.refetch()} />
      ) : policy.error ? (
        <QueryFeedback pending={false} onRetry={() => void policy.refetch()} />
      ) : !policy.data?.enabled ? (
        <p className="text-sm text-muted-foreground">
          Private files are not enabled on this server.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            JPEG, PNG, PDF. Maximum {Math.round(policy.data.maxBytes / 1024 / 1024)} MB. Files stay
            private. Previous versions remain available.
          </p>
          {!readOnly && (
            <form
              ref={formRef}
              onSubmit={(event) => void upload(event)}
              className="grid gap-4 rounded-md border p-4 sm:grid-cols-2"
              aria-label={heading + ' upload'}
            >
              {replacement && (
                <p className="break-words sm:col-span-2" role="status">
                  New version of {replacement.title}. Earlier versions remain intact.
                </p>
              )}
              <div className="space-y-2">
                <Label htmlFor={uid + '-title'}>Document title</Label>
                <Input id={uid + '-title'} name="title" required maxLength={150} disabled={busy} />
              </div>
              <div className="space-y-2">
                <Label htmlFor={uid + '-expiry'}>Expiry date (optional)</Label>
                <Input id={uid + '-expiry'} name="expiresAt" type="date" disabled={busy} />
                <p className="text-xs text-muted-foreground">
                  Download stops at 00:00 UTC on this date.
                </p>
              </div>
              <div className="min-w-0 space-y-2 sm:col-span-2">
                <Label htmlFor={uid + '-file'}>File</Label>
                <Input
                  id={uid + '-file'}
                  name="file"
                  type="file"
                  required
                  accept="image/jpeg,image/png,application/pdf"
                  disabled={busy}
                />
              </div>
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <Button disabled={busy} type="submit">
                  {busy
                    ? 'Please wait'
                    : replacement
                      ? 'Upload new version'
                      : 'Upload private file'}
                </Button>
                {replacement && (
                  <Button
                    variant="outline"
                    type="button"
                    disabled={busy}
                    onClick={() => setReplacement(null)}
                  >
                    Cancel new version
                  </Button>
                )}
              </div>
            </form>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {success && (
            <p role="status" className="text-sm">
              {success}
            </p>
          )}
          {query.isPending || query.error ? (
            <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
          ) : !query.data?.items.length ? (
            <p className="text-sm text-muted-foreground">No documents.</p>
          ) : (
            <>
              <ul className="space-y-3">
                {query.data.items.map((row) => (
                  <li key={row.id} className="min-w-0 space-y-2 rounded-md border p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="break-words">{row.title}</strong>
                      <Badge variant="outline">Version {row.version}</Badge>
                      <Badge
                        variant={
                          ['FAILED', 'REJECTED', 'EXPIRED'].includes(row.availability)
                            ? 'destructive'
                            : 'secondary'
                        }
                      >
                        {labels[row.availability] ?? row.availability}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {row.mimeType} · {row.fileSize ?? row.originalSize} bytes ·{' '}
                      {new Date(row.createdAt).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' })}{' '}
                      Asia/Dubai
                    </p>
                    {row.expiresAt && (
                      <p className="text-sm">Expiry: {row.expiresAt.slice(0, 10)} UTC</p>
                    )}
                    {row.failureCode && (
                      <p className="text-sm" role="status">
                        {row.failureCode.replaceAll('_', ' ')}.{' '}
                        {row.availability === 'REJECTED'
                          ? 'Choose a safe file and upload a new version.'
                          : 'Retry after the scanner recovers.'}
                      </p>
                    )}
                    {row.fileHash && (
                      <details className="text-xs">
                        <summary className="cursor-pointer">Integrity hash</summary>
                        <p className="break-all">SHA-256: {row.fileHash}</p>
                      </details>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        disabled={busy || row.availability !== 'CLEAN'}
                        onClick={() => void execute(() => download(row))}
                      >
                        Download
                      </Button>
                      {!readOnly && row.canReplace && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setReplacement(row);
                            formRef.current?.scrollIntoView?.({ block: 'center' });
                          }}
                        >
                          New version
                        </Button>
                      )}
                      {row.canReplace && row.availability === 'FAILED' && row.retryCount < 3 && (
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void execute(async () => {
                              await transport.post(`/documents/${row.id}/retry`, {
                                expectedRetryCount: row.retryCount,
                              });
                              await client.invalidateQueries({
                                queryKey: [documentKey, purpose, targetId],
                              });
                            })
                          }
                        >
                          Retry scan
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant="outline"
                  disabled={page === 1 || busy}
                  onClick={() => setPage(page - 1)}
                >
                  Previous documents
                </Button>
                <span className="text-sm">
                  Page {page} of {Math.max(1, Math.ceil(query.data.total / query.data.pageSize))}
                </span>
                <Button
                  variant="outline"
                  disabled={page * query.data.pageSize >= query.data.total || busy}
                  onClick={() => setPage(page + 1)}
                >
                  Next documents
                </Button>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
