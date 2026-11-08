import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { prisma } from '../../api/src/db.js';
import { hashPassword } from '../../api/src/auth.js';

test.afterAll(async () => {
  await prisma.$disconnect();
});
async function navigation(page: Page, label: string, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
    await page.getByRole('dialog').getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  } else await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
}
async function save(page: Page, method: string, path: string, status: number) {
  const response = page.waitForResponse(
    (reply) => reply.request().method() === method && new URL(reply.url()).pathname.endsWith(path),
  );
  const editor = page.getByRole('dialog');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  const result = await response;
  expect(result.status()).toBe(status);
  await expect(editor).not.toBeVisible();
  return result.json();
}
async function confirm(page: Page, path: string) {
  const response = page.waitForResponse(
    (reply) => reply.request().method() === 'POST' && reply.url().endsWith(path),
  );
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
}

test('real landlord lifecycle and property fields persist through the browser', async ({
  page,
}, testInfo) => {
  if (!new URL(process.env.DATABASE_URL!).pathname.endsWith('_test'))
    throw new Error('Browser inventory tests require a dedicated _test database');
  const suffix = randomUUID().slice(0, 8);
  const name = 'Browser Owner ' + suffix;
  const email = suffix + '@inventory-browser.invalid';
  const password = 'InventoryBrowserPass123!';
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: 'LEASING_MANAGER',
      status: 'ACTIVE',
      leasingManager: { create: { fullName: 'Browser Inventory Manager' } },
    },
    include: { leasingManager: true },
  });
  const managerId = user.leasingManager!.id;
  const mobile = testInfo.project.name === 'mobile';
  try {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
    ).toBeVisible();
    await navigation(page, 'Landlords', mobile);
    await page.getByRole('button', { name: 'Add landlord', exact: true }).click();
    let editor = page.getByRole('dialog');
    await editor.getByLabel('Name *', { exact: true }).fill(name);
    await editor.getByLabel('Company', { exact: true }).fill('Browser Properties');
    await editor.getByLabel('Email', { exact: true }).fill(suffix + '@owner.invalid');
    await editor.getByLabel('Phone', { exact: true }).fill('+971500000000');
    await editor.getByLabel('WhatsApp', { exact: true }).fill('+971500000001');
    await editor.getByLabel('Preferred contact', { exact: true }).selectOption('EMAIL');
    await editor.getByLabel('Address', { exact: true }).fill('Dubai Marina');
    await editor.getByLabel('Notes', { exact: true }).fill('First note\nSecond note');
    const landlord = await save(page, 'POST', '/inventory/landlords', 201);
    await navigation(page, 'Units', mobile);
    const unitNames = ['Browser Unit A ' + suffix, 'Browser Unit B ' + suffix];
    const unitIds: string[] = [];
    for (const [index, unitName] of unitNames.entries()) {
      await page.getByRole('button', { name: 'Add unit', exact: true }).click();
      editor = page.getByRole('dialog');
      await editor.getByLabel('Unit name *', { exact: true }).fill(unitName);
      await editor.getByLabel('Area *', { exact: true }).fill('Al Reem Island');
      await editor.getByLabel('Landlord', { exact: true }).selectOption(landlord.id);
      if (index === 0) {
        await editor.getByLabel('Building', { exact: true }).fill('Browser Tower');
        await editor.getByLabel('Street', { exact: true }).fill('Al Reem Road');
        await editor.getByLabel('Emirate *', { exact: true }).fill('Abu Dhabi');
        await editor.getByLabel('Address notes', { exact: true }).fill('Gate 2\nFloor 3');
        await editor.getByLabel('Latitude', { exact: true }).fill('0');
        await editor.getByLabel('Longitude', { exact: true }).fill('55.2708');
        await editor.getByLabel('Default deposit *', { exact: true }).fill('2500');
        await editor.getByLabel('Owner monthly rent', { exact: true }).fill('8000.25');
        await editor
          .getByLabel('Owner payment schedule', { exact: true })
          .fill('Four cheques\nDates agreed externally');
        for (const label of [
          'Air conditioning',
          'Furnished',
          'Bed',
          'Television',
          'Refrigerator',
          'Bathroom',
          'Kitchen',
          'Laundry',
          'Balcony',
          'Parking',
          'Wi-Fi',
          'Cleaning',
        ])
          await editor.getByLabel(label, { exact: true }).check();
        await editor.getByLabel('Additional amenities', { exact: true }).fill('Lift\nGym');
      }
      await editor.getByRole('checkbox', { name: /I confirm the property/ }).check();
      unitIds.push((await save(page, 'POST', '/inventory/units', 201)).id);
    }
    await page.getByRole('link', { name: unitNames[0], exact: true }).click();
    await expect(page.getByText('Gate 2\nFloor 3', { exact: true })).toBeVisible();
    await expect(page.getByText('0, 55.2708', { exact: true })).toBeVisible();
    await expect(page.getByText('Default deposit', { exact: true }).locator('..')).toContainText(
      '2,500',
    );
    await page.getByRole('link', { name, exact: true }).click();
    for (const unitName of unitNames)
      await expect(page.getByRole('link', { name: unitName, exact: true })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Archive landlord', exact: true }),
    ).toBeDisabled();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('linked-landlord.png'), fullPage: true });
    await navigation(page, 'Units', mobile);
    for (const [index, unitName] of unitNames.entries()) {
      await page.getByRole('button', { name: 'Edit ' + unitName, exact: true }).click();
      editor = page.getByRole('dialog');
      await editor.getByLabel('Landlord', { exact: true }).selectOption('');
      await editor.getByRole('checkbox', { name: /I confirm the property/ }).check();
      await save(page, 'PATCH', '/inventory/units/' + unitIds[index], 200);
    }
    await navigation(page, 'Landlords', mobile);
    await page.getByRole('link', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Archive landlord', exact: true }).click();
    await confirm(page, '/inventory/landlords/' + landlord.id + '/archive');
    await expect(page.getByRole('button', { name: 'Restore landlord', exact: true })).toBeVisible();
    const list = page.waitForResponse(
      (reply) =>
        reply.request().method() === 'GET' &&
        new URL(reply.url()).pathname.endsWith('/inventory/landlords'),
    );
    await page.getByRole('link', { name: 'Back to landlords', exact: true }).click();
    expect((await (await list).json()).some((row: { id: string }) => row.id === landlord.id)).toBe(
      false,
    );
    await page.getByLabel('Landlord status', { exact: true }).selectOption('ARCHIVED');
    await page.getByRole('link', { name, exact: true }).click();
    await page.getByRole('button', { name: 'Restore landlord', exact: true }).click();
    await confirm(page, '/inventory/landlords/' + landlord.id + '/restore');
    await page.getByRole('button', { name: 'Edit landlord', exact: true }).click();
    editor = page.getByRole('dialog');
    await editor.getByLabel('Company', { exact: true }).fill('Updated Browser Properties');
    await editor.getByLabel('Preferred contact', { exact: true }).selectOption('WHATSAPP');
    await save(page, 'PATCH', '/inventory/landlords/' + landlord.id, 200);
    await expect(page.getByText('Updated Browser Properties', { exact: true })).toBeVisible();
    expect(await prisma.landlord.findUniqueOrThrow({ where: { id: landlord.id } })).toMatchObject({
      managerId,
      preferredContactMethod: 'WHATSAPP',
      companyName: 'Updated Browser Properties',
      archivedAt: null,
    });
    const unit = await prisma.unit.findUniqueOrThrow({ where: { id: unitIds[0] } });
    expect(unit).toMatchObject({
      building: 'Browser Tower',
      street: 'Al Reem Road',
      area: 'Al Reem Island',
      emirate: 'Abu Dhabi',
      addressNotes: 'Gate 2\nFloor 3',
      landlordId: null,
    });
    expect(unit.latitude?.toString()).toBe('0');
    expect(unit.longitude?.toString()).toBe('55.2708');
    expect(unit.defaultDeposit.toFixed(2)).toBe('2500.00');
    expect(unit.ownerPaymentSchedule).toBe('Four cheques\nDates agreed externally');
    expect(unit.amenities).toMatchObject({
      wifi: true,
      bathroom: true,
      kitchen: true,
      additional: ['Lift', 'Gym'],
    });
    await navigation(page, 'Units', mobile);
    await page.getByRole('link', { name: unitNames[0], exact: true }).click();
    await expect(page.getByText('Lift', { exact: true })).toBeVisible();
    await expect(
      page.getByText('Four cheques\nDates agreed externally', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Archive unit', exact: true }).click();
    await confirm(page, '/inventory/units/' + unitIds[0] + '/archive');
    await expect(page.getByRole('button', { name: 'Add room', exact: true })).toBeDisabled();
    await page.reload();
    await page.getByRole('button', { name: 'Restore unit', exact: true }).click();
    await confirm(page, '/inventory/units/' + unitIds[0] + '/restore');
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('unit-amenities.png'), fullPage: true });
    expect(
      await prisma.auditEvent.count({ where: { entityId: landlord.id, action: 'ARCHIVE' } }),
    ).toBe(1);
    expect(
      await prisma.auditEvent.count({ where: { entityId: landlord.id, action: 'RESTORE' } }),
    ).toBe(1);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { actorUserId: user.id } });
    await prisma.rentalSpace.deleteMany({ where: { unit: { managerId } } });
    await prisma.unit.deleteMany({ where: { managerId } });
    await prisma.landlord.deleteMany({ where: { managerId } });
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
    await prisma.authSession.deleteMany({ where: { userId: user.id } });
    await prisma.leasingManagerProfile.delete({ where: { id: managerId } });
    await prisma.user.delete({ where: { id: user.id } });
  }
});
