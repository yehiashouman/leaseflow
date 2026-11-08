import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { test, expect } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real private document upload, antivirus status, immutable versions, and authorized download', async ({
  page,
}, testInfo) => {
  if (process.env.FILE_SERVICE_TESTS !== 'true')
    throw new Error('Document browser acceptance requires real private storage and ClamAV');
  const email = randomUUID() + '@document-browser.invalid',
    password = 'DocumentBrowser123!';
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
      phoneVerifiedAt: new Date(),
      leasingManager: { create: { fullName: 'Document Browser Manager' } },
    },
  });
  await page.setExtraHTTPHeaders({
    'X-Forwarded-For': testInfo.project.name === 'mobile' ? '198.51.100.191' : '198.51.100.190',
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await page.goto('/documents');
    const section = page.getByRole('region', { name: 'Identity documents', exact: true });
    const buffer = await sharp({
      create: { width: 12, height: 6, channels: 3, background: '#123456' },
    })
      .withMetadata({ exif: { IFD0: { Artist: 'Private author' } } })
      .png()
      .toBuffer();
    await section.getByLabel('Document title', { exact: true }).fill('Identity evidence v1');
    await section
      .getByLabel('File', { exact: true })
      .setInputFiles({ name: 'identity.png', mimeType: 'image/png', buffer });
    await section.getByRole('button', { name: 'Upload private file', exact: true }).click();
    await expect(
      section.getByText('Upload saved. Download requires a successful scan.'),
    ).toBeVisible();
    await expect(section.getByText('Available', { exact: true })).toBeVisible({ timeout: 30000 });
    const downloaded = page.waitForEvent('download');
    await section.getByRole('button', { name: 'Download', exact: true }).click();
    const file = await downloaded;
    const bytes = await readFile((await file.path())!);
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect((await sharp(bytes).metadata()).width).toBe(12);
    await section.getByRole('button', { name: 'New version', exact: true }).click();
    await section.getByLabel('Document title', { exact: true }).fill('Identity evidence v2');
    await section
      .getByLabel('File', { exact: true })
      .setInputFiles({ name: 'identity2.png', mimeType: 'image/png', buffer });
    await section.getByRole('button', { name: 'Upload new version', exact: true }).click();
    await expect(section.getByText('Version 2', { exact: true })).toBeVisible();
    await expect(section.getByText('Version 1', { exact: true })).toBeVisible();
    await expect(section.getByText('Available', { exact: true })).toHaveCount(2, {
      timeout: 30000,
    });
    await expect(page.locator('body')).toHaveJSProperty(
      'scrollWidth',
      await page.locator('body').evaluate((body) => body.clientWidth),
    );
    await page.screenshot({ path: testInfo.outputPath('private-documents.png'), fullPage: true });
  } finally {
    const records = await prisma.document.findMany({
      where: { uploaderUserId: user.id },
      select: { id: true },
    });
    await prisma.document.deleteMany({ where: { uploaderUserId: user.id } });
    await prisma.documentSeries.deleteMany({ where: { ownerUserId: user.id } });
    await prisma.auditEvent.deleteMany({
      where: { OR: [{ actorUserId: user.id }, { entityId: { in: records.map((row) => row.id) } }] },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.leasingManagerProfile.delete({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
