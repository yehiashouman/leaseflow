import type { Role } from '../session';
import { maintenanceLabels } from '../cases';

type RecordData = { id: string; [key: string]: any };
export const previewCaseTypes = ['MAINTENANCE', 'NEIGHBOR_COMPLAINT', 'KEY_LOCK_CHANGE', 'GENERAL'];
const managerActions: Record<string, string[]> = {
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
const tenantActions: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  AWAITING_TENANT: ['AWAITING_MANAGER'],
  RESOLVED: ['ACCEPTED', 'REOPENED'],
  REJECTED: ['REOPENED'],
  ACCEPTED: ['REOPENED'],
  CLOSED: ['REOPENED'],
};
const requiresMessage = (status: string) =>
  ['REJECTED', 'RESOLVED', 'REOPENED', 'AWAITING_TENANT'].includes(status);
export function previewCaseContract(contract: RecordData) {
  return {
    id: contract.id,
    status: contract.status,
    startDate: contract.startDate,
    currency: contract.currency,
    tenant: { id: contract.tenant?.id, fullName: contract.tenant?.fullName },
    rentalSpace: {
      id: contract.rentalSpace?.id,
      name: contract.rentalSpace?.name,
      unit: {
        id: contract.rentalSpace?.unit?.id,
        name: contract.rentalSpace?.unit?.name,
        area: contract.rentalSpace?.unit?.area,
      },
    },
  };
}
export function previewCase(record: RecordData, contracts: RecordData[], role: Role) {
  const contractId = record.contractId ?? 'contract-1';
  const contract = contracts.find((item) => item.id === contractId);
  return {
    id: record.id,
    contractId,
    type: record.type,
    title: record.title,
    description: record.description,
    status: record.status,
    version: record.version ?? 0,
    metadata: record.metadata ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resolvedAt: record.resolvedAt ?? null,
    decisionDueAt: record.decisionDueAt ?? null,
    contract: contract ? previewCaseContract(contract) : null,
    events: (record.events ?? []).map((event: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(event).filter(([key]) => key !== 'clientId' && key !== 'metadata'),
      ),
    ),
    allowedActions: (previewCaseTypes.includes(record.type)
      ? ((role === 'TENANT' ? tenantActions : managerActions)[record.status] ?? [])
      : []
    ).map((status) => ({ status, requiresMessage: requiresMessage(status) })),
    canMessage: !['DRAFT', 'CLOSED'].includes(record.status),
    maintenanceAssessments: record.maintenanceAssessments ?? [],
    canAssessMaintenance:
      record.type === 'MAINTENANCE' &&
      role === 'LEASING_MANAGER' &&
      !['DRAFT', 'CLOSED', 'REJECTED'].includes(record.status) &&
      record.maintenanceAssessments?.at(-1)?.decision !== 'ACCEPTED',
    canRespondMaintenance:
      record.type === 'MAINTENANCE' &&
      role === 'TENANT' &&
      record.maintenanceAssessments?.at(-1)?.classification === 'TENANT_COST' &&
      !record.maintenanceAssessments.at(-1).decision,
  };
}

export function mutatePreviewMaintenance(
  record: RecordData,
  data: Record<string, any>,
  role: Role,
  fail: (message: string, status: number) => never,
  currency: string,
  actorName: string,
  assessmentId?: string,
) {
  const responding = Boolean(assessmentId);
  if (role !== (responding ? 'TENANT' : 'LEASING_MANAGER')) fail('Insufficient permissions', 403);
  const keys = responding
    ? ['clientId', 'expectedVersion', 'decision', 'explanation']
    : [
        'clientId',
        'expectedVersion',
        'classification',
        'proposedAmount',
        'explanation',
        'evidenceNotes',
      ];
  const explanation = typeof data.explanation === 'string' ? data.explanation.trim() : '';
  const evidenceNotes = typeof data.evidenceNotes === 'string' ? data.evidenceNotes.trim() : '';
  if (
    Object.keys(data).some((key) => !keys.includes(key)) ||
    !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data.clientId ?? '') ||
    !Number.isInteger(data.expectedVersion) ||
    data.expectedVersion < 0 ||
    data.expectedVersion > 2147483646 ||
    explanation.length < 3 ||
    explanation.length > 5000 ||
    evidenceNotes.length > 5000
  )
    fail('Verify the assessment fields.', 422);
  let proposedAmount: string | null = null;
  if (!responding && data.proposedAmount != null) {
    if (
      typeof data.proposedAmount !== 'string' ||
      !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(data.proposedAmount) ||
      Number(data.proposedAmount) <= 0
    )
      fail('Verify the positive amount with at most two decimal places.', 422);
    proposedAmount = Number(data.proposedAmount).toFixed(2);
  }
  if (
    responding
      ? !['ACCEPTED', 'DISPUTED'].includes(data.decision)
      : !Object.hasOwn(maintenanceLabels, data.classification)
  )
    fail('Verify the classification or decision.', 422);
  if (
    !responding &&
    ((data.classification === 'TENANT_COST' && (!proposedAmount || evidenceNotes.length < 3)) ||
      (data.classification !== 'TENANT_COST' && proposedAmount !== null))
  )
    fail(
      'Tenant cost requires a positive amount and evidence notes; other classes cannot propose an amount.',
      422,
    );
  if (record.type !== 'MAINTENANCE') fail('This case is not a maintenance request', 409);
  const input = responding
    ? { assessmentId, decision: data.decision, explanation }
    : { classification: data.classification, proposedAmount, explanation, evidenceNotes };
  const kind = responding ? 'MAINTENANCE_' + data.decision : 'MAINTENANCE_ASSESSED';
  const duplicate = (record.events ?? []).find(
    (event: RecordData) => event.clientId === data.clientId,
  );
  if (duplicate) {
    if (
      duplicate.actorRole !== role ||
      duplicate.kind !== kind ||
      duplicate.sequence !== data.expectedVersion + 1 ||
      JSON.stringify(duplicate.metadata) !== JSON.stringify(input)
    )
      fail('Key reused with different content', 409);
    return;
  }
  if (record.version !== data.expectedVersion)
    fail('Case changed. Reload before another assessment or response', 409);
  const rows = record.maintenanceAssessments ?? [];
  const latest = rows.at(-1);
  const now = new Date().toISOString();
  let message: string;
  if (responding) {
    if (
      !latest ||
      latest.id !== assessmentId ||
      latest.classification !== 'TENANT_COST' ||
      latest.decision
    )
      fail('This cost proposal is no longer open for a response', 409);
    latest.decision = data.decision;
    latest.responseExplanation = explanation;
    latest.respondedAt = now;
    message = `Tenant ${data.decision.toLowerCase()} proposed cost ${latest.currency} ${latest.proposedAmount}.\nResponse: ${explanation}\nNo charge or deduction was created.`;
  } else {
    if (['DRAFT', 'CLOSED', 'REJECTED'].includes(record.status) || latest?.decision === 'ACCEPTED')
      fail('Reopen the case first; accepted cost responsibility cannot be replaced', 409);
    rows.push({
      id: crypto.randomUUID(),
      caseVersion: record.version + 1,
      ...input,
      currency: proposedAmount ? currency : null,
      decision: null,
      responseExplanation: null,
      respondedAt: null,
      createdAt: now,
    });
    record.maintenanceAssessments = rows;
    message = [
      maintenanceLabels[data.classification],
      ...(proposedAmount ? [`Proposed tenant cost: ${currency} ${proposedAmount}`] : []),
      'Explanation: ' + explanation,
      ...(evidenceNotes ? ['Evidence notes: ' + evidenceNotes] : []),
      'Maintenance remains the Leasing Manager responsibility. No charge or deduction was created.',
    ].join('\n');
  }
  record.version++;
  record.updatedAt = now;
  record.events = [
    ...(record.events ?? []),
    {
      id: crypto.randomUUID(),
      clientId: data.clientId,
      kind,
      message,
      metadata: input,
      actorUserId: 'preview-' + role,
      actorName,
      actorRole: role,
      sequence: record.version,
      createdAt: now,
    },
  ];
}
export function mutatePreviewCase(
  record: RecordData,
  action: string,
  data: Record<string, any>,
  role: Role,
  fail: (message: string, status: number) => never,
  actorName?: string,
) {
  const keys =
    action === 'messages'
      ? ['clientId', 'message']
      : ['clientId', 'message', 'status', 'expectedVersion'];
  const message = typeof data.message === 'string' ? data.message.trim() : '';
  if (
    Object.keys(data).some((key) => !keys.includes(key)) ||
    !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(data.clientId ?? '') ||
    message.length > 5000 ||
    (action === 'messages' && !message)
  )
    fail('Verify the request fields.', 422);
  const kind = action === 'messages' ? 'MESSAGE' : data.status;
  const events: RecordData[] = record.events ?? [];
  const duplicate = events.find((event) => event.clientId === data.clientId);
  if (duplicate) {
    if (
      duplicate.actorRole !== role ||
      duplicate.kind !== kind ||
      (duplicate.message ?? '') !== message ||
      (action === 'respond' && duplicate.sequence !== data.expectedVersion + 1)
    )
      fail('Key reused with different content', 409);
    return;
  }
  if (action === 'respond') {
    if (!Number.isInteger(data.expectedVersion) || data.expectedVersion < 0)
      fail('Verify the version.', 422);
    const targets =
      role === 'TENANT'
        ? ['SUBMITTED', 'AWAITING_MANAGER', 'ACCEPTED', 'REOPENED']
        : [
            'SEEN',
            'APPROVED',
            'AWAITING_TENANT',
            'IN_PROGRESS',
            'RESOLVED',
            'REJECTED',
            'REOPENED',
            'CLOSED',
          ];
    if (!targets.includes(data.status)) fail('Your role cannot perform this decision', 403);
    if (!previewCaseTypes.includes(record.type)) fail('Dedicated workflow not implemented', 409);
    if ((record.version ?? 0) !== data.expectedVersion)
      fail('Case changed. Review the latest history', 409);
    if (!(role === 'TENANT' ? tenantActions : managerActions)[record.status]?.includes(data.status))
      fail('Invalid decision for this status', 409);
    if (requiresMessage(data.status) && message.length < 3)
      fail('Add an explanation of at least three characters', 422);
  } else if (['DRAFT', 'CLOSED'].includes(record.status))
    fail('Reopen the case before a new message', 409);
  const now = new Date().toISOString();
  record.version = (record.version ?? 0) + 1;
  record.events = [
    ...events,
    {
      id: crypto.randomUUID(),
      clientId: data.clientId,
      kind,
      message: message || null,
      actorUserId: 'preview-' + role,
      actorName: actorName ?? (role === 'TENANT' ? 'Demo Tenant' : 'Demo Manager'),
      actorRole: role,
      sequence: record.version,
      createdAt: now,
      ...(action === 'respond' ? { fromStatus: record.status } : {}),
    },
  ];
  record.updatedAt = now;
  if (action === 'respond') {
    record.status = data.status;
    if (data.status === 'RESOLVED') record.resolvedAt = now;
  }
}
