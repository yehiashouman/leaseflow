import { describe, expect, it } from 'vitest';
import { RequestStatus, RequestType, Role } from '@prisma/client';
import {
  allowedCaseActions,
  basicCaseTypes,
  caseActionNeedsMessage,
  caseAllowsMessages,
  roleCanRequestStatus,
} from '../src/case-rules.js';

describe('operational case rules', () => {
  it('requires tenant acceptance before manager closure', () => {
    expect(allowedCaseActions('MAINTENANCE', 'RESOLVED', 'LEASING_MANAGER')).toEqual(['REOPENED']);
    expect(allowedCaseActions('MAINTENANCE', 'RESOLVED', 'TENANT')).toEqual([
      'ACCEPTED',
      'REOPENED',
    ]);
    expect(allowedCaseActions('MAINTENANCE', 'ACCEPTED', 'LEASING_MANAGER')).toContain('CLOSED');
  });
  it('never grants financial transitions through the generic workflow', () => {
    for (const type of ['LATE_PAYMENT', 'ROOM_CHANGE', 'MOVE_OUT'] as const)
      for (const status of Object.values(RequestStatus))
        for (const role of Object.values(Role))
          expect(allowedCaseActions(type, status, role)).toEqual([]);
  });
  it('keeps every permitted transition within its role target set', () => {
    for (const type of basicCaseTypes)
      for (const status of Object.values(RequestStatus))
        for (const role of Object.values(Role))
          for (const target of allowedCaseActions(type, status, role))
            expect(roleCanRequestStatus(role, target)).toBe(true);
    expect(roleCanRequestStatus('TENANT', 'APPROVED')).toBe(false);
    expect(roleCanRequestStatus('LEASING_MANAGER', 'ACCEPTED')).toBe(false);
  });
  it('denies administrator decisions for every request type and state', () => {
    for (const type of Object.values(RequestType))
      for (const status of Object.values(RequestStatus))
        expect(allowedCaseActions(type, status, 'ADMIN')).toEqual([]);
  });
  it('requires explanations for resolution, rejection, questions, and disputes', () => {
    for (const status of ['RESOLVED', 'REJECTED', 'AWAITING_TENANT', 'REOPENED'] as const)
      expect(caseActionNeedsMessage(status)).toBe(true);
    expect(caseActionNeedsMessage('ACCEPTED')).toBe(false);
    expect(caseAllowsMessages('RESOLVED')).toBe(true);
    expect(caseAllowsMessages('CLOSED')).toBe(false);
    expect(caseAllowsMessages('DRAFT')).toBe(false);
  });
});
