import { expect, it } from 'vitest';
import { isTransactionConflict } from '../src/errors.js';
it('recognizes ORM and raw MySQL write conflicts without exposing SQL or automatic retries', () => {
  expect(isTransactionConflict({ code: 'P2034' })).toBe(true);
  expect(isTransactionConflict({ code: 'P2010', meta: { code: '1213' } })).toBe(true);
  expect(
    isTransactionConflict({
      code: 'P2010',
      meta: { driverAdapterError: { cause: { originalCode: '1205' } } },
    }),
  ).toBe(true);
});
it('preserves syntax, integrity, and unknown failures as internal failures', () => {
  expect(isTransactionConflict({ code: 'P2010', meta: { code: '1064' } })).toBe(false);
  expect(isTransactionConflict({ code: 'P2002' })).toBe(false);
  expect(isTransactionConflict(null)).toBe(false);
});
