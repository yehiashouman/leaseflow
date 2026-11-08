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
async function decision(page: Page, label: string, message = '') {
  await page.getByRole('button', { name: label, exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  if (message) await dialog.getByLabel('Response', { exact: false }).fill(message);
  const response = page.waitForResponse(
    (reply) => reply.url().endsWith('/respond') && reply.request().method() === 'POST',
  );
  await dialog.getByRole('button', { name: 'Confirm', exact: true }).click();
  const result = await response;
  expect(result.status(), await result.text()).toBe(200);
  await expect(dialog).not.toBeVisible();
}

test('real tenant and manager exchange private case messages, disputes, and acknowledgement', async ({
  page,
  browser,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Browser cases require a dedicated _test database');
  const suffix = randomUUID().slice(0, 8);
  const password = 'CaseBrowserPass123!';
  const passwordHash = await hashPassword(password);
  const manager = await prisma.user.create({
    data: {
      email: suffix + '-manager@case-browser.invalid',
      passwordHash,
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Browser Case Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: suffix + '-tenant@case-browser.invalid',
      passwordHash,
      role: 'TENANT',
      status: 'ACTIVE',
      tenant: { create: { fullName: 'Browser Case Tenant', managerId } },
    },
    include: { tenant: true },
  });
  const userIds = [manager.id, tenant.id];
  const unit = await prisma.unit.create({
    data: {
      managerId,
      name: 'Case Browser Unit',
      area: 'Dubai',
      spaces: { create: { name: 'Case Browser Room', type: 'ROOM' } },
    },
    include: { spaces: true },
  });
  const contract = await prisma.contract.create({
    data: {
      tenantId: tenant.tenant!.id,
      rentalSpaceId: unit.spaces[0]!.id,
      startDate: new Date(),
      status: 'ACTIVE',
      monthlyRent: 3000,
    },
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.setExtraHTTPHeaders({ 'X-Forwarded-For': mobile ? '198.51.100.31' : '198.51.100.30' });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5176',
    viewport: page.viewportSize(),
    isMobile: mobile,
    hasTouch: mobile,
    extraHTTPHeaders: { 'X-Forwarded-For': mobile ? '198.51.100.41' : '198.51.100.40' },
  });
  const managerPage = await context.newPage();
  try {
    await login(page, tenant.email, password, 'My accommodation');
    await page.goto('/requests');
    await page.getByRole('button', { name: 'New request', exact: true }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Title *', { exact: true }).fill('Browser tap repair ' + suffix);
    await editor.getByLabel('Description *', { exact: true }).fill('Private browser report');
    await editor.getByLabel('Category', { exact: true }).fill('Plumbing');
    const submission = page.waitForResponse(
      (reply) => reply.url().endsWith('/requests') && reply.request().method() === 'POST',
    );
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    const created = await submission;
    expect(created.status()).toBe(201);
    const caseId = (await created.json()).id;
    await expect(editor).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Browser tap repair ' + suffix, exact: true }),
    ).toBeVisible();
    await login(managerPage, manager.email, password, 'Portfolio overview');
    await managerPage.goto('/requests/' + caseId);
    await expect(
      managerPage.getByRole('button', { name: 'Accept completion', exact: true }),
    ).not.toBeVisible();
    await managerPage.getByLabel('Message', { exact: true }).fill('A plumber will visit');
    const message = managerPage.waitForResponse(
      (reply) => reply.url().endsWith('/messages') && reply.request().method() === 'POST',
    );
    await managerPage.getByRole('button', { name: 'Send message', exact: true }).click();
    expect((await message).status()).toBe(201);
    await expect(managerPage.getByLabel('Message', { exact: true })).toHaveValue('');
    await decision(managerPage, 'Start work');
    await decision(managerPage, 'Mark resolved', 'The tap seal was replaced');
    await expect(
      managerPage.getByRole('button', { name: 'Close case', exact: true }),
    ).not.toBeVisible();
    await page.reload();
    await expect(page.getByText('A plumber will visit', { exact: true })).toBeVisible();
    await decision(page, 'Reopen case', 'The leak remains');
    await managerPage.reload();
    await decision(managerPage, 'Start work');
    await decision(managerPage, 'Mark resolved', 'The tap was replaced');
    await page.reload();
    await decision(page, 'Accept completion');
    await managerPage.reload();
    await decision(managerPage, 'Close case');
    await page.reload();
    await expect(page.getByLabel('Message', { exact: true })).not.toBeVisible();
    await expect(page.getByText('Completion accepted', { exact: false })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('case-history.png'), fullPage: true });
    const saved = await prisma.request.findUniqueOrThrow({
      where: { id: caseId },
      include: { events: { orderBy: { sequence: 'asc' } } },
    });
    expect(saved.status).toBe('CLOSED');
    expect(saved.version).toBe(9);
    expect(saved.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(saved.events[0].actorName).toBe('Browser Case Tenant');
    expect(saved.events[1].actorName).toBe('Browser Case Manager');
    expect(await prisma.payment.count({ where: { contractId: contract.id } })).toBe(0);
    expect(await prisma.depositEntry.count({ where: { contractId: contract.id } })).toBe(0);
  } finally {
    await context.close();
    await prisma.requestEvent.deleteMany({ where: { request: { contractId: contract.id } } });
    await prisma.request.deleteMany({ where: { contractId: contract.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.rentalSpace.deleteMany({ where: { unitId: unit.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
    await prisma.tenantProfile.delete({ where: { id: tenant.tenant!.id } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
