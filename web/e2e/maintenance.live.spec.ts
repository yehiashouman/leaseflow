import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});
async function login(page: Page, email: string, password: string, heading: string) {
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
}
async function proposal(page: Page, value: string) {
  await page.getByRole('button', { name: 'Record responsibility', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Responsibility', { exact: true }).selectOption('TENANT_COST');
  await dialog.getByLabel('Proposed tenant cost', { exact: true }).fill(value);
  await dialog
    .getByLabel('Explanation *', { exact: true })
    .fill('Broken handle requires replacement');
  await dialog
    .getByLabel('Evidence notes', { exact: true })
    .fill('Inspection on 8 November recorded a snapped handle.');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
async function decision(page: Page, label: string, reason: string) {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Response explanation *', { exact: true }).fill(reason);
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}
test('real manager and tenant preserve maintenance proposals, disputes, and accepted responsibility without charges', async ({
  page,
  browser,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Maintenance browser tests require a dedicated _test database');
  const suffix = randomUUID().slice(0, 8),
    password = 'MaintenanceBrowser123!';
  const passwordHash = await hashPassword(password);
  const manager = await prisma.user.create({
    data: {
      email: suffix + '-manager@maintenance-browser.invalid',
      passwordHash,
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Browser Maintenance Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: suffix + '-tenant@maintenance-browser.invalid',
      passwordHash,
      role: 'TENANT',
      status: 'ACTIVE',
      tenant: { create: { fullName: 'Browser Maintenance Tenant', managerId } },
    },
    include: { tenant: true },
  });
  const unit = await prisma.unit.create({
    data: {
      managerId,
      name: 'Maintenance Browser Unit',
      area: 'Dubai',
      spaces: { create: { name: 'Repair Room', type: 'ROOM' } },
    },
    include: { spaces: true },
  });
  const contract = await prisma.contract.create({
    data: {
      tenantId: tenant.tenant!.id,
      rentalSpaceId: unit.spaces[0]!.id,
      status: 'ACTIVE',
      startDate: new Date(),
      monthlyRent: 3000,
    },
  });
  const request = await prisma.request.create({
    data: {
      contractId: contract.id,
      type: 'MAINTENANCE',
      title: 'Browser handle repair',
      description: 'A broken handle',
      status: 'IN_PROGRESS',
      version: 1,
      events: {
        create: {
          kind: 'IN_PROGRESS',
          message: 'Repair underway',
          sequence: 1,
          actorName: 'Browser Maintenance Manager',
          actorRole: 'LEASING_MANAGER',
          actorUserId: manager.id,
        },
      },
    },
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': mobile ? '198.51.100.81' : '198.51.100.80' });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5176',
    viewport: page.viewportSize(),
    isMobile: mobile,
    hasTouch: mobile,
    extraHTTPHeaders: { 'X-Forwarded-For': mobile ? '198.51.100.101' : '198.51.100.100' },
  });
  try {
    await login(page, manager.email, password, 'Portfolio overview');
    await page.goto('/requests/' + request.id);
    await proposal(page, '150.25');
    const tenantPage = await context.newPage();
    await login(tenantPage, tenant.email, password, 'My accommodation');
    await tenantPage.goto('/requests/' + request.id);
    await expect(
      tenantPage.getByRole('button', { name: 'Record responsibility', exact: true }),
    ).not.toBeVisible();
    await decision(tenantPage, 'Dispute proposed cost', 'The handle was damaged before arrival');
    await expect(tenantPage.getByText('Cost disputed', { exact: true })).toBeVisible();
    await page.reload();
    await proposal(page, '75.25');
    await tenantPage.reload();
    await decision(tenantPage, 'Accept proposed cost', 'I accept the revised proposed amount');
    await expect(tenantPage.getByText('Cost accepted', { exact: true })).toBeVisible();
    await expect(tenantPage.getByText('Cost disputed', { exact: true })).toBeVisible();
    await tenantPage.reload();
    await expect(tenantPage.getByText('Cost accepted', { exact: true })).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('button', { name: 'Record responsibility', exact: true }),
    ).not.toBeVisible();
    expect(
      await tenantPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await tenantPage.screenshot({
      path: testInfo.outputPath('maintenance-responsibility.png'),
      fullPage: true,
      animations: 'disabled',
    });
    const saved = await prisma.request.findUniqueOrThrow({
      where: { id: request.id },
      include: { maintenanceAssessments: { orderBy: { caseVersion: 'asc' } } },
    });
    expect(saved.status).toBe('IN_PROGRESS');
    expect(saved.version).toBe(5);
    expect(saved.maintenanceAssessments.map((item) => item.decision)).toEqual([
      'DISPUTED',
      'ACCEPTED',
    ]);
    expect(saved.maintenanceAssessments.map((item) => item.proposedAmount?.toString())).toEqual([
      '150.25',
      '75.25',
    ]);
    expect(await prisma.payment.count({ where: { contractId: contract.id } })).toBe(0);
    expect(await prisma.depositEntry.count({ where: { contractId: contract.id } })).toBe(0);
  } finally {
    await context.close();
    const users = [manager.id, tenant.id];
    await prisma.maintenanceAssessment.deleteMany({ where: { requestId: request.id } });
    await prisma.notification.deleteMany({ where: { event: { requestId: request.id } } });
    await prisma.requestEvent.deleteMany({ where: { requestId: request.id } });
    await prisma.request.delete({ where: { id: request.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.rentalSpace.deleteMany({ where: { unitId: unit.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
    await prisma.tenantProfile.delete({ where: { userId: tenant.id } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: users } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: users } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: users } } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
});
