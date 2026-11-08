import type { Role } from '../session';

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
    contract: contract ? previewCaseContract(contract) : null,
    events: (record.events ?? []).map((event: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'clientId')),
    ),
    allowedActions: (previewCaseTypes.includes(record.type)
      ? ((role === 'TENANT' ? tenantActions : managerActions)[record.status] ?? [])
      : []
    ).map((status) => ({ status, requiresMessage: requiresMessage(status) })),
    canMessage: !['DRAFT', 'CLOSED'].includes(record.status),
  };
}
export function mutatePreviewCase(
  record: RecordData,
  action: string,
  data: Record<string, any>,
  role: Role,
  fail: (message: string, status: number) => never,
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
        ? ['AWAITING_MANAGER', 'ACCEPTED', 'REOPENED']
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
      actorName: role === 'TENANT' ? 'Demo Tenant' : 'Demo Manager',
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
