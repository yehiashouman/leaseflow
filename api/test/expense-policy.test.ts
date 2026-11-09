import { describe, expect, it } from 'vitest';
import { expenseMoney, expenseSchema, csvCell } from '../src/expense-policy.js';
describe('expense input and export safety', () => {
  it('preserves decimal strings without binary floating-point coercion', () => {
    expect(expenseMoney.parse('9999999999.99')).toBe('9999999999.99');
    expect(expenseMoney.parse('0.01')).toBe('0.01');
  });
  it('rejects zero, negative, excessive precision, unsafe magnitude, and numeric payloads', () => {
    for (const value of ['0', '0.00', '-1', '0.001', '10000000000', '1e3', 0.1, 'NaN'])
      expect(expenseMoney.safeParse(value).success).toBe(false);
  });
  it('requires one explicit scope and rejects ownership injection', () => {
    const body = {
      clientId: crypto.randomUUID(),
      category: 'INTERNET',
      vendor: 'Provider',
      amount: '1.00',
      incurredAt: '2026-11-09',
    };
    expect(expenseSchema.safeParse(body).success).toBe(true);
    expect(expenseSchema.safeParse({ ...body, scopeKind: 'UNIT' }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...body, targetId: 'unit-1' }).success).toBe(false);
    expect(expenseSchema.safeParse({ ...body, managerId: 'another-manager' }).success).toBe(false);
  });
  it('quotes commas and quotes and neutralizes spreadsheet formula prefixes', () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    for (const text of ['=1+1', '+SUM(A1)', '-3+2', '@SUM(1)', '\t=1', ' \r=2'])
      expect(csvCell(text).startsWith('"\'')).toBe(true);
    expect(csvCell('125.50')).toBe('"125.50"');
  });
});
