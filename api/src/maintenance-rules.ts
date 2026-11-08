import type { MaintenanceClassification, MaintenanceDecision, RequestStatus } from '@prisma/client';

export const maintenanceLabels: Record<MaintenanceClassification, string> = {
  MANAGER_COST: 'Normal Wear / Leasing Manager Cost',
  TENANT_COST: 'Tenant-Caused Damage / Proposed Tenant Cost',
  UNDER_REVIEW: 'Under Review',
  NO_COST: 'No Cost',
};
export function canAssessMaintenance(status: RequestStatus, decision?: MaintenanceDecision | null) {
  return !['DRAFT', 'CLOSED', 'REJECTED'].includes(status) && decision !== 'ACCEPTED';
}
