import { Prisma, type ContractStatus, type DepositEntryType } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { depositBalance } from '../src/deposit-ledger.js';

const money = (value: string) => new Prisma.Decimal(value);
const entry = (type: DepositEntryType, amount: string) => ({
  type,
  amount: money(amount),
  category: null,
  events: [],
});

describe('deposit refund states', () => {
  it.each<{
    contract: ContractStatus;
    required: string;
    received: string;
    refunded: string;
    state: string;
    available: string;
  }>([
    {
      contract: 'ACTIVE',
      required: '0',
      received: '0',
      refunded: '0',
      state: 'NOT_REQUIRED',
      available: '0',
    },
    {
      contract: 'ACTIVE',
      required: '500',
      received: '0',
      refunded: '0',
      state: 'DUE',
      available: '0',
    },
    {
      contract: 'ACTIVE',
      required: '500',
      received: '300',
      refunded: '0',
      state: 'PARTIALLY_RECEIVED',
      available: '0',
    },
    {
      contract: 'ACTIVE',
      required: '500',
      received: '500',
      refunded: '0',
      state: 'HELD',
      available: '0',
    },
    {
      contract: 'CLOSED',
      required: '500',
      received: '500',
      refunded: '0',
      state: 'REFUND_PENDING',
      available: '500',
    },
    {
      contract: 'CLOSED',
      required: '500',
      received: '500',
      refunded: '300',
      state: 'PARTIALLY_REFUNDED',
      available: '200',
    },
    {
      contract: 'CLOSED',
      required: '500',
      received: '500',
      refunded: '500',
      state: 'REFUNDED',
      available: '0',
    },
  ])(
    'exposes $state and the ledger refund balance',
    ({ contract, required, received, refunded, state, available }) => {
      const balance = depositBalance(
        [entry('RECEIVED', received), entry('REFUND', refunded)],
        money(required),
        contract,
      );
      expect(balance.status).toBe(state);
      expect(balance.refundable.toString()).toBe(available);
    },
  );
});
