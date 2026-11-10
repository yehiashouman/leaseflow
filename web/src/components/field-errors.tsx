import { useContext, useId, type ReactNode, type ComponentProps } from 'react';
import { FieldErrorsContext } from '../form-errors';
export function FormFieldErrors({
  value,
  children,
}: {
  value: Record<string, string>;
  children: ReactNode;
}) {
  return <FieldErrorsContext.Provider value={value}>{children}</FieldErrorsContext.Provider>;
}
export function FieldMessage({ name, id }: { name?: string; id: string }) {
  const error = useContext(FieldErrorsContext)[name ?? ''];
  return error ? (
    <p id={id + '-error'} role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null;
}
export function ValidatedTextarea(props: ComponentProps<'textarea'>) {
  const generated = useId(),
    id = props.id ?? generated,
    error = useContext(FieldErrorsContext)[props.name ?? ''];
  return (
    <>
      <textarea
        {...props}
        id={id}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={error ? id + '-error' : props['aria-describedby']}
      />
      <FieldMessage name={props.name} id={id} />
    </>
  );
}
