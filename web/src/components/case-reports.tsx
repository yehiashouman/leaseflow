import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { Download, FileJson, RotateCcw } from 'lucide-react';
import { api } from '../api';
import { caseDate } from '../cases';
import { previewMode } from '../session';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { QueryFeedback } from '@/components/query-feedback';

type Report = {
  id: string;
  status: 'QUEUED' | 'RUNNING' | 'COMPLETE' | 'FAILED';
  expectedVersion: number;
  snapshotHash: string;
  retryCount: number;
  createdAt: string;
  failureCode: string | null;
};
const failures: Record<string, string> = {
  UNSUPPORTED_TEXT: 'The PDF font does not support this text. Download the complete JSON source.',
  REPORT_TOO_LARGE: 'This case exceeds the current report size limit.',
  WORKER_INTERRUPTED: 'Report generation stopped before completion. Retry the job.',
  RENDER_FAILED: 'Report generation failed. Retry the job or download its JSON source.',
};
function message(cause: unknown) {
  return isAxiosError(cause) && !(cause.response?.data instanceof Blob)
    ? (cause.response?.data?.message ?? 'Report request failed. Retry.')
    : 'Report request failed. Retry.';
}
export function CaseReports({ requestId, version }: { requestId: string; version: number }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = useRef({ version, id: crypto.randomUUID() });
  const query = useQuery({
    queryKey: ['reports', requestId, page],
    enabled: !previewMode,
    queryFn: ({ signal }) =>
      api
        .get<{ items: Report[]; total: number; pageSize: number }>('/reports', {
          params: { requestId, page },
          signal,
        })
        .then((response) => response.data),
    refetchInterval: (state) =>
      state.state.data?.items?.some((row) => ['QUEUED', 'RUNNING'].includes(row.status))
        ? 1000
        : false,
  });
  async function command(action: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await client.invalidateQueries({ queryKey: ['reports', requestId] });
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (key.current.version !== version) key.current = { version, id: crypto.randomUUID() };
    await api.post('/reports', { requestId, clientId: key.current.id, expectedVersion: version });
    key.current = { version, id: crypto.randomUUID() };
    setPage(1);
  }
  async function download(row: Report, format: 'file' | 'source') {
    const response = await api.get<Blob>(`/reports/${row.id}/${format}`, { responseType: 'blob' });
    const url = URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = `case-${row.id}.${format === 'file' ? 'pdf' : 'json'}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="space-y-4 border-t pt-5" aria-labelledby="case-exports">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="case-exports" className="text-lg font-semibold">
          Case exports
        </h2>
        <Button
          variant="outline"
          disabled={busy || previewMode}
          title={previewMode ? 'PDF exports require the live API.' : undefined}
          onClick={() => void command(create)}
        >
          Export PDF
        </Button>
      </div>
      {previewMode ? (
        <p className="text-sm text-muted-foreground">PDF exports require the live API.</p>
      ) : (
        <>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {query.isPending || query.error ? (
            <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />
          ) : (
            <>
              {!query.data?.items?.length && (
                <p className="text-sm text-muted-foreground">No exports</p>
              )}
              <ul className="divide-y">
                {query.data?.items?.map((row) => (
                  <li key={row.id} className="space-y-2 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm">
                          Version {row.expectedVersion} · {caseDate(row.createdAt)}
                        </p>
                        <Badge variant={row.status === 'FAILED' ? 'destructive' : 'secondary'}>
                          {row.status}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        {row.status === 'COMPLETE' && (
                          <Button
                            variant="outline"
                            size="icon"
                            title="Download PDF"
                            aria-label="Download PDF"
                            disabled={busy}
                            onClick={() => void command(() => download(row, 'file'))}
                          >
                            <Download />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="icon"
                          title="Download JSON source"
                          aria-label="Download JSON source"
                          disabled={busy}
                          onClick={() => void command(() => download(row, 'source'))}
                        >
                          <FileJson />
                        </Button>
                        {row.status === 'FAILED' && row.retryCount < 3 && (
                          <Button
                            variant="outline"
                            size="icon"
                            title="Retry export"
                            aria-label="Retry export"
                            disabled={busy}
                            onClick={() =>
                              void command(() =>
                                api.post(`/reports/${row.id}/retry`, {
                                  expectedRetryCount: row.retryCount,
                                }),
                              )
                            }
                          >
                            <RotateCcw />
                          </Button>
                        )}
                      </div>
                    </div>
                    {row.failureCode && (
                      <p className="text-sm text-destructive">
                        {failures[row.failureCode] ?? 'Report generation failed.'}
                      </p>
                    )}
                    <p className="break-all text-xs text-muted-foreground">
                      SHA-256: {row.snapshotHash}
                    </p>
                  </li>
                ))}
              </ul>
              {!!query.data?.total && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="outline"
                    disabled={page === 1 || busy}
                    onClick={() => setPage(page - 1)}
                  >
                    Previous exports
                  </Button>
                  <span className="text-sm">
                    Page {page} · {query.data.total} exports
                  </span>
                  <Button
                    variant="outline"
                    disabled={page * query.data.pageSize >= query.data.total || busy}
                    onClick={() => setPage(page + 1)}
                  >
                    Next exports
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
