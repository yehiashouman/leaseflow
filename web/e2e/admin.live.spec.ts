import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real administrator review and audit screens preserve role and identity boundaries', async ({
  page,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Dedicated _test database required');
  const suffix = randomUUID().slice(0, 8);
  const password = 'AdminReviewBrowser123!';
  const admin = await prisma.user.create({
    data: {
      email: suffix + '@admin-browser.invalid',
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  const manager = await prisma.user.create({
    data: {
      email: suffix + '@review-browser.invalid',
      passwordHash: 'not-a-login-hash',
      role: 'LEASING_MANAGER',
      status: 'PENDING_APPROVAL',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      leasingManager: {
        create: {
          fullName: 'Review Applicant ' + suffix,
          emiratesIdNumber: '784-2000-1234567-8',
          licenseNumber: 'LIC-12345678',
          declarationAcceptedAt: new Date(),
        },
      },
    },
    include: { leasingManager: true },
  });
  await prisma.auditEvent.create({
    data: {
      actorUserId: admin.id,
      entityType: 'User',
      entityId: manager.id,
      action: 'MANAGER_REVIEW',
      newValue: { sensitive: 'Never display this body' },
    },
  });
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.91' : '198.51.100.90',
  });
  const apiResponses: string[] = [];
  page.on('response', async (response) => {
    if (response.url().includes('/api/v1/admin/'))
      apiResponses.push(await response.text().catch(() => ''));
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(admin.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
    await page.goto('/admin/managers');
    await page.getByLabel('Search managers', { exact: true }).fill(suffix);
    await page.getByRole('link', { name: 'Review Applicant ' + suffix, exact: true }).click();
    await expect(page.getByText('****67-8', { exact: true })).toBeVisible();
    await expect(page.getByText('****5678', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve', exact: true })).not.toBeVisible();
    await expect(page.getByText('MFA and policy approval required', { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('manager-review.png'), fullPage: true });
    await page.goto('/admin/audit');
    await page.getByLabel('Audit action', { exact: true }).fill('MANAGER_REVIEW');
    await expect(
      page.getByRole('cell', { name: 'MANAGER_REVIEW', exact: true }).first(),
    ).toBeVisible();
    expect(apiResponses.join('')).not.toContain('Never display this body');
    expect(apiResponses.join('')).not.toContain('passwordHash');
    expect(apiResponses.join('')).not.toContain('784-2000-1234567-8');
    await page.goto('/units');
    await expect(
      page.getByRole('heading', { name: 'Platform overview', exact: true }),
    ).toBeVisible();
  } finally {
    await prisma.auditEvent.deleteMany({ where: { actorUserId: admin.id } });
    await prisma.leasingManagerProfile.delete({ where: { id: manager.leasingManager!.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: admin.id } });
    await prisma.authSession.deleteMany({ where: { userId: admin.id } });
    await prisma.user.deleteMany({ where: { id: { in: [admin.id, manager.id] } } });
  }
});
