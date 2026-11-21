import { ListPager, ListSort, type ListPage } from '@/components/list-controls';
import { useEffect, useState } from 'react';
import { ContractEditor } from '@/components/contract-editor';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Plus } from 'lucide-react';
import { api } from '../api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  offeredAt?: string | null;
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
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    if (query === search) return;
    const timer = window.setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, search]);
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('NEWEST');
  const {
    data: result,
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['contracts', status, search, sort, page],
    queryFn: ({ signal }) =>
      api
        .get<ListPage<Contract>>('/contracts', {
          params: { status: status || undefined, q: search, sort, page },
          signal,
        })
        .then((response) => response.data),
  });
  const data = result?.items ?? [];
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
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          type="search"
          aria-label="Search contracts"
          placeholder="Search tenant, unit, or space"
          maxLength={150}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Contract status"
          className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {['DRAFT', 'ACTIVE', 'TRANSFER_PENDING', 'MOVE_OUT_PENDING', 'CLOSED', 'CANCELLED'].map(
            (value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ),
          )}
        </select>
        <ListSort
          label="Sort contracts"
          value={sort}
          options={[
            ['NEWEST', 'Newest start date first'],
            ['OLDEST', 'Oldest start date first'],
          ]}
          onChange={(value) => {
            setSort(value);
            setPage(1);
          }}
        />
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
                    <Badge variant="secondary">
                      {contract.status === 'DRAFT' && contract.offeredAt
                        ? 'Awaiting tenant confirmation'
                        : contract.status.replaceAll('_', ' ')}
                    </Badge>
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
      {!isPending && !error && result && (
        <ListPager page={page} total={result.total} pageSize={result.pageSize} onChange={setPage} />
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
