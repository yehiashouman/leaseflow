import { useState } from 'react';
import { ContractEditor } from '@/components/contract-editor';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
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
import { useAuth } from '../auth';

type Contract = {
  id: string;
  tenant?: { fullName: string };
  rentalSpace: { name: string; unit: { name: string } };
  currency: string;
  monthlyRent: string | number;
  dueDay: number;
  status: string;
};

export function Contracts() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.get<Contract[]>('/contracts').then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Contracts</h1>
        {user?.role === 'LEASING_MANAGER' && (
          <Button onClick={() => setOpen(true)}>
            <Plus aria-hidden="true" />
            Create contract
          </Button>
        )}
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Space</TableHead>
                <TableHead>Monthly rent</TableHead>
                <TableHead>Due day</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>{contract.tenant?.fullName ?? 'Tenant'}</TableCell>
                  <TableCell>
                    <Link className="text-primary underline" to={'/contracts/' + contract.id}>
                      {contract.rentalSpace.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {contract.rentalSpace.unit.name}
                    </span>
                  </TableCell>
                  <TableCell>
                    {contract.currency} {Number(contract.monthlyRent).toLocaleString()}
                  </TableCell>
                  <TableCell>{contract.dueDay}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{contract.status.replaceAll('_', ' ')}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!data.length && (
            <div className="flex min-h-48 flex-col items-center justify-center gap-3 text-muted-foreground">
              <FileText className="size-7" aria-hidden="true" />
              <p>No contracts</p>
            </div>
          )}
        </>
      )}
      {open && (
        <ContractEditor
          onClose={() => setOpen(false)}
          onCreated={(id) => {
            setOpen(false);
            navigate('/contracts/' + id);
          }}
        />
      )}
    </div>
  );
}
