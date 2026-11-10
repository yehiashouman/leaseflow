import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { caseDate } from '../cases';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryFeedback } from '@/components/query-feedback';
type Tenant = {
  id: string;
  fullName: string;
  nationality?: string;
  gender?: string;
  emiratesIdExpiry?: string;
  user: { email: string; phone?: string; status: string; phoneVerifiedAt?: string };
  contracts?: {
    id: string;
    status: string;
    startDate: string;
    rentalSpace: { name: string; unit: { name: string } };
  }[];
};
export function Tenants() {
  const [q, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ['tenants', q, page],
    queryFn: ({ signal }) =>
      api
        .get<{ items: Tenant[]; total: number }>('/tenants', { params: { q, page }, signal })
        .then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Tenants</h1>
      <Input
        className="max-w-sm"
        type="search"
        aria-label="Search tenants"
        placeholder="Search tenants"
        maxLength={150}
        value={q}
        onChange={(event) => {
          setQuery(event.target.value);
          setPage(1);
        }}
      />
      {query.isPending || query.error || !query.data ? (
        <QueryFeedback
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Phone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link className="text-primary underline" to={'/tenants/' + item.id}>
                      {item.fullName}
                    </Link>
                  </TableCell>
                  <TableCell>{item.user.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.user.status.replaceAll('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    {item.user.phoneVerifiedAt ? item.user.phone : 'Not verified'}
                  </TableCell>
                </TableRow>
              ))}
              {!query.data.items.length && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    No tenants
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <div className="flex justify-between gap-3">
            <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={page * 20 >= query.data.total}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
export function TenantDetail() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['tenant', id],
    queryFn: ({ signal }) =>
      api.get<Tenant>('/tenants/' + id, { signal }).then((response) => response.data),
  });
  if (query.isPending || query.error || !query.data)
    return (
      <QueryFeedback
        pending={query.isPending}
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  const data = query.data;
  return (
    <div className="space-y-6">
      <Link className="text-sm text-primary underline" to="/tenants">
        Back to tenants
      </Link>
      <h1 className="text-2xl font-semibold break-words">{data.fullName}</h1>
      <Badge variant="secondary">{data.user.status.replaceAll('_', ' ')}</Badge>
      <dl className="grid gap-4 border-y py-4 sm:grid-cols-2">
        {[
          ['Email', data.user.email],
          ['Verified phone', data.user.phoneVerifiedAt ? data.user.phone : 'Not verified'],
          ['Nationality', data.nationality],
          ['Gender', data.gender],
          ['Emirates ID expiry', caseDate(data.emiratesIdExpiry)],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">{value || '-'}</dd>
          </div>
        ))}
      </dl>
      <h2 className="text-lg font-semibold">Contracts</h2>
      <ul className="divide-y">
        {data.contracts?.map((contract) => (
          <li className="space-y-2 py-4" key={contract.id}>
            <Link
              className="block break-words text-primary underline"
              to={'/contracts/' + contract.id}
            >
              {contract.rentalSpace.unit.name} / {contract.rentalSpace.name}
            </Link>
            <Badge variant="outline">{contract.status.replaceAll('_', ' ')}</Badge>
            <p className="text-sm text-muted-foreground">{caseDate(contract.startDate)}</p>
          </li>
        ))}
      </ul>
      {!data.contracts?.length && <p className="text-muted-foreground">No contracts</p>}
    </div>
  );
}
