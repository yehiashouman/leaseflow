import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { RecordEditor } from '@/components/record-editor';
import { recoverableQueryError } from '../api-errors';
import { QueryFeedback, CachedQueryNotice } from '@/components/query-feedback';
type Data = {
  preferredLanguage: string;
  timezone: string;
  deliveryPreference: string | null;
  profileVersion: number;
  securityNotice: string;
};
export function Preferences() {
  const client = useQueryClient(),
    [editor, setEditor] = useState<Data | null>(null);
  const query = useQuery({
    queryKey: ['preferences'],
    queryFn: ({ signal }) =>
      api.get<Data>('/profile/preferences', { signal }).then((response) => response.data),
  });
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Preferences</h1>
      {query.isPending || !query.data || (query.error && !recoverableQueryError(query.error)) ? (
        <QueryFeedback
          pending={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <>
          <CachedQueryNotice error={query.error} onRetry={() => void query.refetch()} />
          <dl className="space-y-3">
            <div>
              <dt>Notice language</dt>
              <dd>{query.data!.preferredLanguage}</dd>
            </div>
            <div>
              <dt>Preferred timezone</dt>
              <dd>{query.data!.timezone}</dd>
            </div>
            <div>
              <dt>Non-security notices</dt>
              <dd>{query.data!.deliveryPreference ?? 'No channel selected'}</dd>
            </div>
          </dl>
          <p className="text-sm text-muted-foreground">{query.data!.securityNotice}</p>
          <p className="text-sm text-muted-foreground">
            Unsupported notice languages fall back to English. Contract calendars and operational
            dates retain their explicit timezone labels.
          </p>
          <Button onClick={() => setEditor(query.data!)}>Edit preferences</Button>
        </>
      )}
      {editor && query.data && (!query.error || recoverableQueryError(query.error)) && (
        <RecordEditor
          open
          title="Edit preferences"
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          fields={[
            {
              name: 'preferredLanguage',
              label: 'Notice language tag',
              value: editor.preferredLanguage,
              required: true,
              maxLength: 35,
            },
            {
              name: 'timezone',
              label: 'Preferred timezone (IANA)',
              value: editor.timezone,
              required: true,
              maxLength: 80,
            },
            {
              name: 'deliveryPreference',
              label: 'Non-security notices',
              value: editor.deliveryPreference ?? 'EMAIL',
              options: [
                { value: 'EMAIL', label: 'Email' },
                { value: 'WHATSAPP', label: 'WhatsApp' },
                { value: 'BOTH', label: 'Both' },
              ],
              required: true,
            },
          ]}
          onSave={async (form) => {
            await api.patch('/profile/preferences', {
              expectedVersion: editor.profileVersion,
              preferredLanguage: String(form.get('preferredLanguage')),
              timezone: String(form.get('timezone')),
              deliveryPreference: String(form.get('deliveryPreference')),
            });
            await Promise.all([
              client.invalidateQueries({ queryKey: ['preferences'] }),
              client.invalidateQueries({ queryKey: ['profile'] }),
            ]);
          }}
        />
      )}
    </div>
  );
}
