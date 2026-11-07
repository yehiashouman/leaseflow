import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { QueryFeedback } from '@/components/query-feedback';

type Request = { id: string; type: string; title: string; description: string; status: string };

export function Requests() {
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['requests'],
    queryFn: () => api.get<Request[]>('/requests').then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Requests</h1>
        {!isPending && !error && <Badge variant="secondary">{data.length} total</Badge>}
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} onRetry={() => void refetch()} />
      ) : (
        <div className="grid gap-3">
          {data.map((request) => (
            <Card key={request.id}>
              <CardContent className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-56 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    {request.type.replaceAll('_', ' ')}
                  </p>
                  <h2 className="break-words font-semibold">{request.title}</h2>
                  <p className="break-words text-sm text-muted-foreground">{request.description}</p>
                </div>
                <Badge variant="outline">{request.status.replaceAll('_', ' ')}</Badge>
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
    </div>
  );
}
