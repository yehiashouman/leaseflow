import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import type { Landlord } from '../pages/Landlords';
import { RecordEditor, formValues, type EditorField } from './record-editor';

const fields: EditorField[] = [
  { name: 'name', label: 'Name', required: true, maxLength: 150 },
  { name: 'companyName', label: 'Company', maxLength: 200 },
  { name: 'email', label: 'Email', type: 'email', maxLength: 191 },
  { name: 'phone', label: 'Phone', type: 'tel', maxLength: 40 },
  { name: 'whatsapp', label: 'WhatsApp', type: 'tel', maxLength: 40 },
  {
    name: 'preferredContactMethod',
    label: 'Preferred contact',
    options: [
      { value: '', label: 'Not specified' },
      { value: 'EMAIL', label: 'Email' },
      { value: 'PHONE', label: 'Phone' },
      { value: 'WHATSAPP', label: 'WhatsApp' },
    ],
  },
  { name: 'address', label: 'Address', maxLength: 500 },
  { name: 'notes', label: 'Notes', type: 'textarea', maxLength: 5000 },
];
export function LandlordEditor({
  landlord,
  onClose,
}: {
  landlord: Landlord | 'new';
  onClose: () => void;
}) {
  const client = useQueryClient();
  return (
    <RecordEditor
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={landlord === 'new' ? 'Add landlord' : 'Edit landlord'}
      fields={fields.map((field) => ({
        ...field,
        value: landlord === 'new' ? '' : String(landlord[field.name as keyof Landlord] ?? ''),
      }))}
      onSave={async (form) => {
        const body = formValues(
          form,
          fields.map((field) => field.name),
        );
        if (landlord === 'new') await api.post('/inventory/landlords', body);
        else await api.patch('/inventory/landlords/' + landlord.id, body);
        await client.invalidateQueries({ queryKey: ['landlords'] });
        await client.invalidateQueries({ queryKey: ['landlord'] });
        await client.invalidateQueries({ queryKey: ['units'] });
        await client.invalidateQueries({ queryKey: ['unit'] });
      }}
    />
  );
}
