import { describe, expect, it } from 'vitest';
import { proratedRent } from '../src/routes/contracts.js';
describe('proratedRent', () => {
  it('uses actual days in a 30-day month', () =>
    expect(proratedRent(3000, new Date('2026-09-15T00:00:00Z'))).toBe(1600));
  it('uses actual days in a 31-day month', () =>
    expect(proratedRent(3100, new Date('2026-08-15T00:00:00Z'))).toBe(1700));
  it.each([
    [3100, '2026-01-17', 1500],
    [2900, '2024-02-15', 1500],
    [2800, '2026-02-15', 1400],
    [3000, '2026-01-01', 3000],
    [100, '2026-02-15', 50],
  ])('posts %s from %s as %s', (rent, startDate, expected) => {
    expect(proratedRent(rent, new Date(startDate))).toBe(expected);
  });
});
