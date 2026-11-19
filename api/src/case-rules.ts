import type { RequestStatus, RequestType, Role } from '@prisma/client';
import { z } from 'zod';

export const keyLockDecisionSchema = z
  .object({
    authorization: z.string().trim().min(3).max(1000),
    costResponsibility: z.enum(['MANAGER', 'TENANT', 'NO_COST', 'UNDETERMINED']).optional(),
  })
  .strict();

export function keyLockDecisionMetadata(value: unknown) {
  const result = z.object({ keyLock: keyLockDecisionSchema.optional() }).safeParse(value);
  return result.data?.keyLock;
}

export const basicCaseTypes = [
  'MAINTENANCE',
  'NEIGHBOR_COMPLAINT',
  'KEY_LOCK_CHANGE',
  'GENERAL',
] as const;
const managerActions: Partial<Record<RequestStatus, RequestStatus[]>> = {
  SUBMITTED: ['SEEN', 'APPROVED', 'AWAITING_TENANT', 'IN_PROGRESS', 'REJECTED'],
  SEEN: ['APPROVED', 'AWAITING_TENANT', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  AWAITING_MANAGER: ['SEEN', 'APPROVED', 'AWAITING_TENANT', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  AWAITING_TENANT: ['IN_PROGRESS', 'RESOLVED'],
  APPROVED: ['AWAITING_TENANT', 'IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['AWAITING_TENANT', 'RESOLVED'],
  RESOLVED: ['REOPENED'],
  REJECTED: ['REOPENED'],
  REOPENED: ['SEEN', 'APPROVED', 'AWAITING_TENANT', 'IN_PROGRESS', 'RESOLVED', 'REJECTED'],
  ACCEPTED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
};
const tenantActions: Partial<Record<RequestStatus, RequestStatus[]>> = {
  DRAFT: ['SUBMITTED'],
  AWAITING_TENANT: ['AWAITING_MANAGER'],
  RESOLVED: ['ACCEPTED', 'REOPENED'],
  REJECTED: ['REOPENED'],
  ACCEPTED: ['REOPENED'],
  CLOSED: ['REOPENED'],
};
const roleTargets: Partial<Record<Role, RequestStatus[]>> = {
  LEASING_MANAGER: [
    'SEEN',
    'APPROVED',
    'AWAITING_TENANT',
    'IN_PROGRESS',
    'RESOLVED',
    'REJECTED',
    'REOPENED',
    'CLOSED',
  ],
  TENANT: ['SUBMITTED', 'AWAITING_MANAGER', 'ACCEPTED', 'REOPENED'],
};
export function supportsCaseType(type: RequestType) {
  return (basicCaseTypes as readonly string[]).includes(type);
}
export function allowedCaseActions(
  type: RequestType,
  status: RequestStatus,
  role: Role,
): RequestStatus[] {
  if (!supportsCaseType(type)) return [];
  return (
    (role === 'LEASING_MANAGER'
      ? managerActions[status]
      : role === 'TENANT'
        ? tenantActions[status]
        : []) ?? []
  );
}
export function roleCanRequestStatus(role: Role, status: RequestStatus) {
  return roleTargets[role]?.includes(status) ?? false;
}
export function caseAllowsMessages(status: RequestStatus) {
  return !['DRAFT', 'CLOSED'].includes(status);
}
export function caseActionNeedsMessage(status: RequestStatus) {
  return ['REJECTED', 'RESOLVED', 'REOPENED', 'AWAITING_TENANT'].includes(status);
}
