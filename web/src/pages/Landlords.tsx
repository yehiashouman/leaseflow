import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { RecordEditor, formValues } from '@/components/record-editor';

export type Landlord = {
  id: string;
  name: string;
  companyName?: string;
  email?: string;
  phone?: string;
  whatsapp?: string;
  address?: string;
  notes?: string;
  _count?: { units: number };
};
const fields = [
  { name: 'name', label: 'Name', required: true },
  { name: 'companyName', label: 'Company' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'phone', label: 'Phone', type: 'tel' },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel' },
  { name: 'address', label: 'Address' },
  { name: 'notes', label: 'Notes', maxLength: 5000 },
];
export function Landlords() {
  const client = useQueryClient();
  const [editor, setEditor] = useState<Landlord | 'new' | null>(null);
  const {
    data = [],
    isPending,
    error,
    refetch,
  } = useQuery({
    queryKey: ['landlords'],
    queryFn: () => api.get<Landlord[]>('/inventory/landlords').then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Landlords</h1>
        <Button onClick={() => setEditor('new')}>Add landlord</Button>
      </div>
      {isPending || error ? (
        <QueryFeedback pending={isPending} onRetry={() => void refetch()} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Units</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.email || '-'}</TableCell>
                <TableCell>{item.phone || '-'}</TableCell>
                <TableCell>{item._count?.units ?? 0}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="sm" onClick={() => setEditor(item)}>
                    Edit<span className="sr-only"> {item.name}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {!data.length && (
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No landlords yet
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
      {editor && (
        <RecordEditor
          key={typeof editor === 'string' ? editor : editor.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={editor === 'new' ? 'Add landlord' : 'Edit landlord'}
          fields={fields.map((field) => ({
            ...field,
            value: editor === 'new' ? '' : String(editor[field.name as keyof Landlord] ?? ''),
          }))}
          onSave={async (data) => {
            const body = formValues(
              data,
              fields.map((field) => field.name),
            );
            if (editor === 'new') await api.post('/inventory/landlords', body);
            else await api.patch('/inventory/landlords/' + editor.id, body);
            await client.invalidateQueries({ queryKey: ['landlords'] });
            await client.invalidateQueries({ queryKey: ['units'] });
            await client.invalidateQueries({ queryKey: ['unit'] });
          }}
        />
      )}
    </div>
  );
}
