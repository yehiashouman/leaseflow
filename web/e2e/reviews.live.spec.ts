import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';
import { materializeBusinessJobs, runBusinessJobOnce } from '../../api/src/business-jobs.js';
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real annual review preserves a deferral, a visible next-month proposal, original rent, and participant notices', async ({
  page,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Review browser verification requires a _test database');
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.189' : '198.51.100.188',
  });
  const password = 'ReviewBrowser123!',
    passwordHash = await hashPassword(password),
    suffix = randomUUID();
  const manager = await prisma.user.create({
    data: {
      email: suffix + '-manager@review-browser.invalid',
      passwordHash,
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      leasingManager: { create: { fullName: 'Review Browser Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: suffix + '-tenant@review-browser.invalid',
      passwordHash,
      role: 'TENANT',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      tenant: { create: { fullName: 'Review Browser Tenant', managerId } },
    },
    include: { tenant: true },
  });
  const unit = await prisma.unit.create({
    data: { managerId, name: 'Review Browser Unit', area: 'Dubai' },
  });
  const space = await prisma.rentalSpace.create({
    data: { unitId: unit.id, name: 'Review Browser Room', type: 'ROOM' },
  });
  const start = new Date();
  start.setUTCFullYear(start.getUTCFullYear() - 1);
  start.setUTCMonth(start.getUTCMonth() - 1);
  start.setUTCHours(0, 0, 0, 0);
  const contract = await prisma.contract.create({
    data: {
      tenantId: tenant.tenant!.id,
      rentalSpaceId: space.id,
      startDate: start,
      monthlyRent: '3000.00',
      status: 'ACTIVE',
    },
  });
  try {
    await materializeBusinessJobs('', new Date(), contract.id);
    for (let i = 0; i < 4; i++)
      if (!(await runBusinessJobOnce({ kinds: ['ANNUAL_REVIEW'] }))) break;
    const review = await prisma.contractReview.findFirstOrThrow({
      where: { contractId: contract.id },
      orderBy: { dueAt: 'asc' },
    });
    async function login(email: string) {
      await page.goto('/login');
      await page.getByLabel('Email', { exact: true }).fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    await login(manager.email);
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await page.goto('/reviews/' + review.id);
    await page.getByRole('button', { name: 'Defer review', exact: true }).click();
    let dialog = page.getByRole('dialog');
    const deferred = new Date();
    deferred.setUTCDate(deferred.getUTCDate() + 30);
    await dialog
      .getByLabel('Shared review note *', { exact: true })
      .fill('Arrange a shared review date.');
    await dialog
      .getByLabel('Deferred review date (Asia/Dubai) *', { exact: true })
      .fill(deferred.toISOString().slice(0, 10));
    await dialog
      .getByLabel('I confirm this review record; contract rent stays unchanged *', { exact: true })
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByText('Arrange a shared review date.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Propose next-month rent', exact: true }).click();
    dialog = page.getByRole('dialog');
    await dialog
      .getByLabel('Shared review note *', { exact: true })
      .fill('Proposed price for shared discussion.');
    await dialog.getByLabel('Proposed monthly rent (AED) *', { exact: true }).fill('3200.25');
    await dialog
      .getByLabel('I confirm this review record; contract rent stays unchanged *', { exact: true })
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await expect(page.getByText(/Proposed rent: AED 3200.25/)).toBeVisible();
    expect(
      (await prisma.contract.findUniqueOrThrow({ where: { id: contract.id } })).monthlyRent.toFixed(
        2,
      ),
    ).toBe('3000.00');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await login(tenant.email);
    await expect(
      page.getByRole('heading', { name: 'My accommodation', exact: true }),
    ).toBeVisible();
    await page.goto('/notifications');
    await page.getByRole('link', { name: 'Annual contract review', exact: true }).click();
    await expect(page.getByText(/Proposed rent: AED 3200.25/)).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Propose next-month rent', exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath('annual-review-proposal-original-rent.png'),
      fullPage: true,
    });
  } finally {
    const reviews = await prisma.contractReview.findMany({
        where: { contractId: contract.id },
        select: { id: true },
      }),
      payments = await prisma.payment.findMany({
        where: { contractId: contract.id },
        select: { id: true },
      }),
      jobs = await prisma.businessJob.findMany({
        where: { contractId: contract.id },
        select: { id: true },
      });
    await prisma.notification.deleteMany({
      where: { reviewEvent: { review: { contractId: contract.id } } },
    });
    await prisma.contractAmendment.deleteMany({ where: { contractId: contract.id } });
    await prisma.contractReviewEvent.deleteMany({ where: { review: { contractId: contract.id } } });
    await prisma.contractReview.deleteMany({ where: { contractId: contract.id } });
    await prisma.businessJobRetry.deleteMany({ where: { job: { contractId: contract.id } } });
    await prisma.businessJob.deleteMany({ where: { contractId: contract.id } });
    await prisma.payment.deleteMany({ where: { contractId: contract.id } });
    await prisma.contract.delete({ where: { id: contract.id } });
    await prisma.rentalSpace.delete({ where: { id: space.id } });
    await prisma.unit.delete({ where: { id: unit.id } });
    const ids = [manager.id, tenant.id];
    await prisma.auditEvent.deleteMany({
      where: {
        OR: [
          { actorUserId: { in: ids } },
          { entityId: { in: [...reviews, ...payments, ...jobs].map((row) => row.id) } },
        ],
      },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tenantProfile.delete({ where: { id: tenant.tenant!.id } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
});
