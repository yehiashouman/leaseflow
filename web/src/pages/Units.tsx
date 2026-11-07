import { useQuery } from '@tanstack/react-query';
import { Building2, Plus } from 'lucide-react';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryFeedback } from '@/components/query-feedback';

type Unit = {
  id: string;
  name: string;
  building?: string;
  area: string;
  landlord?: { name: string };
  spaces: { id: string }[];
  active: boolean;
};

export function Units() {
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['units'],
    queryFn: () => api.get<Unit[]>('/inventory/units').then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Units</h1>
        <Button disabled title="Unit creation is not implemented.">
          <Plus aria-hidden="true" />
          Add unit
        </Button>
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} onRetry={() => void refetch()} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Unit</TableHead>
                <TableHead>Area</TableHead>
                <TableHead>Landlord</TableHead>
                <TableHead>Spaces</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((unit) => (
                <TableRow key={unit.id}>
                  <TableCell>
                    <span className="font-medium">{unit.name}</span>
                    <span className="block text-xs text-muted-foreground">{unit.building}</span>
                  </TableCell>
                  <TableCell>{unit.area}</TableCell>
                  <TableCell>{unit.landlord?.name ?? '-'}</TableCell>
                  <TableCell>{unit.spaces.length}</TableCell>
                  <TableCell>
                    <Badge variant={unit.active ? 'default' : 'secondary'}>
                      {unit.active ? 'Active' : 'Information complete'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.length && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
              <Building2 className="size-7" aria-hidden="true" />
              <p>No units yet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
