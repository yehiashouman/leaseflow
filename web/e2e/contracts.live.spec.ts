import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real contract records preserve terms, payment amounts, deposit disputes, and draft privacy', async ({
  page,
  browser,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Browser contracts require a dedicated _test database');
  const suffix = randomUUID().slice(0, 8);
  const password = 'ContractBrowserPass123!';
  const passwordHash = await hashPassword(password);
  const manager = await prisma.user.create({
    data: {
      email: suffix + '-manager@contract-browser.invalid',
      passwordHash,
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Contract Browser Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: suffix + '-tenant@contract-browser.invalid',
      passwordHash,
      role: 'TENANT',
      status: 'ACTIVE',
      tenant: { create: { fullName: 'Contract Browser Tenant', managerId } },
    },
    include: { tenant: true },
  });
  const unit = await prisma.unit.create({
    data: {
      managerId,
      name: 'Contract Browser Unit',
      area: 'Dubai',
      ownerMonthlyRent: '9999.99',
      spaces: { create: { name: 'Contract Browser Room', type: 'ROOM' } },
    },
    include: { spaces: true },
  });
  const contract = await prisma.contract.create({
    data: {
      tenantId: tenant.tenant!.id,
      rentalSpaceId: unit.spaces[0]!.id,
      status: 'ACTIVE',
      startDate: new Date('2026-01-01T00:00:00Z'),
      monthlyRent: '3000.10',
      depositAmount: '2000.05',
      noticeDays: 15,
      payments: {
        create: Array.from({ length: 21 }, (_, index) => ({
          periodStart: new Date(Date.UTC(2025, index, 1)),
          dueDate: new Date(Date.UTC(2025, index, 1)),
          amountDue: '3000.10',
          amountPaid: '1000.05',
          status: 'PARTIALLY_PAID',
          evidenceKey: 'never-public-payment-key',
        })),
      },
      depositEntries: {
        create: {
          type: 'DEDUCTION_PROPOSED',
          amount: '75.25',
          description: 'Tenant disputed this proposal',
          tenantDisputedAt: new Date(),
          evidenceKey: 'never-public-deposit-key',
        },
      },
      requests: {
        create: [
          {
            type: 'MAINTENANCE',
            title: 'Visible contract repair',
            description: 'Shared case',
            status: 'SUBMITTED',
          },
          {
            type: 'GENERAL',
            title: 'Private contract draft',
            description: 'Tenant-only case',
            status: 'DRAFT',
          },
        ],
      },
    },
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': mobile ? '198.51.100.61' : '198.51.100.60' });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5176',
    viewport: page.viewportSize(),
    isMobile: mobile,
    hasTouch: mobile,
    extraHTTPHeaders: { 'X-Forwarded-For': mobile ? '198.51.100.71' : '198.51.100.70' },
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(tenant.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
    await page.getByRole('link', { name: 'My contracts', exact: true }).click();
    await page.getByRole('link', { name: 'Contract Browser Room', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Contract Browser Room contract' }),
    ).toBeVisible();
    await expect(page.getByText('Open-ended', { exact: true })).toBeVisible();
    await expect(page.getByText('15 days', { exact: true })).toBeVisible();
    await expect(page.getByText('AED 2,000.05', { exact: true })).toBeVisible();
    await expect(page.getByText('AED 1,000.05', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Next', exact: true }).click();
    await expect(page.getByText('Page 2 · 21 records', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Deposit entries', exact: true }).click();
    await expect(page.getByText('Tenant disputed this proposal', { exact: true })).toBeVisible();
    await expect(page.getByText('Dispute recorded:', { exact: false })).toBeVisible();
    await page.getByRole('button', { name: 'Cases', exact: true }).click();
    await expect(
      page.getByRole('link', { name: 'Private contract draft', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Page 1 · 2 records', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('contract-records.png'), fullPage: true });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Contract Browser Room contract' }),
    ).toBeVisible();
    const managerPage = await context.newPage();
    await managerPage.goto('/login');
    await managerPage.getByLabel('Email', { exact: true }).fill(manager.email);
    await managerPage.getByLabel('Password', { exact: true }).fill(password);
    await managerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(managerPage.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
    await managerPage.goto('/contracts/' + contract.id);
    await managerPage.getByRole('button', { name: 'Cases', exact: true }).click();
    await expect(
      managerPage.getByRole('link', { name: 'Visible contract repair', exact: true }),
    ).toBeVisible();
    await expect(
      managerPage.getByRole('link', { name: 'Private contract draft', exact: true }),
    ).not.toBeVisible();
    await expect(managerPage.getByText('Page 1 · 1 records', { exact: true })).toBeVisible();
    expect(await prisma.payment.count({ where: { contractId: contract.id } })).toBe(21);
    expect(await prisma.depositEntry.count({ where: { contractId: contract.id } })).toBe(1);
    expect(
      (
        await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })
      ).monthlyRent.toString(),
    ).toBe('3000.1');
  } finally {
    await context.close();
    const ids = [manager.id, tenant.id];
    await prisma.request.deleteMany({ where: { contractId: contract.id } });
    await prisma.payment.deleteMany({ where: { contractId: contract.id } });
    await prisma.depositEntry.deleteMany({ where: { contractId: contract.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.rentalSpace.deleteMany({ where: { unitId: unit.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
    await prisma.tenantProfile.delete({ where: { userId: tenant.id } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});
