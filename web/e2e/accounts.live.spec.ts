import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { decryptMail } from '../../api/src/account-policy.js';
import { hashPassword } from '../../api/src/auth.js';
const password = 'AccountBrowser123!';
test.afterAll(async () => {
  await prisma.$disconnect();
});
async function mailToken(email: string, template: string) {
  const mail = await prisma.outboundEmail.findFirstOrThrow({
    where: { recipient: email, template },
    orderBy: { createdAt: 'desc' },
  });
  return /#token=([A-Za-z0-9_-]+)/.exec(decryptMail(mail.encryptedPayload).text)![1];
}
async function removeAccounts(emails: string[]) {
  const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    }),
    ids = users.map((user) => user.id);
  await prisma.outboundEmail.deleteMany({
    where: { OR: [{ recipient: { in: emails } }, { userId: { in: ids } }] },
  });
  await prisma.accountToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.accountConsent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.phoneChallenge.deleteMany({ where: { userId: { in: ids } } });
  await prisma.tenantInvitation.deleteMany({ where: { manager: { userId: { in: ids } } } });
  await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.authSession.deleteMany({ where: { userId: { in: ids } } });
  await prisma.tenantProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.leasingManagerProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}
async function setupLogin(page: Page, email: string, pass = password) {
  await page.goto('/account-setup');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(pass);
  await page.getByRole('button', { name: 'Open account setup', exact: true }).click();
}
test('real manager registration, email verification, session restrictions, and one-time password recovery', async ({
  page,
}, testInfo) => {
  const email = randomUUID() + '@account-browser.invalid';
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.171' : '198.51.100.170',
  });
  try {
    await page.goto('/register');
    await page.getByLabel('Full legal name', { exact: true }).fill('Account Browser Manager');
    await page.getByLabel('Date of birth', { exact: true }).fill('1990-01-02');
    await page.getByLabel('Nationality', { exact: true }).fill('Egyptian');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Mobile number', { exact: true }).fill('+971501111111');
    await page.getByLabel('I accept this declaration.').check();
    await page.getByRole('button', { name: 'Create manager account', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Account status', exact: true })).toBeVisible();
    await expect(page.getByText('PENDING EMAIL', { exact: true })).toBeVisible();
    await page.goto('/verify-email#token=' + (await mailToken(email, 'EMAIL_VERIFY')));
    await page.getByRole('button', { name: 'Verify email', exact: true }).click();
    await expect(
      page.getByText('Email verified. Complete WhatsApp verification in account setup.'),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Continue account setup' }).click();
    await expect(page.getByText('PENDING PHONE', { exact: true })).toBeVisible();
    await expect(
      page.getByText(
        'Platform activation remains pending. It does not certify legal sufficiency or authorization.',
      ),
    ).toBeVisible();
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.status).toBe('PENDING_PHONE');
    await page.getByRole('button', { name: 'End account setup session', exact: true }).click();
    await page.goto('/forgot-password');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Request reset email', exact: true }).click();
    await expect(
      page.getByText('If the verified account exists, a reset email will arrive.'),
    ).toBeVisible();
    const reset = await mailToken(email, 'PASSWORD_RESET');
    await page.goto('/reset-password#token=' + reset);
    await page.getByLabel('New password', { exact: true }).fill('ChangedBrowser123!');
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(page.getByText('Password reset. Sign in again.')).toBeVisible();
    await setupLogin(page, email, 'ChangedBrowser123!');
    await expect(page.getByRole('heading', { name: 'Account status', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'End account setup session', exact: true }).click();
    await page.goto('/reset-password#token=' + reset);
    await page.getByLabel('New password', { exact: true }).fill('ReplayBrowser123!');
    await page.getByRole('button', { name: 'Reset password', exact: true }).click();
    await expect(
      page.getByText('Reset link is invalid or expired', { exact: false }),
    ).toBeVisible();
  } finally {
    await removeAccounts([email]);
  }
});
test('real manager invitation, revocation, and email-bound tenant acceptance without self-registration', async ({
  page,
  browser,
}, testInfo) => {
  const managerEmail = randomUUID() + '@invite-browser.invalid',
    tenantEmail = randomUUID() + '@tenant-browser.invalid',
    revokedEmail = randomUUID() + '@revoked-browser.invalid';
  const manager = await prisma.user.create({
    data: {
      email: managerEmail,
      passwordHash: await hashPassword(password),
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      leasingManager: { create: { fullName: 'Browser Invitation Manager' } },
    },
    include: { leasingManager: true },
  });
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.175' : '198.51.100.174',
  });
  const context = await browser.newContext({
    baseURL: 'http://127.0.0.1:5176',
    viewport: page.viewportSize(),
    extraHTTPHeaders: {
      'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.177' : '198.51.100.176',
    },
  });
  async function invite(email: string) {
    await page.getByLabel('Tenant name', { exact: true }).fill('Browser Invited Tenant');
    await page.getByLabel('Tenant email', { exact: true }).fill(email);
    await page.getByRole('button', { name: 'Invite tenant', exact: true }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
  }
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(managerEmail);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await page.goto('/invitations');
    await invite(revokedEmail);
    const revokedToken = await mailToken(revokedEmail, 'TENANT_INVITATION');
    await page.getByRole('button', { name: 'Revoke invitation', exact: true }).click();
    await page.getByRole('button', { name: 'Confirm revocation', exact: true }).click();
    await expect(page.getByText('Invitation revoked.', { exact: true })).toBeVisible();
    await invite(tenantEmail);
    const token = await mailToken(tenantEmail, 'TENANT_INVITATION'),
      tenantPage = await context.newPage();
    await tenantPage.goto('/invitation#token=' + token);
    await expect(
      tenantPage.getByText('Invitation from Browser Invitation Manager for ' + tenantEmail + '.'),
    ).toBeVisible();
    await tenantPage.getByLabel('Full legal name', { exact: true }).fill('Actual Tenant Name');
    await tenantPage.getByLabel('Password', { exact: true }).fill(password);
    await tenantPage.getByRole('button', { name: 'Accept invitation', exact: true }).click();
    await expect(
      tenantPage.getByRole('heading', { name: 'Account status', exact: true }),
    ).toBeVisible();
    await expect(tenantPage.getByText('PENDING PHONE', { exact: true })).toBeVisible();
    const tenant = await prisma.user.findUniqueOrThrow({
      where: { email: tenantEmail },
      include: { tenant: true },
    });
    expect(tenant.tenant!.managerId).toBe(manager.leasingManager!.id);
    expect(tenant.emailVerifiedAt).not.toBeNull();
    const rejected = await tenantPage.request.post(
      'http://127.0.0.1:3000/api/v1/invitations/inspect',
      { data: { token: revokedToken } },
    );
    expect(rejected.status()).toBe(422);
  } finally {
    await context.close();
    await removeAccounts([managerEmail, tenantEmail, revokedEmail]);
  }
});
