import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { activeAccount } from '../account-data.js';
import { allowRoles } from '../auth.js';
import { caseContractScope, lockCaseContract } from '../case-data.js';
import { prisma } from '../db.js';
import { deduction, depositBalance } from '../deposit-ledger.js';

const id = z.string().min(1).max(191);
const money = z
  .string()
  .regex(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/)
  .refine((value) => new Prisma.Decimal(value).gt(0))
  .transform((value) => new Prisma.Decimal(value).toFixed(2));
const message = z.string().trim().min(3).max(3000);
const category = z.enum([
  'NOTICE',
  'DAMAGE',
  'MISSING_ITEM_OR_KEY',
  'EXCEPTIONAL_CLEANING',
  'OTHER',
]);
const cash = {
  amount: money,
  recordedAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value).toISOString()),
  method: z.string().trim().min(1).max(60),
  reference: z.string().trim().max(150).nullable().default(null),
  message: message.optional(),
};
const base = { clientId: z.uuid() };
const revision = { entryId: id, expectedSequence: z.number().int().positive() };
const command = z.discriminatedUnion('action', [
  z.strictObject({ ...base, action: z.literal('RECEIVE'), ...cash }),
  z.strictObject({ ...base, action: z.literal('REFUND'), ...cash }),
  z.strictObject({ ...base, action: z.literal('PROPOSE'), amount: money, category, message }),
  z.strictObject({
    ...base,
    ...revision,
    action: z.literal('REVISE'),
    amount: money,
    category,
    message,
  }),
  z.strictObject({ ...base, ...revision, action: z.literal('ACCEPT') }),
  z.strictObject({ ...base, ...revision, action: z.literal('DISPUTE'), message }),
  z.strictObject({ ...base, ...revision, action: z.literal('DEADLOCK'), message }),
  z.strictObject({ ...base, ...revision, action: z.literal('MESSAGE'), message }),
  z.strictObject({ ...base, ...revision, action: z.literal('ACKNOWLEDGE_REFUND') }),
]);
type Command = z.infer<typeof command>;

const entrySelect = {
  id: true,
  type: true,
  amount: true,
  recordedAt: true,
  createdAt: true,
  method: true,
  reference: true,
  category: true,
  description: true,
  tenantAcceptedAt: true,
  tenantDisputedAt: true,
  events: {
    orderBy: { sequence: 'asc' },
    select: {
      id: true,
      action: true,
      actorRole: true,
      amount: true,
      category: true,
      message: true,
      sequence: true,
      createdAt: true,
    },
  },
} satisfies Prisma.DepositEntrySelect;
type Entry = Prisma.DepositEntryGetPayload<{ select: typeof entrySelect }>;

const managerActions: string[] = ['RECEIVE', 'REFUND', 'PROPOSE', 'REVISE'];
const tenantActions: string[] = ['ACCEPT', 'DISPUTE', 'ACKNOWLEDGE_REFUND'];
const pending = ['PROPOSE', 'REVISE'];
const disputed = ['DISPUTE', 'DEADLOCK'];

function available(entry: Entry, role: string) {
  const state = deduction(entry).status;
  if (entry.type === 'REFUND' && role === 'TENANT' && state === 'REFUND')
    return ['ACKNOWLEDGE_REFUND'];
  if (entry.type !== 'DEDUCTION_PROPOSED') return [];
  const allowed =
    role === 'TENANT' && pending.includes(state)
      ? ['ACCEPT', 'DISPUTE']
      : role === 'LEASING_MANAGER' && [...pending, ...disputed].includes(state)
        ? ['REVISE']
        : [];
  if (state === 'DISPUTE') allowed.push('DEADLOCK');
  if ([...pending, ...disputed].includes(state)) allowed.push('MESSAGE');
  return allowed;
}

export const depositRoutes: FastifyPluginAsync = async (app) => {
  const participants = allowRoles('LEASING_MANAGER', 'TENANT');
  app.addHook('onSend', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });

  async function load(
    tx: Prisma.TransactionClient,
    contractId: string,
    actor: Parameters<typeof caseContractScope>[0],
  ) {
    const contract = await tx.contract.findFirst({
      where: {
        id: contractId,
        ...caseContractScope(actor),
        status: { notIn: ['DRAFT', 'CANCELLED'] },
      },
      select: { id: true, depositAmount: true, status: true, currency: true },
    });
    if (!contract) throw app.httpErrors.notFound('Contract not found');
    const entries = await tx.depositEntry.findMany({
      where: { contractId },
      select: entrySelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    const balance = depositBalance(entries, contract.depositAmount, contract.status);
    return { contract, entries, balance };
  }

  app.get('/:contractId/deposit', { preHandler: participants }, async (request) => {
    const { contractId } = z.object({ contractId: id }).parse(request.params);
    const { page } = z
      .object({ page: z.coerce.number().int().min(1).max(10000).default(1) })
      .strict()
      .parse(request.query);
    return prisma.$transaction(
      async (tx) => {
        const { contract, entries, balance } = await load(tx, contractId, request.user);
        return {
          currency: contract.currency,
          required: contract.depositAmount,
          balance,
          canReceive:
            request.user.role === 'LEASING_MANAGER' &&
            balance.reconciled &&
            contract.status !== 'CLOSED' &&
            balance.outstanding.gt(0),
          canPropose:
            request.user.role === 'LEASING_MANAGER' &&
            balance.reconciled &&
            balance.held.gt(balance.reserved),
          canRefund: request.user.role === 'LEASING_MANAGER' && balance.refundable.gt(0),
          items: entries.slice((page - 1) * 20, page * 20).map((entry) => ({
            ...entry,
            ...(entry.type === 'DEDUCTION_PROPOSED' ? { proposal: deduction(entry) } : {}),
            allowedActions: available(entry, request.user.role),
          })),
          total: entries.length,
          page,
          pageSize: 20,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  });

  app.post(
    '/:contractId/deposit/commands',
    { preHandler: participants },
    async (request, reply) => {
      const { contractId } = z.object({ contractId: id }).parse(request.params);
      const input = command.parse(request.body);
      if (
        (managerActions.includes(input.action) && request.user.role !== 'LEASING_MANAGER') ||
        (tenantActions.includes(input.action) && request.user.role !== 'TENANT')
      )
        throw app.httpErrors.forbidden('This deposit action is unavailable for your role.');
      const hash = createHash('sha256')
        .update(JSON.stringify({ contractId, ...input }))
        .digest('hex');
      const result = await prisma.$transaction(
        async (tx) => {
          if (!(await activeAccount(tx, request)))
            throw app.httpErrors.unauthorized('Session is no longer active');
          if (!(await lockCaseContract(tx, contractId, request.user)))
            throw app.httpErrors.notFound('Contract not found');
          const { contract, entries, balance } = await load(tx, contractId, request.user);
          const duplicate = await tx.depositEvent.findUnique({
            where: {
              actorUserId_clientId: { actorUserId: request.user.sub, clientId: input.clientId },
            },
            select: { payloadHash: true, entryId: true },
          });
          if (duplicate) {
            if (duplicate.payloadHash !== hash)
              throw app.httpErrors.conflict('Deposit key reused with different content.');
            return { entryId: duplicate.entryId, repeated: true };
          }
          let entryId: string;
          let sequence = 1;
          if ('entryId' in input) {
            const entry = entries.find((row) => row.id === input.entryId);
            if (!entry) throw app.httpErrors.notFound('Deposit entry not found');
            if (entry.events.at(-1)?.sequence !== input.expectedSequence)
              throw app.httpErrors.conflict(
                'The deposit history changed. Refresh before you retry.',
              );
            if (!available(entry, request.user.role).includes(input.action))
              throw app.httpErrors.conflict('The deposit action is unavailable for this entry.');
            const terms = deduction(entry);
            if (input.action === 'ACCEPT') {
              checkLimit(balance.reconciled, terms.amount, balance.held);
              await tx.depositEntry.create({
                data: {
                  contractId,
                  type: 'DEDUCTION_ACCEPTED',
                  sourceProposalId: entry.id,
                  amount: terms.amount,
                  category: terms.category,
                  description: entry.description,
                  tenantAcceptedAt: new Date(),
                },
              });
            }
            if (input.action === 'REVISE')
              checkLimit(
                balance.reconciled,
                input.amount,
                balance.held.minus(balance.reserved).plus(terms.amount),
              );
            entryId = entry.id;
            sequence = input.expectedSequence + 1;
          } else {
            if (input.action === 'RECEIVE')
              checkLimit(
                balance.reconciled && contract.status !== 'CLOSED',
                input.amount,
                balance.outstanding,
              );
            if (input.action === 'REFUND')
              checkLimit(
                balance.reconciled && contract.status === 'CLOSED',
                input.amount,
                balance.refundable,
              );
            if (input.action === 'PROPOSE')
              checkLimit(balance.reconciled, input.amount, balance.held.minus(balance.reserved));
            if ('recordedAt' in input && new Date(input.recordedAt).getTime() > Date.now())
              throw app.httpErrors.unprocessableEntity('Enter a recorded date in the past.');
            const row = await tx.depositEntry.create({
              data: newEntry(contractId, input),
              select: { id: true },
            });
            entryId = row.id;
          }
          const event = await tx.depositEvent.create({
            data: {
              entryId,
              actorUserId: request.user.sub,
              actorRole: request.user.role,
              clientId: input.clientId,
              payloadHash: hash,
              sequence,
              action: input.action,
              amount: 'amount' in input ? input.amount : null,
              category: 'category' in input ? input.category : null,
              message: 'message' in input ? input.message : null,
            },
            select: { id: true },
          });
          await tx.auditEvent.create({
            data: {
              actorUserId: request.user.sub,
              action: 'DEPOSIT_' + input.action,
              entityType: 'DepositEntry',
              entityId: entryId,
              ip: request.ip,
              newValue: { contractId, eventId: event.id, sequence },
            },
          });
          return { entryId, repeated: false };
        },
        { isolationLevel: 'ReadCommitted' },
      );
      return reply.code(result.repeated ? 200 : 201).send({ entryId: result.entryId });
    },
  );

  function checkLimit(
    availableBalance: boolean,
    amount: Prisma.Decimal.Value,
    maximum: Prisma.Decimal,
  ) {
    if (!availableBalance || maximum.lt(amount))
      throw app.httpErrors.conflict('The amount exceeds the available deposit balance.');
  }
};

function newEntry(
  contractId: string,
  input: Exclude<Command, { entryId: string }>,
): Prisma.DepositEntryUncheckedCreateInput {
  return {
    contractId,
    amount: input.amount,
    description: input.message,
    type:
      input.action === 'RECEIVE'
        ? 'RECEIVED'
        : input.action === 'REFUND'
          ? 'REFUND'
          : 'DEDUCTION_PROPOSED',
    ...('recordedAt' in input
      ? { recordedAt: new Date(input.recordedAt), method: input.method, reference: input.reference }
      : { category: input.category }),
  };
}
