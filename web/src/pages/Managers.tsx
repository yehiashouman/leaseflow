import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { requestError } from '../api-errors';
import { caseDate, caseDateWithZone } from '../cases';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { QueryFeedback } from '@/components/query-feedback';

type Manager = {
  id: string;
  email: string;
  phone?: string;
  status: string;
  createdAt: string;
  emailVerifiedAt?: string;
  phoneVerifiedAt?: string;
  leasingManager?: {
    fullName: string;
    nationality?: string;
    dateOfBirth?: string;
    emiratesIdNumber?: string;
    emiratesIdExpiry?: string;
    licenseType?: string;
    licenseIssuer?: string;
    licenseNumber?: string;
    licenseExpiry?: string;
    declarationAcceptedAt?: string;
  };
  history?: Audit[];
};
type Audit = {
  id: string;
  actorUserId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  createdAt: string;
};
type PageData<T> = { items: T[]; total: number; page: number; pageSize: number };
type ManagerPage = PageData<Manager> & { demoManagerCreation: boolean };
function Pager({
  page,
  total,
  onChange,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-sm text-muted-foreground">
        {total} records / Page {page}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page === 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button variant="outline" disabled={page * 20 >= total} onClick={() => onChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
export function Managers() {
  const [status, setStatus] = useState('PENDING_APPROVAL');
  const [q, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createdEmail, setCreatedEmail] = useState('');
  const client = useQueryClient();
  const query = useQuery<ManagerPage>({
    queryKey: ['managers', status, q, page],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api
        .get<ManagerPage>('/admin/managers', {
          params: { status: status || undefined, q, page },
          signal,
        })
        .then((response) => response.data),
  });
  async function createManager(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    setCreating(true);
    setCreateError('');
    setCreatedEmail('');
    try {
      const { data } = await api.post<Manager>('/admin/managers', {
        fullName: fields.get('fullName'),
        email: fields.get('email'),
        password: fields.get('password'),
      });
      form.reset();
      setCreatedEmail(data.email);
      setStatus('ACTIVE');
      setQuery('');
      setPage(1);
      await client.invalidateQueries({ queryKey: ['managers'] });
    } catch (cause) {
      setCreateError(requestError(cause, 'Could not create the manager account.'));
    } finally {
      setCreating(false);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Account review</h1>
      <p className="text-sm text-muted-foreground">
        Approval activates platform access. It does not certify legal sufficiency or property
        authorization.
      </p>
      {query.data?.demoManagerCreation && (
        <details className="rounded-md border p-4">
          <summary className="cursor-pointer font-medium">Create leasing manager</summary>
          <form className="mt-4 grid max-w-sm gap-3" onSubmit={createManager}>
            <p className="text-sm text-muted-foreground">
              The manager can sign in immediately with this demo account.
            </p>
            <Label htmlFor="manager-name">Full name</Label>
            <Input id="manager-name" name="fullName" required minLength={2} maxLength={150} />
            <Label htmlFor="manager-email">Email</Label>
            <Input id="manager-email" name="email" type="email" required maxLength={191} />
            <Label htmlFor="manager-password">Password</Label>
            <Input
              id="manager-password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
            />
            <Button disabled={creating}>Create manager account</Button>
            {createError && <p role="alert">{createError}</p>}
            {createdEmail && <p role="status">Manager account ready. Sign in as {createdEmail}.</p>}
          </form>
        </details>
      )}
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-sm"
          type="search"
          aria-label="Search managers"
          placeholder="Search managers"
          maxLength={150}
          value={q}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="h-9 rounded-md border bg-background px-3 text-sm"
          aria-label="Account status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {[
            'PENDING_EMAIL',
            'PENDING_PHONE',
            'PENDING_APPROVAL',
            'ACTIVE',
            'REJECTED',
            'SUSPENDED',
          ].map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </div>
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
                <TableHead>Manager</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Identity signals</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>
                    <Link className="text-primary underline" to={'/admin/managers/' + item.id}>
                      {item.leasingManager?.fullName || item.email}
                    </Link>
                  </TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{item.status.replaceAll('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>
                    Email: {item.emailVerifiedAt ? 'Confirmed' : 'Not confirmed'}
                    <br />
                    Phone: {item.phoneVerifiedAt ? 'Confirmed' : 'Not confirmed'}
                  </TableCell>
                </TableRow>
              ))}
              {!query.data.items.length && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center text-muted-foreground">
                    No accounts
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
export function ManagerDetail() {
  const { id } = useParams();
  const query = useQuery({
    queryKey: ['manager', id],
    queryFn: ({ signal }) =>
      api.get<Manager>('/admin/managers/' + id, { signal }).then((response) => response.data),
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
  const profile = data.leasingManager;
  return (
    <div className="space-y-6">
      <Link className="text-sm text-primary underline" to="/admin/managers">
        Back to accounts
      </Link>
      <h1 className="text-2xl font-semibold break-words">{profile?.fullName || data.email}</h1>
      <p className="text-sm text-muted-foreground">
        Approval activates platform access. It does not certify legal sufficiency or property
        authorization.
      </p>
      <Badge variant="secondary">{data.status.replaceAll('_', ' ')}</Badge>
      <dl className="grid gap-5 border-y py-5 sm:grid-cols-2">
        {[
          ['Email', data.email],
          ['Phone', data.phone],
          [
            'Email confirmation',
            data.emailVerifiedAt ? caseDateWithZone(data.emailVerifiedAt) : 'Not confirmed',
          ],
          [
            'Phone confirmation',
            data.phoneVerifiedAt ? caseDateWithZone(data.phoneVerifiedAt) : 'Not confirmed',
          ],
          ['Nationality', profile?.nationality],
          [
            'Date of birth',
            profile?.dateOfBirth ? caseDate(profile.dateOfBirth).split(',')[0] : '-',
          ],
          ['Emirates ID', profile?.emiratesIdNumber],
          ['Emirates ID expiry', caseDateWithZone(profile?.emiratesIdExpiry)],
          ['Licence type', profile?.licenseType],
          ['Licence issuer', profile?.licenseIssuer],
          ['Licence number', profile?.licenseNumber],
          ['Licence expiry', caseDateWithZone(profile?.licenseExpiry)],
          [
            'Declaration accepted',
            profile?.declarationAcceptedAt
              ? caseDateWithZone(profile.declarationAcceptedAt)
              : 'Not recorded',
          ],
          ['Documents', 'Document review not implemented'],
          ['Account decisions', 'MFA and policy approval required'],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">{value || '-'}</dd>
          </div>
        ))}
      </dl>
      <h2 className="text-lg font-semibold">Account history</h2>
      <ul className="space-y-3">
        {data.history?.map((event) => (
          <li key={event.id} className="border-b pb-3">
            <p className="break-words">
              {event.action} / {event.actorUserId || 'System'}
            </p>
            <time className="text-sm text-muted-foreground">
              {caseDateWithZone(event.createdAt)}
            </time>
          </li>
        ))}
      </ul>
      {!data.history?.length && (
        <p className="text-muted-foreground">No recorded moderation events</p>
      )}
    </div>
  );
}
export function AdminAudit() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const query = useQuery({
    queryKey: ['audit', page, entityType, action],
    queryFn: ({ signal }) =>
      api
        .get<PageData<Audit>>('/admin/audit', {
          params: { page, entityType: entityType || undefined, action: action || undefined },
          signal,
        })
        .then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Audit history</h1>
      <div className="flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          aria-label="Audit resource"
          placeholder="Resource"
          value={entityType}
          maxLength={100}
          onChange={(event) => {
            setEntityType(event.target.value);
            setPage(1);
          }}
        />
        <Input
          className="max-w-xs"
          aria-label="Audit action"
          placeholder="Action"
          value={action}
          maxLength={100}
          onChange={(event) => {
            setAction(event.target.value);
            setPage(1);
          }}
        />
      </div>
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
                <TableHead>Time (Asia/Dubai)</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Actor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{caseDate(item.createdAt)}</TableCell>
                  <TableCell>{item.action}</TableCell>
                  <TableCell>
                    {item.entityType}
                    <span className="block text-xs">{item.entityId}</span>
                  </TableCell>
                  <TableCell>{item.actorUserId || 'System'}</TableCell>
                </TableRow>
              ))}
              {!query.data.items.length && (
                <TableRow>
                  <TableCell colSpan={4} className="h-32 text-center">
                    No audit events
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          <Pager page={page} total={query.data.total} onChange={setPage} />
        </>
      )}
    </div>
  );
}
