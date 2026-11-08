import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real session security works through the browser and MySQL', async ({
  page,
  request,
  context,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Browser auth tests require a dedicated _test database');
  const password = 'BrowserPassword123!';
  const replacement = 'ReplacementPassword123!';
  const email = randomUUID() + '@browser.invalid';
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Browser Test Manager' } },
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
    const initial = (await context.cookies()).find(
      (cookie) => cookie.name === 'leaseflow_refresh',
    )!;
    expect(initial.httpOnly).toBe(true);
    expect(initial.sameSite).toBe('Strict');
    expect(await page.evaluate(() => document.cookie)).not.toContain('leaseflow_refresh');
    const second = await request.post('http://127.0.0.1:3000/api/v1/auth/login', {
      headers: { 'X-Leaseflow-Session': '1' },
      data: { email, password },
    });
    expect(second.status()).toBe(200);
    const secondToken = (await second.json()).accessToken;
    const other = await prisma.authSession.findFirstOrThrow({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
      await page.getByRole('dialog').getByRole('link', { name: 'Security', exact: true }).click();
    } else
      await page
        .getByRole('navigation')
        .getByRole('link', { name: 'Security', exact: true })
        .click();
    await page.getByRole('button', { name: 'Revoke session ' + other.id, exact: true }).click();
    const revocation = page.waitForResponse(
      (response) =>
        response.request().method() === 'DELETE' &&
        response.url().endsWith('/auth/sessions/' + other.id),
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    expect((await revocation).status()).toBe(204);
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
    expect(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: other.id } })).revokedAt,
    ).not.toBeNull();
    await expect(
      page.getByRole('button', { name: 'Revoke session ' + other.id, exact: true }),
    ).not.toBeVisible();
    expect(
      (
        await request.get('http://127.0.0.1:3000/api/v1/auth/me', {
          headers: { Authorization: 'Bearer ' + secondToken },
        })
      ).status(),
    ).toBe(401);
    await page.evaluate(() => sessionStorage.setItem('accessToken', 'expired-test-token'));
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Security', exact: true })).toBeVisible();
    expect(await page.evaluate(() => sessionStorage.getItem('accessToken'))).not.toBe(
      'expired-test-token',
    );
    const renewed = (await context.cookies()).find(
      (cookie) => cookie.name === 'leaseflow_refresh',
    )!;
    expect(renewed.value).not.toBe(initial.value);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('security-live.png'), fullPage: true });
    await page.getByLabel('Current password', { exact: true }).fill(password);
    await page.getByLabel('New password', { exact: true }).fill(replacement);
    await page.getByLabel('Confirm new password', { exact: true }).fill(replacement);
    await page.getByRole('button', { name: 'Change password', exact: true }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(replacement);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    const access = await page.evaluate(() => sessionStorage.getItem('accessToken'));
    if (testInfo.project.name === 'mobile')
      await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page
      .getByRole('button', { name: 'Sign out', exact: true })
      .filter({ visible: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
    expect(
      (
        await request.get('http://127.0.0.1:3000/api/v1/auth/me', {
          headers: { Authorization: 'Bearer ' + access },
        })
      ).status(),
    ).toBe(401);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { actorUserId: user.id } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.leasingManagerProfile.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
