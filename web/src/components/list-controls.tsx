import { Button } from './ui/button';

export type ListPage<T> = { items: T[]; total: number; page: number; pageSize: number };

export function ListPager({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}) {
  if (page === 1 && total <= pageSize) return null;
  return (
    <nav aria-label="List pages" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Page {page} of {Math.max(1, Math.ceil(total / pageSize))} · {total} records
      </p>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page === 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={page * pageSize >= total}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </nav>
  );
}

export function ListSort({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  onChange: (value: string) => void;
}) {
  return (
    <select
      aria-label={label}
      className="h-9 max-w-full rounded-md border bg-background px-3 text-sm"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map(([key, name]) => (
        <option key={key} value={key}>
          {name}
        </option>
      ))}
    </select>
  );
}
