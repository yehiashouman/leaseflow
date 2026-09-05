import { describe, expect, it } from 'vitest';
import { proratedRent } from '../src/routes/contracts.js';
describe('proratedRent', () => {
  it('uses actual days in a 30-day month', () => expect(proratedRent(3000, new Date('2026-09-15T00:00:00Z'))).toBe(1600));
  it('uses actual days in a 31-day month', () => expect(proratedRent(3100, new Date('2026-08-15T00:00:00Z'))).toBe(1700));
});
