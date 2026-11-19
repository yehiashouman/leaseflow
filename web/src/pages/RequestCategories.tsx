import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { QueryFeedback } from '@/components/query-feedback';
import { RecordEditor } from '@/components/record-editor';
import { api } from '../api';
import { caseTypes, type RequestCategory } from '../cases';

const path = '/admin/request-categories';
const typeOptions = ['MAINTENANCE', 'NEIGHBOR_COMPLAINT', 'KEY_LOCK_CHANGE', 'GENERAL'].map(
  (value) => ({ value, label: caseTypes[value] ?? value }),
);

export function RequestCategories() {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<RequestCategory | 'new' | null>(null);
  const category = editor === 'new' ? null : editor;
  const query = useQuery({
    queryKey: ['request-categories', page],
    queryFn: ({ signal }) =>
      api
        .get<{ items: RequestCategory[]; total: number; pageSize: number; editable: boolean }>(
          path,
          {
            params: { page },
            signal,
          },
        )
        .then((response) => response.data),
  });
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Request categories</h1>
        {query.data?.editable && <Button onClick={() => setEditor('new')}>Add category</Button>}
      </header>
      <p className="text-sm text-muted-foreground">
        Active categories appear on new requests. Edits apply to future submissions.
      </p>
      {query.data && !query.data.editable && (
        <p className="text-sm text-muted-foreground">
          Production category edits require administrator MFA.
        </p>
      )}
      {query.isPending || query.error || !query.data ? (
        <QueryFeedback
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          {query.data.items.length ? (
            <ul className="divide-y rounded-lg border bg-card">
              {query.data.items.map((item) => (
                <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium break-words">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {caseTypes[item.type]} · {item.prompt ? 'Has a question' : 'No question'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={item.active ? 'secondary' : 'outline'}>
                      {item.active ? 'Active' : 'Inactive'}
                    </Badge>
                    {query.data?.editable && (
                      <Button variant="outline" size="sm" onClick={() => setEditor(item)}>
                        Edit
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">No request categories on this page.</p>
          )}
          {query.data.total > query.data.pageSize && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                Page {page} of {Math.ceil(query.data.total / query.data.pageSize)}
              </span>
              <Button variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page * query.data.pageSize >= query.data.total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
      {editor && (
        <RecordEditor
          open
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          title={category ? 'Edit category' : 'Add category'}
          fields={[
            {
              name: 'type',
              label: 'Request type',
              value: category?.type ?? 'GENERAL',
              options: typeOptions,
              required: true,
            },
            {
              name: 'name',
              label: 'Category name',
              value: category?.name,
              required: true,
              maxLength: 100,
            },
            {
              name: 'prompt',
              label: 'Question for the tenant',
              value: category?.prompt ?? '',
              maxLength: 200,
            },
            {
              name: 'answerRequired',
              label: 'Require an answer',
              value: String(category?.answerRequired ?? false),
              type: 'checkbox',
            },
            {
              name: 'active',
              label: 'Show on new requests',
              value: String(category?.active ?? true),
              type: 'checkbox',
            },
          ]}
          onSave={async (form) => {
            const body = {
              type: form.get('type'),
              name: form.get('name'),
              prompt: String(form.get('prompt') ?? '').trim() || null,
              answerRequired: form.has('answerRequired'),
              active: form.has('active'),
            };
            if (category)
              await api.patch(path + '/' + category.id, {
                ...body,
                expectedVersion: category.version,
              });
            else await api.post(path, body);
            await client.invalidateQueries({ queryKey: ['request-categories'] });
          }}
        />
      )}
    </div>
  );
}
