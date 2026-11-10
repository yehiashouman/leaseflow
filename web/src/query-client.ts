import { QueryCache, QueryClient, type DefaultOptions } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
export function createQueryClient(
  defaultOptions: DefaultOptions = { queries: { staleTime: 30000, retry: 1 } },
) {
  return new QueryClient({
    defaultOptions,
    queryCache: new QueryCache({
      onError(error, query) {
        if (isAxiosError(error) && [401, 403, 404, 410].includes(error.response?.status ?? 0))
          query.setState({ data: undefined, dataUpdatedAt: 0 });
      },
    }),
  });
}
