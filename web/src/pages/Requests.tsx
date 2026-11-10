import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { QueryFeedback } from '@/components/query-feedback';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CaseEditor } from '@/components/case-editor';
import { useAuth } from '../auth';
import { caseStatuses, caseTypes, type CaseRecord } from '../cases';

export function Requests() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['requests', status, type, search],
    queryFn: ({ signal }) =>
      api
        .get<CaseRecord[]>('/requests', {
          params: { status: status || undefined, type: type || undefined, q: search },
          signal,
        })
        .then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Requests</h1>
        <div className="flex items-center gap-2">
          {!isPending && !error && <Badge variant="secondary">{data.length} requests</Badge>}
          {user?.role === 'TENANT' && <Button onClick={() => setOpen(true)}>New request</Button>}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          type="search"
          aria-label="Search requests"
          placeholder="Search requests"
          maxLength={150}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
          aria-label="Request status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">All statuses</option>
          {Object.entries(caseStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Request type filter"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">All types</option>
          {Object.entries(caseTypes).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-3">
          {data.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-56 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {caseTypes[request.type] ?? request.type.replaceAll('_', ' ')}
                  </p>
                  <h2 className="break-words font-semibold">
                    <Link to={'/requests/' + request.id} className="text-primary underline">
                      {request.title}
                    </Link>
                  </h2>
                  <p className="line-clamp-3 break-words text-sm text-muted-foreground">
                    {request.description}
                  </p>
                </div>
                <Badge variant="outline" className="max-w-full whitespace-normal">
                  {caseStatuses[request.status] ?? request.status.replaceAll('_', ' ')}
                </Badge>
              </CardContent>
            </Card>
          ))}
          {!data.length && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Inbox className="size-7" aria-hidden="true" />
              <p>No requests</p>
            </div>
          )}
        </div>
      )}
      {open && (
        <CaseEditor
          onClose={() => setOpen(false)}
          onCreated={(id) => {
            setOpen(false);
            navigate('/requests/' + id);
          }}
        />
      )}
    </div>
  );
}
