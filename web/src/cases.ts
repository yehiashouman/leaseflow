export type CaseAction = { status: string; requiresMessage: boolean };
export type CaseContract = {
  id: string;
  status: string;
  startDate?: string;
  currency?: string;
  tenant?: { id: string; fullName: string };
  rentalSpace?: { id?: string; name: string; unit: { id?: string; name: string; area?: string } };
};
export type CaseEvent = {
  id: string;
  kind: string;
  message?: string | null;
  createdAt?: string;
  actorUserId?: string | null;
  actorName?: string | null;
  actorRole?: string | null;
  fromStatus?: string | null;
  sequence?: number | null;
};
export type CaseRecord = {
  id: string;
  contractId: string;
  type: string;
  status: string;
  title: string;
  description: string;
  version: number;
  createdAt?: string;
  updatedAt?: string;
  resolvedAt?: string | null;
  metadata?: { category?: string | null; urgency?: string };
  contract?: CaseContract;
  events?: CaseEvent[];
  allowedActions?: CaseAction[];
  canMessage?: boolean;
  canAssessMaintenance?: boolean;
  canRespondMaintenance?: boolean;
  maintenanceAssessments?: MaintenanceAssessment[];
};
export type MaintenanceAssessment = {
  id: string;
  caseVersion: number;
  classification: string;
  proposedAmount: string | null;
  currency: string | null;
  explanation: string;
  evidenceNotes: string | null;
  decision: 'ACCEPTED' | 'DISPUTED' | null;
  responseExplanation: string | null;
  createdAt: string;
  respondedAt: string | null;
};
export const maintenanceLabels: Record<string, string> = {
  MANAGER_COST: 'Normal Wear / Leasing Manager Cost',
  TENANT_COST: 'Tenant-Caused Damage / Proposed Tenant Cost',
  UNDER_REVIEW: 'Under Review',
  NO_COST: 'No Cost',
};
export const caseTypes: Record<string, string> = {
  MAINTENANCE: 'Maintenance',
  NEIGHBOR_COMPLAINT: 'Neighbor complaint',
  KEY_LOCK_CHANGE: 'Key/lock change',
  GENERAL: 'General request',
  LATE_PAYMENT: 'Late payment',
  ROOM_CHANGE: 'Room change',
  MOVE_OUT: 'Move-out',
};
export const caseStatuses: Record<string, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Submitted',
  SEEN: 'Seen',
  AWAITING_MANAGER: 'Awaiting manager',
  AWAITING_TENANT: 'Awaiting tenant',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved - awaiting tenant acknowledgement',
  ACCEPTED: 'Accepted',
  REOPENED: 'Reopened',
  DEADLOCK: 'External resolution required',
  CLOSED: 'Closed',
};
export const caseCommands: Record<string, string> = {
  SUBMITTED: 'Submit request',
  SEEN: 'Mark seen',
  AWAITING_MANAGER: 'Send to manager',
  AWAITING_TENANT: 'Request tenant response',
  APPROVED: 'Approve request',
  REJECTED: 'Reject request',
  IN_PROGRESS: 'Start work',
  RESOLVED: 'Mark resolved',
  ACCEPTED: 'Accept completion',
  REOPENED: 'Reopen case',
  CLOSED: 'Close case',
};
export function caseEventLabel(kind: string) {
  if (kind === 'MAINTENANCE_ASSESSED') return 'Maintenance responsibility recorded';
  if (kind === 'MAINTENANCE_ACCEPTED') return 'Proposed cost accepted';
  if (kind === 'MAINTENANCE_DISPUTED') return 'Proposed cost disputed';
  if (kind === 'DRAFT_CREATED') return 'Draft saved';
  return kind === 'MESSAGE'
    ? 'Message'
    : kind === 'RESOLVED'
      ? 'Resolution reported'
      : kind === 'ACCEPTED'
        ? 'Completion accepted'
        : (caseStatuses[kind] ?? kind.replaceAll('_', ' '));
}
export function caseDate(value?: string | null) {
  if (!value || !Number.isFinite(new Date(value).getTime())) return '-';
  return new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
}
