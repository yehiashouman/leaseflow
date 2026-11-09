import { queueCaseNotices } from './notice-data.js';
import { Prisma } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { lockUser } from './sessions.js';
import { allowedCaseActions, caseActionNeedsMessage, caseAllowsMessages } from './case-rules.js';
import { canAssessMaintenance } from './maintenance-rules.js';

type Identity = FastifyRequest['user'];
export function caseContractScope(actor: Identity): Prisma.ContractWhereInput {
  if (actor.role === 'LEASING_MANAGER')
    return {
      tenant: { manager: { userId: actor.sub } },
      rentalSpace: { unit: { manager: { userId: actor.sub } } },
    };
  if (actor.role === 'TENANT')
    return {
      tenant: { userId: actor.sub },
      rentalSpace: { unit: { manager: { tenants: { some: { userId: actor.sub } } } } },
    };
  return { id: { in: [] } };
}
export function caseScope(actor: Identity): Prisma.RequestWhereInput {
  return {
    contract: caseContractScope(actor),
    ...(actor.role === 'LEASING_MANAGER' ? { status: { not: 'DRAFT' as const } } : {}),
  };
}
export const caseContractSelect = {
  id: true,
  status: true,
  startDate: true,
  currency: true,
  tenant: { select: { id: true, fullName: true } },
  rentalSpace: {
    select: { id: true, name: true, unit: { select: { id: true, name: true, area: true } } },
  },
} as const;
export const caseSelect = {
  id: true,
  contractId: true,
  type: true,
  status: true,
  title: true,
  description: true,
  metadata: true,
  version: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  decisionDueAt: true,
  contract: { select: caseContractSelect },
  maintenanceAssessments: {
    select: {
      id: true,
      caseVersion: true,
      classification: true,
      proposedAmount: true,
      currency: true,
      explanation: true,
      evidenceNotes: true,
      decision: true,
      responseExplanation: true,
      respondedAt: true,
      createdAt: true,
    },
    orderBy: { caseVersion: 'asc' },
  },
  events: {
    select: {
      id: true,
      actorUserId: true,
      actorName: true,
      actorRole: true,
      kind: true,
      message: true,
      fromStatus: true,
      sequence: true,
      createdAt: true,
    },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
  },
} satisfies Prisma.RequestSelect;
const safeMetadata = z.object({
  category: z.string().max(100).nullable().optional(),
  urgency: z.enum(['NORMAL', 'URGENT']).optional(),
});
export type CaseRecord = Prisma.RequestGetPayload<{ select: typeof caseSelect }>;
export function caseDto(row: CaseRecord, actor: Identity) {
  const metadata = safeMetadata.safeParse(row.metadata ?? {});
  const latest = row.maintenanceAssessments?.at(-1);
  return {
    ...row,
    metadata: metadata.success ? metadata.data : {},
    allowedActions: allowedCaseActions(row.type, row.status, actor.role).map((status) => ({
      status,
      requiresMessage: caseActionNeedsMessage(status),
    })),
    canMessage: caseAllowsMessages(row.status),
    canAssessMaintenance:
      row.type === 'MAINTENANCE' &&
      actor.role === 'LEASING_MANAGER' &&
      canAssessMaintenance(row.status, latest?.decision),
    canRespondMaintenance:
      row.type === 'MAINTENANCE' &&
      actor.role === 'TENANT' &&
      latest?.classification === 'TENANT_COST' &&
      !latest.decision,
  };
}
function actorSql(actor: Identity) {
  return actor.role === 'TENANT'
    ? Prisma.sql`t.userId = ${actor.sub}`
    : actor.role === 'LEASING_MANAGER'
      ? Prisma.sql`m.userId = ${actor.sub}`
      : Prisma.sql`1 = 0`;
}
export async function lockCaseContract(tx: Prisma.TransactionClient, id: string, actor: Identity) {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT c.id FROM Contract c WHERE c.id = ${id} AND EXISTS (
      SELECT 1 FROM TenantProfile t JOIN RentalSpace s ON s.id = c.rentalSpaceId
      JOIN Unit u ON u.id = s.unitId JOIN LeasingManagerProfile m ON m.id = u.managerId
      WHERE t.id = c.tenantId AND t.managerId = u.managerId AND ${actorSql(actor)}
    ) FOR UPDATE
  `);
  return rows.length > 0;
}
export async function lockCase(tx: Prisma.TransactionClient, id: string, actor: Identity) {
  const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT r.id FROM Request r WHERE r.id = ${id} AND EXISTS (
      SELECT 1 FROM Contract c JOIN TenantProfile t ON t.id = c.tenantId
      JOIN RentalSpace s ON s.id = c.rentalSpaceId JOIN Unit u ON u.id = s.unitId
      JOIN LeasingManagerProfile m ON m.id = u.managerId
      WHERE c.id = r.contractId AND t.managerId = u.managerId AND ${actorSql(actor)}
    ) FOR UPDATE
  `);
  return rows.length > 0;
}
export async function caseActor(tx: Prisma.TransactionClient, request: FastifyRequest) {
  await lockUser(tx, request.user.sub);
  const user = await tx.user.findUnique({
    where: { id: request.user.sub },
    select: {
      id: true,
      role: true,
      status: true,
      leasingManager: { select: { fullName: true } },
      tenant: { select: { fullName: true } },
    },
  });
  if (!user || user.status !== 'ACTIVE' || user.role !== request.user.role || !request.user.sid)
    return null;
  if (
    !(await tx.authSession.findFirst({
      where: {
        id: request.user.sid,
        userId: user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    }))
  )
    return null;
  const name = user.role === 'TENANT' ? user.tenant?.fullName : user.leasingManager?.fullName;
  return {
    actorUserId: user.id,
    actorRole: user.role,
    actorName: Array.from(name ?? (user.role === 'TENANT' ? 'Tenant' : 'Leasing Manager'))
      .slice(0, 150)
      .join(''),
  };
}
export async function caseAudit(
  tx: Prisma.TransactionClient,
  request: FastifyRequest,
  row: { id: string; type: string; status: string; version: number },
  eventId: string,
  action: string,
) {
  await tx.auditEvent.create({
    data: {
      actorUserId: request.user.sub,
      action,
      entityType: 'Request',
      entityId: row.id,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      newValue: { eventId, type: row.type, status: row.status, version: row.version },
    },
  });
  if (row.status !== 'DRAFT') {
    const target = await tx.request.findUniqueOrThrow({
      where: { id: row.id },
      select: {
        contract: {
          select: {
            tenant: { select: { userId: true } },
            rentalSpace: {
              select: { unit: { select: { manager: { select: { userId: true } } } } },
            },
          },
        },
      },
    });
    const recipients = [
      ...new Set([target.contract.tenant.userId, target.contract.rentalSpace.unit.manager.userId]),
    ];
    await tx.notification.createMany({
      data: recipients.map((recipientUserId) => ({ recipientUserId, eventId })),
      skipDuplicates: true,
    });
    await queueCaseNotices(tx, eventId);
  }
}
