import { useState, type FormEvent } from 'react';
import { isAxiosError } from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export type EditorField = {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  value?: string | number;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: string;
  maxLength?: number;
};
export function RecordEditor({
  open,
  onOpenChange,
  title,
  fields,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fields: EditorField[];
  onSave: (data: FormData) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setBusy(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (cause) {
      setError(
        isAxiosError(cause)
          ? (cause.response?.data?.message ??
              cause.response?.data?.details
                ?.map(
                  (item: { path: string[]; message: string }) =>
                    item.path.join('.') + ': ' + item.message,
                )
                .join('; ') ??
              'Unable to save. Please try again.')
          : 'Unable to save. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!busy) {
          setError('');
          onOpenChange(next);
        }
      }}
    >
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Record details</SheetDescription>
        </SheetHeader>
        <form onSubmit={submit} className="space-y-4 px-4 pb-6" aria-busy={busy}>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {fields.map((field) => (
            <div key={field.name} className="space-y-2">
              <Label htmlFor={'editor-' + field.name}>
                {field.label}
                {field.required ? ' *' : ''}
              </Label>
              {field.options ? (
                <select
                  id={'editor-' + field.name}
                  name={field.name}
                  defaultValue={field.value ?? ''}
                  required={field.required}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <input
                  id={'editor-' + field.name}
                  name={field.name}
                  type="checkbox"
                  required={field.required}
                  className="size-4 accent-primary"
                />
              ) : (
                <Input
                  id={'editor-' + field.name}
                  name={field.name}
                  type={field.type ?? 'text'}
                  defaultValue={field.value ?? ''}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  maxLength={field.maxLength ?? 500}
                />
              )}
            </div>
          ))}
          <div className="flex gap-2 border-t pt-4">
            <Button type="submit" disabled={busy}>
              {busy ? 'Please wait...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function formValues(data: FormData, names: string[]) {
  return Object.fromEntries(names.map((name) => [name, data.get(name)?.toString().trim() || null]));
}
