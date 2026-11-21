import { Prisma, type ContractStatus, type DepositEntryType } from '@prisma/client';

type Event = { action: string; amount: Prisma.Decimal | null; category: string | null };
type Entry = {
  type: DepositEntryType;
  amount: Prisma.Decimal;
  category: string | null;
  events: Event[];
};

export function deduction(entry: Entry) {
  const current = [...entry.events].reverse().find(({ action }) => action !== 'MESSAGE');
  const terms = [...entry.events].reverse().find(({ action }) => action === 'REVISE');
  return {
    amount: terms?.amount ?? entry.amount,
    category: terms?.category ?? entry.category,
    status: current?.action ?? 'LEGACY',
  };
}

export function depositBalance(
  entries: Entry[],
  required: Prisma.Decimal,
  contractStatus: ContractStatus,
) {
  const zero = new Prisma.Decimal(0);
  const sum = (type: DepositEntryType) =>
    entries
      .filter((entry) => entry.type === type)
      .reduce((amount, entry) => amount.plus(entry.amount), zero);
  const received = sum('RECEIVED');
  const refunded = sum('REFUND');
  const deductions = sum('DEDUCTION_ACCEPTED');
  const held = received.minus(refunded).minus(deductions);
  const outstanding = Prisma.Decimal.max(required.minus(received), zero);
  const reserved = entries
    .filter((entry) => entry.type === 'DEDUCTION_PROPOSED')
    .map(deduction)
    .filter(({ status }) => ['PROPOSE', 'REVISE', 'DISPUTE', 'DEADLOCK'].includes(status))
    .reduce((amount, entry) => amount.plus(entry.amount), zero);
  const disputed = entries.some(
    (entry) =>
      entry.type === 'DEDUCTION_PROPOSED' &&
      ['DISPUTE', 'DEADLOCK'].includes(deduction(entry).status),
  );
  const reconciled =
    held.gte(0) &&
    !entries.some(
      (entry) =>
        entry.type === 'ADJUSTMENT' ||
        (entry.type === 'DEDUCTION_PROPOSED' && !entry.events.length),
    );
  const refundable =
    reconciled && contractStatus === 'CLOSED'
      ? Prisma.Decimal.max(held.minus(reserved), zero)
      : zero;
  const status = !reconciled
    ? 'RECONCILIATION_REQUIRED'
    : disputed
      ? 'DISPUTED'
      : refunded.gt(0)
        ? held.gt(0)
          ? 'PARTIALLY_REFUNDED'
          : 'REFUNDED'
        : contractStatus === 'CLOSED' && held.gt(0)
          ? 'REFUND_PENDING'
          : required.isZero() && received.isZero()
            ? 'NOT_REQUIRED'
            : outstanding.isZero()
              ? 'HELD'
              : received.gt(0)
                ? 'PARTIALLY_RECEIVED'
                : 'DUE';
  return {
    received,
    refunded,
    deductions,
    held,
    outstanding,
    reserved,
    refundable,
    disputed,
    reconciled,
    status,
  };
}
