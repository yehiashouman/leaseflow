import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';
test.afterAll(async () => {
  await prisma.$disconnect();
});
test('real monthly contract captures a couple, defaults, exact initial rent, and private occupant snapshots', async ({
  page,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Contract setup requires a _test database');
  const suffix = randomUUID(),
    password = 'ContractSetup123!',
    passwordHash = await hashPassword(password);
  const manager = await prisma.user.create({
    data: {
      email: suffix + '-manager@setup.invalid',
      passwordHash,
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Setup Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = manager.leasingManager!.id;
  const tenant = await prisma.user.create({
    data: {
      email: suffix + '-tenant@setup.invalid',
      passwordHash,
      role: 'TENANT',
      status: 'ACTIVE',
      tenant: { create: { managerId, fullName: 'Setup Primary' } },
    },
    include: { tenant: true },
  });
  const unit = await prisma.unit.create({
    data: {
      managerId,
      name: 'Setup Unit',
      area: 'Dubai',
      active: true,
      defaultDeposit: '850.25',
      spaces: { create: { name: 'Setup Couple Room', type: 'ROOM', capacity: 2 } },
    },
    include: { spaces: true },
  });
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(manager.email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await page.goto('/contracts');
    await page.getByRole('button', { name: 'Create contract', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Create monthly contract' })).toBeVisible();
    await dialog
      .getByLabel('Move-in calendar date (Asia/Dubai) *', { exact: true })
      .fill('2026-01-17');
    await dialog.getByLabel('Negotiated monthly rent *', { exact: true }).fill('3100');
    await dialog.getByLabel('Notice period (calendar days) *', { exact: true }).fill('15');
    await dialog.getByLabel('Occupancy arrangement', { exact: true }).selectOption('COUPLE');
    await dialog
      .getByLabel('Secondary occupant full name *', { exact: true })
      .fill('Setup Secondary');
    await dialog
      .getByLabel('Secondary occupant date of birth *', { exact: true })
      .fill('1990-01-01');
    await dialog.getByLabel('Secondary occupant nationality *', { exact: true }).fill('Egyptian');
    await dialog
      .getByLabel('Secondary occupant Emirates ID *', { exact: true })
      .fill('784-1990-1234567-1');
    await dialog
      .getByLabel('Secondary occupant Emirates ID expiry *', { exact: true })
      .fill('2030-01-01');
    await dialog
      .getByLabel(
        'The primary tenant remains responsible; secondary occupants receive no separate account *',
        { exact: true },
      )
      .check();
    await dialog
      .getByLabel(
        'I confirm these monthly terms and the immediate allocation of available space *',
        { exact: true },
      )
      .check();
    await dialog.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Setup Couple Room contract', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Open-ended', { exact: true })).toBeVisible();
    await expect(page.getByText('AED 850.25', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Setup Secondary · Secondary occupant', exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/\*\*\*\*67-1/)).toBeVisible();
    await expect(page.getByText('784-1990-1234567-1', { exact: true })).not.toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Setup Secondary · Secondary occupant', exact: true }),
    ).toBeVisible();
    const contract = await prisma.contract.findFirstOrThrow({
      where: { tenantId: tenant.tenant!.id },
      include: { payments: true, occupants: true },
    });
    expect(contract.payments).toHaveLength(1);
    expect(contract.payments[0]!.amountDue.toFixed(2)).toBe('1500.00');
    expect(contract.occupants).toHaveLength(2);
    expect(contract.noticeDays).toBe(15);
    expect(await prisma.user.count({ where: { email: { startsWith: suffix } } })).toBe(2);
    await page.screenshot({
      path: testInfo.outputPath('monthly-contract-occupants.png'),
      fullPage: true,
    });
  } finally {
    const where = { tenantId: tenant.tenant!.id };
    await prisma.payment.deleteMany({ where: { contract: where } });
    await prisma.contract.deleteMany({ where });
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
