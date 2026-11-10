import { requestError } from '../api-errors';
import { AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export function QueryFeedback({
  pending,
  onRetry,
  error,
}: {
  pending: boolean;
  onRetry: () => void;
  error?: unknown;
}) {
  if (pending)
    return (
      <div role="status" aria-label="Load records" className="grid gap-3">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <span className="sr-only">Please wait.</span>
      </div>
    );
  return (
    <Alert variant="destructive">
      <AlertCircle aria-hidden="true" />
      <AlertTitle>Unable to load records</AlertTitle>
      <AlertDescription>
        <p>{requestError(error, 'The request failed. Please try again.')}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function CachedQueryNotice({ error, onRetry }: { error?: unknown; onRetry: () => void }) {
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>Latest refresh failed</AlertTitle>
      <AlertDescription>
        <p>Your draft stays available.</p>
        <p>{requestError(error)}</p>
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          Retry refresh
        </Button>
      </AlertDescription>
    </Alert>
  );
}
