import { describe, expect, it } from 'vitest';
import {
  anniversary,
  calendarDate,
  dueDate,
  dubaiMidnight,
  monthStart,
} from '../src/business-calendar.js';
import { roomExpiry } from '../src/business-jobs.js';
describe('Dubai business calendar', () => {
  it('uses Dubai dates across the UTC month boundary', () => {
    expect(calendarDate(new Date('2026-11-30T20:00:00Z')).toISOString()).toBe(
      '2026-12-01T00:00:00.000Z',
    );
  });
  it('creates midnight due instants in the contract timezone', () => {
    expect(dueDate(new Date('2026-12-01'), 1).toISOString()).toBe('2026-11-30T20:00:00.000Z');
    expect(dueDate(new Date('2026-12-01'), 28).toISOString()).toBe('2026-12-27T20:00:00.000Z');
  });
  it('preserves the leap-day anchor across anniversaries', () => {
    const start = new Date('2024-02-29');
    expect(anniversary(start, 12).toISOString()).toContain('2025-02-28');
    expect(anniversary(start, 48).toISOString()).toContain('2028-02-29');
  });
  it('keeps exact calendar-day room expiry across year boundaries', () => {
    expect(roomExpiry(new Date('2026-12-29T22:14:05Z')).toISOString()).toBe(
      '2027-01-03T22:14:05.000Z',
    );
  });
  it('rejects due days with unresolved short-month policy', () => {
    for (const day of [0, 29, 30, 31, 1.5])
      expect(() => dueDate(new Date('2026-02-01'), day)).toThrow('DUE_DAY_POLICY_REQUIRED');
  });
  it('advances month markers without day overflow', () => {
    expect(monthStart(new Date('2026-01-31'), 1).toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(dubaiMidnight(new Date('2026-02-01')).toISOString()).toBe('2026-01-31T20:00:00.000Z');
  });
});
