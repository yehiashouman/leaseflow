import { FieldErrorsContext } from '../../form-errors';
import { FieldMessage } from '../field-errors';
import * as React from 'react';
import { cn } from '@/lib/utils';

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  const generated = React.useId(),
    id = props.id ?? generated,
    error = React.useContext(FieldErrorsContext)[props.name ?? ''];
  return (
    <>
      <input
        type={type}
        data-slot="input"
        className={cn(
          'h-11 w-full min-w-0 rounded-xl border border-input bg-white px-3.5 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
          'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
          'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
          className,
        )}
        {...props}
        id={id}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? id + '-error' : props['aria-describedby']}
      />
      <FieldMessage name={props.name} id={id} />
    </>
  );
}

export { Input };
