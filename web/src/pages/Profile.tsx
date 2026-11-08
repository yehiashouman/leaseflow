import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { Button } from '@/components/ui/button';
import { RecordEditor, type EditorField } from '@/components/record-editor';
import { QueryFeedback } from '@/components/query-feedback';

import { preferenceFields } from '../profile-fields';
type ProfileData = {
  email: string;
  phone?: string;
  phoneVerifiedAt?: string;
  preferredLanguage: string;
  timezone: string;
  profileVersion: number;
  deliveryPreference: string | null;
  securityEmail: string;
  tenant: {
    fullName: string;
    nationality?: string;
    dateOfBirth?: string;
    gender?: string;
    pendingPhone?: string;
    matchingPreferences?: Record<string, string | null>;
  };
};
export function Profile() {
  const client = useQueryClient();
  const [editor, setEditor] = useState<ProfileData | null>(null);
  const query = useQuery({
    queryKey: ['profile'],
    queryFn: ({ signal }) =>
      api.get<ProfileData>('/profile', { signal }).then((response) => response.data),
  });
  if (query.isPending || query.error || !query.data)
    return <QueryFeedback pending={query.isPending} onRetry={() => void query.refetch()} />;
  const data = query.data;
  const fields: EditorField[] = editor
    ? [
        {
          name: 'fullName',
          label: 'Full name',
          required: true,
          value: editor.tenant.fullName,
          maxLength: 150,
        },
        {
          name: 'dateOfBirth',
          label: 'Date of birth',
          type: 'date',
          value: editor.tenant.dateOfBirth?.slice(0, 10),
        },
        {
          name: 'nationality',
          label: 'Nationality',
          value: editor.tenant.nationality ?? '',
          maxLength: 100,
        },
        { name: 'gender', label: 'Gender', value: editor.tenant.gender ?? '', maxLength: 40 },
        {
          name: 'pendingPhone',
          label: 'Phone awaiting verification',
          type: 'tel',
          value: editor.tenant.pendingPhone ?? '',
          maxLength: 40,
        },
        {
          name: 'preferredLanguage',
          label: 'Account language tag',
          value: editor.preferredLanguage,
          required: true,
          maxLength: 35,
        },
        {
          name: 'timezone',
          label: 'Timezone',
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
        },
        ...Object.entries(preferenceFields).map(([key, label]) => ({
          name: 'preference_' + key,
          label,
          value: editor.tenant.matchingPreferences?.[key] ?? '',
          maxLength:
            key === 'lifestyle'
              ? 300
              : ['culture', 'sleepSchedule', 'noise'].includes(key)
                ? 160
                : 80,
        })),
        {
          name: 'smoking',
          label: 'Smoking preference',
          value: editor.tenant.matchingPreferences?.smoking ?? 'NO_PREFERENCE',
          options: [
            { value: 'NO_PREFERENCE', label: 'No preference' },
            { value: 'NON_SMOKING', label: 'Non-smoking' },
            { value: 'SMOKING', label: 'Smoking' },
          ],
        },
      ]
    : [];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="text-2xl font-semibold">My profile</h1>
        <Button onClick={() => setEditor(data)}>Edit profile</Button>
      </div>
      <h2 className="text-lg font-semibold break-words">{data.tenant.fullName}</h2>
      <dl className="grid gap-4 border-y py-5 sm:grid-cols-2">
        {[
          ['Email', data.email],
          ['Verified phone', data.phoneVerifiedAt ? data.phone : 'Not verified'],
          ['Phone awaiting verification', data.tenant.pendingPhone],
          ['Date of birth', data.tenant.dateOfBirth?.slice(0, 10)],
          ['Nationality', data.tenant.nationality],
          ['Gender', data.tenant.gender],
          ['Account language', data.preferredLanguage],
          ['Timezone', data.timezone],
          ['Non-security notices', data.deliveryPreference ?? 'No preference recorded'],
          ['Security email', data.securityEmail],
        ].map(([label, value]) => (
          <div key={label}>
            <dt className="text-sm text-muted-foreground">{label}</dt>
            <dd className="break-words">{value || '-'}</dd>
          </div>
        ))}
      </dl>
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Optional compatibility preferences</h2>
        <p className="text-sm text-muted-foreground">
          These preferences do not restrict room allocation.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          {Object.entries(preferenceFields).map(([key, label]) => (
            <div key={key}>
              <dt className="text-sm text-muted-foreground">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">
                {data.tenant.matchingPreferences?.[key] || 'No preference'}
              </dd>
            </div>
          ))}
          <div>
            <dt className="text-sm text-muted-foreground">Smoking preference</dt>
            <dd>
              {data.tenant.matchingPreferences?.smoking?.replaceAll('_', ' ') || 'NO PREFERENCE'}
            </dd>
          </div>
        </dl>
      </section>
      {editor && (
        <RecordEditor
          open
          title="Edit profile"
          fields={fields}
          onOpenChange={(open) => {
            if (!open) setEditor(null);
          }}
          onSave={async (form) => {
            const nullable = (key: string) => String(form.get(key) ?? '').trim() || null;
            try {
              await api.patch('/profile', {
                expectedVersion: editor.profileVersion,
                fullName: form.get('fullName'),
                dateOfBirth: nullable('dateOfBirth'),
                nationality: nullable('nationality'),
                gender: nullable('gender'),
                pendingPhone: nullable('pendingPhone'),
                preferredLanguage: form.get('preferredLanguage'),
                timezone: form.get('timezone'),
                deliveryPreference: form.get('deliveryPreference'),
                matchingPreferences: {
                  ...Object.fromEntries(
                    Object.keys(preferenceFields).map((key) => [
                      key,
                      nullable('preference_' + key),
                    ]),
                  ),
                  smoking: form.get('smoking'),
                },
              });
            } catch (cause) {
              void query.refetch();
              throw cause;
            }
            await client.invalidateQueries({ queryKey: ['profile'] });
            await client.invalidateQueries({ queryKey: ['tenants'] });
          }}
        />
      )}
    </div>
  );
}
