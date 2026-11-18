import { describe, expect, it } from 'vitest';
import { rentWindows } from '../src/rent-dashboard.js';

describe('Dubai rent calendar', () => {
  it('starts the new Dubai month at 20:00 UTC on the preceding date', () => {
    const before = rentWindows(new Date('2026-11-30T19:59:59.999Z'));
    const after = rentWindows(new Date('2026-11-30T20:00:00.000Z'));
    expect(before.today.toISOString()).toBe('2026-11-29T20:00:00.000Z');
    expect(before.monthStart.toISOString()).toBe('2026-10-31T20:00:00.000Z');
    expect(after.today.toISOString()).toBe('2026-11-30T20:00:00.000Z');
    expect(after.monthStart.toISOString()).toBe('2026-11-30T20:00:00.000Z');
    expect(after.tomorrow.toISOString()).toBe('2026-12-01T20:00:00.000Z');
    expect(after.afterNextWeek.toISOString()).toBe('2026-12-08T20:00:00.000Z');
  });
});
