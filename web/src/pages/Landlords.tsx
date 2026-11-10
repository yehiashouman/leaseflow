import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
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
import { LandlordEditor } from '@/components/landlord-editor';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export type Landlord = {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  notes?: string;
  preferredContactMethod?: string | null;
  archivedAt?: string | null;
  units?: { id: string; name: string; area: string; active: boolean }[];
  _count?: { units: number };
};
export function Landlords() {
  const [editor, setEditor] = useState<Landlord | 'new' | null>(null);
  const [status, setStatus] = useState('ACTIVE');
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
    queryKey: ['landlords', status, search],
    queryFn: ({ signal }) =>
      api
        .get<Landlord[]>('/inventory/landlords', { params: { status, q: search }, signal })
        .then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Landlords</h1>
        <Button onClick={() => setEditor('new')}>Add landlord</Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          type="search"
          aria-label="Search landlords"
          placeholder="Search landlords"
          maxLength={150}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Landlord status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} error={error} onRetry={() => void refetch()} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <Link to={'/landlords/' + item.id} className="font-medium text-primary underline">
                    {item.name}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{item.companyName}</span>
                </TableCell>
                <TableCell>{item.email || '-'}</TableCell>
                <TableCell>{item.phone || '-'}</TableCell>
                <TableCell>{item._count?.units ?? 0}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{item.archivedAt ? 'Archived' : 'Active'}</Badge>
                </TableCell>
                <TableCell>
                  {!item.archivedAt && (
                    <Button variant="ghost" size="sm" onClick={() => setEditor(item)}>
                      Edit<span className="sr-only"> {item.name}</span>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {!data.length && (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {query || status !== 'ACTIVE' ? 'No matching landlords' : 'No landlords yet'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {editor && (
        <LandlordEditor
          key={editor === 'new' ? 'new' : editor.id}
          landlord={editor}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
