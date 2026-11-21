import { describe, expect, it } from 'vitest';
import { shareExpense } from '../src/shared-expenses.js';

describe('fixed monthly shared costs', () => {
  it('splits cents over distinct spaces in a stable order', () => {
    expect(shareExpense('10.01', ['z', 'a', 'b', 'b'])).toEqual([
      { rentalSpaceId: 'a', amount: '3.34' },
      { rentalSpaceId: 'b', amount: '3.34' },
      { rentalSpaceId: 'z', amount: '3.33' },
    ]);
  });
  it('preserves zero shares when the amount is smaller than the space count', () => {
    expect(shareExpense('0.01', ['a', 'b'])).toEqual([
      { rentalSpaceId: 'a', amount: '0.01' },
      { rentalSpaceId: 'b', amount: '0.00' },
    ]);
    expect(shareExpense('0.01', [])).toEqual([]);
  });
});
