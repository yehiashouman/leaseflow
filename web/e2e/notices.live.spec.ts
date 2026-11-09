import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real case notices retain private delivery history and require acknowledgement before an uncertain resend', async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.185' : '198.51.100.184',
  });
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Notice browser verification requires a _test database');
  const suffix = randomUUID(),
    password = 'NoticeBrowser123!',
    passwordHash = await hashPassword(password);
  const manager = await prisma.user.create({
    data: {
      email: suffix + '-manager@notice-browser.invalid',
      passwordHash,
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      leasingManager: { create: { fullName: 'Notice Browser Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: suffix + '-tenant@notice-browser.invalid',
      passwordHash,
      role: 'TENANT',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phone: '+971' + String(Math.floor(Math.random() * 100000000)).padStart(8, '0'),
      phoneVerifiedAt: new Date(),
      tenant: { create: { fullName: 'Notice Browser Tenant', managerId } },
    },
    include: { tenant: true },
  });
  const unit = await prisma.unit.create({
    data: {
      managerId,
      name: 'Notice Browser Unit',
      area: 'Dubai',
      spaces: { create: { name: 'Notice Room', type: 'ROOM' } },
    },
    include: { spaces: true },
  });
  const contract = await prisma.contract.create({
    data: {
      tenantId: tenant.tenant!.id,
      rentalSpaceId: unit.spaces[0]!.id,
      startDate: new Date('2026-01-01'),
      monthlyRent: 3000,
      status: 'ACTIVE',
    },
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(tenant.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'My accommodation', exact: true }),
    ).toBeVisible();
    await page.goto('/requests');
    await page.getByRole('button', { name: 'New request', exact: true }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel('Request type *', { exact: true }).selectOption('GENERAL');
    await dialog.getByLabel('Title *', { exact: true }).fill('Notice Browser Case');
    await dialog
      .getByLabel('Description *', { exact: true })
      .fill('PRIVATE_DESCRIPTION_REMAINS_INSIDE_APP');
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Notice Browser Case', exact: true }),
    ).toBeVisible();
    const request = await prisma.request.findFirstOrThrow({ where: { contractId: contract.id } });
    const delivery = await prisma.noticeDelivery.findFirstOrThrow({
      where: {
        recipientUserId: tenant.id,
        channel: 'EMAIL',
        notification: { event: { requestId: request.id } },
      },
    });
    await prisma.noticeDelivery.update({
      where: { id: delivery.id },
      data: { state: 'UNKNOWN', attempts: 1, failureCode: 'WORKER_INTERRUPTED' },
    });
    await prisma.noticeAttempt.create({
      data: { deliveryId: delivery.id, number: 1, state: 'UNKNOWN', finishedAt: new Date() },
    });
    await page.goto('/delivery');
    await expect(page.getByRole('heading', { name: 'Delivery status', exact: true })).toBeVisible();
    await expect(page.getByText('Send result uncertain', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Retry notice', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Send another notice to my current verified contact *', { exact: true })
      .check();
    await dialog
      .getByLabel('I understand the previous notice can already have arrived *', { exact: true })
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const retry = await prisma.noticeDelivery.findFirstOrThrow({
      where: { notificationId: delivery.notificationId, channel: 'EMAIL', retrySequence: 1 },
    });
    expect(retry.state).toBe('PAUSED');
    await page.reload();
    await expect(page.getByText('SMTP server accepted', { exact: true })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Retry notice', exact: true })).toHaveCount(0);
    expect((await prisma.request.findUniqueOrThrow({ where: { id: request.id } })).status).toBe(
      'SUBMITTED',
    );
    await page.screenshot({
      path: testInfo.outputPath('private-delivery-history.png'),
      fullPage: true,
    });
  } finally {
    await prisma.notification.deleteMany({
      where: { event: { request: { contractId: contract.id } } },
    });
    await prisma.requestEvent.deleteMany({ where: { request: { contractId: contract.id } } });
    await prisma.request.deleteMany({ where: { contractId: contract.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.rentalSpace.deleteMany({ where: { unitId: unit.id } });
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
