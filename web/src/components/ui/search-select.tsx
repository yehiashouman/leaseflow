import { useContext, useId, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { FieldErrorsContext } from '../../form-errors';
import { cn } from '../../lib/utils';

export type Choice = { value: string; label: string; area?: string };
export function SearchSelect({
  id,
  name,
  options,
  defaultValue = '',
  required,
  disabled,
  onChange,
  invalid,
  describedBy,
  allowCustom = false,
}: {
  id?: string;
  name: string;
  options: Choice[];
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  onChange?: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  allowCustom?: boolean;
}) {
  const uid = useId(),
    controlId = id ?? uid,
    trigger = useRef<HTMLButtonElement>(null),
    searchInput = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultValue),
    [open, setOpen] = useState(false),
    [search, setSearch] = useState(''),
    [active, setActive] = useState(0),
    [missing, setMissing] = useState(false);
  const contextError = useContext(FieldErrorsContext)[name];
  const choices =
    value && !options.some((item) => item.value === value)
      ? [{ value, label: value }, ...options]
      : options;
  const filtered = choices.filter((item) =>
    (item.label + ' ' + item.value).toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const select = (next: string) => {
    setValue(next);
    setMissing(false);
    onChange?.(next);
    setOpen(false);
    setSearch('');
    setActive(0);
  };
  return (
    <>
      <select
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => select(event.target.value)}
        onInvalid={(event) => {
          event.preventDefault();
          setMissing(true);
          setOpen(true);
          trigger.current?.focus();
        }}
      >
        <option value="">Select an option</option>
        {choices
          .filter((item) => item.value)
          .map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
      </select>
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          setSearch('');
          setActive(0);
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={trigger}
            type="button"
            id={controlId}
            role="combobox"
            aria-expanded={open}
            aria-controls={uid + '-list'}
            aria-haspopup="listbox"
            aria-invalid={invalid || !!contextError || missing}
            aria-describedby={contextError || missing ? controlId + '-error' : describedBy}
            disabled={disabled}
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-white px-3.5 py-2.5 text-left text-sm shadow-xs outline-none transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 aria-invalid:border-destructive"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {choices.find((item) => item.value === value)?.label || 'Select an option'}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={6}
            className="z-[70] w-[var(--radix-popover-trigger-width)] min-w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border bg-popover p-1 shadow-xl"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              searchInput.current?.focus();
            }}
          >
            <div className="flex items-center gap-2 border-b px-2 py-2">
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <input
                ref={searchInput}
                type="search"
                maxLength={150}
                aria-label="Search choices"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="true"
                aria-controls={uid + '-list'}
                aria-activedescendant={filtered[active] ? uid + '-option-' + active : undefined}
                placeholder="Search choices…"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setActive(0);
                }}
                className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none sm:text-sm"
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    const next = Math.max(
                      0,
                      Math.min(filtered.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)),
                    );
                    setActive(next);
                    document
                      .getElementById(uid + '-option-' + next)
                      ?.scrollIntoView({ block: 'nearest' });
                  }
                  if (event.key === 'Enter' && filtered[active]) {
                    event.preventDefault();
                    select(filtered[active].value);
                  }
                }}
              />
            </div>
            <div
              id={uid + '-list'}
              role="listbox"
              className="max-h-[min(17rem,45dvh)] overflow-y-auto overscroll-contain p-1"
            >
              {!required && (
                <button
                  type="button"
                  role="option"
                  aria-selected={!value}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent"
                  onClick={() => select('')}
                >
                  No selection
                </button>
              )}
              {filtered.map((item, index) => (
                <button
                  type="button"
                  id={uid + '-option-' + index}
                  key={item.value}
                  role="option"
                  aria-selected={value === item.value}
                  tabIndex={-1}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-accent',
                    index === active && 'bg-accent',
                  )}
                  onClick={() => select(item.value)}
                >
                  {item.label}
                  {value === item.value && (
                    <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                  )}
                </button>
              ))}
              {!filtered.length && (
                <p className="px-3 py-4 text-sm text-muted-foreground">No choices match.</p>
              )}
            </div>
            {allowCustom &&
              search.trim() &&
              !choices.some((item) => item.value.toLowerCase() === search.trim().toLowerCase()) && (
                <button
                  type="button"
                  className="w-full border-t px-3 py-3 text-left text-sm font-medium text-primary"
                  onClick={() => select(search.trim())}
                >
                  Add unlisted building: {search.trim()}
                </button>
              )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {(contextError || missing) && (
        <p id={controlId + '-error'} role="alert" className="text-sm text-destructive">
          {contextError || 'Select an option.'}
        </p>
      )}
    </>
  );
}
