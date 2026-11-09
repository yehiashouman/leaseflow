import { expect, it } from 'vitest';
import { occupancyElapsed } from './calendar';
it('uses Dubai calendar dates across a UTC midnight boundary', () => {
  expect(occupancyElapsed('2026-01-01T00:00:00Z', new Date('2026-01-31T21:00:00Z'))).toEqual({
    started: true,
    months: 1,
    days: 0,
  });
});
it('shows completed months and remaining calendar days at month ends and leap years', () => {
  expect(occupancyElapsed('2026-01-31T00:00:00Z', new Date('2026-03-01T00:00:00Z'))).toEqual({
    started: true,
    months: 1,
    days: 1,
  });
  expect(occupancyElapsed('2024-02-29T00:00:00Z', new Date('2025-02-28T00:00:00Z'))).toEqual({
    started: true,
    months: 12,
    days: 0,
  });
});
it('distinguishes future and invalid move-in dates from elapsed occupancy', () => {
  expect(occupancyElapsed('2030-01-01', new Date('2026-01-01'))?.started).toBe(false);
  expect(occupancyElapsed('invalid', new Date('2026-01-01'))).toBeNull();
});
