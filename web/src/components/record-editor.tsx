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
  onChange?: (value: string) => void;
  errorPath?: string;
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
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setError('');
    setFieldErrors({});
    setBusy(true);
    try {
      await onSave(data);
      onOpenChange(false);
    } catch (cause) {
      const data = isAxiosError(cause) ? cause.response?.data : null;
      const details: unknown = data?.details;
      const next: Record<string, string> = {};
      if (Array.isArray(details)) {
        for (const item of details) {
          if (!item || !Array.isArray(item.path) || typeof item.message !== 'string') continue;
          const path = item.path.join('.');
          const field = fields.find((entry) => (entry.errorPath ?? entry.name) === path);
          if (field) next[field.name] = item.message;
        }
      }
      setFieldErrors(next);
      const message =
        typeof data?.message === 'string' ? data.message : 'Unable to save. Please try again.';
      const requestId = typeof data?.requestId === 'string' ? data.requestId.slice(0, 100) : '';
      setError(message + (requestId ? ' · Request: ' + requestId : ''));
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
          setFieldErrors({});
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
                  aria-invalid={!!fieldErrors[field.name]}
                  aria-describedby={
                    fieldErrors[field.name] ? 'editor-error-' + field.name : undefined
                  }
                  defaultValue={field.value ?? ''}
                  onChange={(event) => field.onChange?.(event.target.value)}
                  required={field.required}
                  disabled={busy}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={'editor-' + field.name}
                  name={field.name}
                  aria-invalid={!!fieldErrors[field.name]}
                  aria-describedby={
                    fieldErrors[field.name] ? 'editor-error-' + field.name : undefined
                  }
                  defaultValue={field.value ?? ''}
                  required={field.required}
                  maxLength={field.maxLength ?? 5000}
                  rows={4}
                  disabled={busy}
                  className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-ring"
                />
              ) : field.type === 'checkbox' ? (
                <input
                  id={'editor-' + field.name}
                  name={field.name}
                  aria-invalid={!!fieldErrors[field.name]}
                  aria-describedby={
                    fieldErrors[field.name] ? 'editor-error-' + field.name : undefined
                  }
                  type="checkbox"
                  disabled={busy}
                  defaultChecked={field.value === 'true' || field.value === 1}
                  required={field.required}
                  className="size-4 accent-primary"
                />
              ) : (
                <Input
                  id={'editor-' + field.name}
                  name={field.name}
                  aria-invalid={!!fieldErrors[field.name]}
                  aria-describedby={
                    fieldErrors[field.name] ? 'editor-error-' + field.name : undefined
                  }
                  type={field.type ?? 'text'}
                  disabled={busy}
                  defaultValue={field.value ?? ''}
                  required={field.required}
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  maxLength={field.maxLength ?? 500}
                />
              )}
              {fieldErrors[field.name] && (
                <p
                  id={'editor-error-' + field.name}
                  className="text-sm text-destructive"
                  role="alert"
                >
                  {fieldErrors[field.name]}
                </p>
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
