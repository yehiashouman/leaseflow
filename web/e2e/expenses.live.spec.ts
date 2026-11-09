import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real expense record, external recovery, immutable original, CSV, and reasoned void survive reload', async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.181' : '198.51.100.180',
  });
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Expense browser verification requires a _test database');
  const password = 'ExpenseBrowser123!',
    email = randomUUID() + '@expense-browser.invalid';
  const actor = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Expense Browser Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = actor.leasingManager!.id;
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await page.goto('/expenses');
    await page.getByRole('button', { name: 'Record expense', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Category *', { exact: true }).selectOption('MAINTENANCE');
    await dialog.getByLabel('Vendor *', { exact: true }).fill('Browser Repair Vendor');
    await dialog.getByLabel('Amount (selected currency) *', { exact: true }).fill('100.10');
    await dialog.getByLabel('Expense date (UTC) *', { exact: true }).fill('2026-11-09');
    await dialog.getByLabel('Notes', { exact: true }).fill('Original factual invoice');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole('link', { name: 'Browser Repair Vendor', exact: true }).click();
    await expect(page.getByText('Original factual invoice', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Record external recovery', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount (AED) *', { exact: true }).fill('20.10');
    await dialog.getByLabel('Payment date (UTC) *', { exact: true }).fill('2026-11-09');
    await dialog.getByLabel('Payment method *', { exact: true }).fill('Bank transfer');
    await dialog.getByLabel('Reference', { exact: true }).fill('Browser recovery reference');
    await dialog
      .getByLabel('I confirm this external payment already happened *', { exact: true })
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByText('Browser recovery reference', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Void expense', exact: true })).toBeDisabled();
    const expense = await prisma.expense.findFirstOrThrow({
      where: { managerId },
      include: { recoveries: true },
    });
    expect(expense.amount.toFixed(2)).toBe('100.10');
    expect(expense.recoveries[0]!.amount.toFixed(2)).toBe('20.10');
    await page.screenshot({ path: testInfo.outputPath('expense-recovery.png'), fullPage: true });
    await page.goto('/expenses');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV', exact: true }).click();
    expect((await download).suggestedFilename()).toBe('leaseflow-expenses.csv');
    const row = await prisma.expense.create({
      data: {
        managerId,
        amount: '5.00',
        currency: 'USD',
        vendor: 'Duplicate Browser Invoice',
        category: 'INTERNET',
        incurredAt: new Date('2026-11-09'),
      },
    });
    await page.goto('/expenses/' + row.id);
    await page.getByRole('button', { name: 'Void expense', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason *', { exact: true }).fill('Duplicate source invoice');
    await dialog
      .getByLabel('I confirm this void preserves the original record *', { exact: true })
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByText(/VOID: Duplicate source invoice/)).toBeVisible();
  } finally {
    const where = { managerId };
    await prisma.expenseRecovery.deleteMany({ where: { expense: where } });
    await prisma.expenseVoid.deleteMany({ where: { expense: where } });
    await prisma.expense.deleteMany({ where });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: actor.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: actor.id } });
    await prisma.authSession.deleteMany({ where: { userId: actor.id } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.delete({ where: { id: actor.id } });
  }
});
