import { describe, expect, it } from 'vitest';
import { canAssessMaintenance, maintenanceLabels } from '../src/maintenance-rules.js';
describe('maintenance responsibility boundaries', () => {
  it('keeps four explicit responsibility classes', () => {
    expect(Object.keys(maintenanceLabels)).toEqual([
      'MANAGER_COST',
      'TENANT_COST',
      'UNDER_REVIEW',
      'NO_COST',
    ]);
  });
  it('rejects private drafts, rejected requests, and closed requests', () => {
    for (const status of ['DRAFT', 'REJECTED', 'CLOSED'] as const)
      expect(canAssessMaintenance(status)).toBe(false);
  });
  it('allows operational review after a dispute without alteration of accepted responsibility', () => {
    expect(canAssessMaintenance('IN_PROGRESS', 'DISPUTED')).toBe(true);
    expect(canAssessMaintenance('REOPENED', 'ACCEPTED')).toBe(false);
  });
  it('keeps repair completion separate from an unanswered cost proposal', () => {
    expect(canAssessMaintenance('RESOLVED')).toBe(true);
    expect(canAssessMaintenance('ACCEPTED')).toBe(true);
  });
});
