import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real external rent receipt preserves exact cents and immutable history after reload', async ({
  page,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Payment browser verification requires a _test database');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.187' : '198.51.100.186',
  });
  const password = 'ReceiptBrowser123!',
    email = randomUUID() + '@receipt-browser.invalid';
  const manager = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Receipt Browser Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: randomUUID() + '@receipt-browser.invalid',
      passwordHash: 'not-for-login',
      role: 'TENANT',
      status: 'ACTIVE',
      tenant: { create: { fullName: 'Receipt Browser Tenant', managerId } },
    },
    include: { tenant: true },
  });
  const unit = await prisma.unit.create({
    data: { managerId, name: 'Receipt Browser Unit', area: 'Dubai' },
  });
  const space = await prisma.rentalSpace.create({
    data: { unitId: unit.id, name: 'Receipt Browser Room', type: 'ROOM' },
  });
  const contract = await prisma.contract.create({
    data: {
      rentalSpaceId: space.id,
      tenantId: tenant.tenant!.id,
      startDate: new Date('2026-01-01'),
      monthlyRent: '100.00',
      status: 'ACTIVE',
    },
  });
  const payment = await prisma.payment.create({
    data: {
      contractId: contract.id,
      periodStart: new Date('2026-01-01'),
      dueDate: new Date('2026-01-01'),
      amountDue: '100.00',
    },
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await page.goto('/contracts/' + contract.id);
    await page.getByRole('button', { name: 'View payment receipts', exact: true }).click();
    await page.getByRole('button', { name: 'Record external rent payment', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Amount (AED) *', { exact: true }).fill('10.10');
    await dialog
      .getByLabel('External payment date and time (UTC) *', { exact: true })
      .fill('2026-01-03T10:00');
    await dialog.getByLabel('Payment method *', { exact: true }).fill('Bank transfer');
    await dialog.getByLabel('Payment reference', { exact: true }).fill('Receipt browser reference');
    await dialog
      .getByLabel('I confirm this external rent payment already happened *', { exact: true })
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'View payment receipts', exact: true }).click();
    const receipts = page.getByRole('region', { name: 'External payment receipts' });
    await expect(receipts.getByText('Receipt browser reference', { exact: true })).toBeVisible();
    const saved = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(saved.amountDue.toFixed(2)).toBe('100.00');
    expect(saved.amountPaid.toFixed(2)).toBe('10.10');
    expect(await prisma.paymentReceipt.count({ where: { paymentId: payment.id } })).toBe(1);
    await page.screenshot({
      path: testInfo.outputPath('immutable-external-rent-receipt.png'),
      fullPage: true,
    });
  } finally {
    await prisma.paymentReceipt.deleteMany({ where: { paymentId: payment.id } });
    await prisma.payment.delete({ where: { id: payment.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.rentalSpace.delete({ where: { id: space.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
    const ids = [manager.id, tenant.id];
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantProfile.delete({ where: { id: tenant.tenant!.id } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});
