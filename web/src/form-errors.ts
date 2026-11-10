import { createContext } from 'react';
import { isAxiosError } from 'axios';
export const FieldErrorsContext = createContext<Record<string, string>>({});
export function validationFields(cause: unknown) {
  const result: Record<string, string> = {};
  if (!isAxiosError(cause) || !Array.isArray(cause.response?.data?.details)) return result;
  for (const issue of cause.response.data.details) {
    if (!issue || !Array.isArray(issue.path) || typeof issue.message !== 'string') continue;
    const path = issue.path.join('.');
    if (/^[A-Za-z][A-Za-z0-9_.[\]-]{0,150}$/.test(path)) result[path] = issue.message.slice(0, 500);
  }
  return result;
}
