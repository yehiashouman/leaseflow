import { expect, test, type Page } from '@playwright/test';

async function navigation(page: Page, label: string, mobile: boolean) {
  if (mobile) {
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page.getByRole('dialog').getByRole('link', { name: label, exact: true }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
  } else await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
}
async function logout(page: Page, mobile: boolean) {
  if (mobile) await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('button', { name: 'Sign out', exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
}

test('preview CRUD persists without backend requests and preserves role boundaries', async ({
  page,
}, testInfo) => {
  const backendRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) backendRequests.push(request.url());
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.goto('./#/login');
  await expect(page.getByText(/Public preview/)).toBeVisible();
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
  await navigation(page, 'Landlords', mobile);
  await page.getByRole('button', { name: 'Add landlord', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name *', { exact: true }).fill('Preview Owner Two');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Preview Owner Two', exact: true })).toBeVisible();
  await navigation(page, 'Units', mobile);
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Unit name *', { exact: true }).fill('Preview Apartment Two');
  await editor.getByLabel('Area *', { exact: true }).fill('Demo Area');
  await editor.getByRole('checkbox').check();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('link', { name: 'Preview Apartment Two', exact: true }).click();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Room name *', { exact: true }).fill('Room Alpha');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'Room Alpha', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Room Alpha', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Room name *', { exact: true }).fill('Room Beta');
  await page
    .getByRole('dialog')
    .getByLabel('Availability', { exact: true })
    .selectOption('MAINTENANCE');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'MAINTENANCE', exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Preview Apartment Two', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Room Beta', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'MAINTENANCE', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Room Beta', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Availability', { exact: true })
    .selectOption('INACTIVE');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'INACTIVE', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit Room Beta', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Availability', { exact: true }).selectOption('ACTIVE');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('cell', { name: 'AVAILABLE', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('inventory-preview.png'), fullPage: true });
  await navigation(page, 'Security', mobile);
  await expect(page.getByRole('heading', { name: 'Security', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic second device', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke session preview-other', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await expect(page.getByText('Synthetic second device', { exact: true })).not.toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Security', exact: true })).toBeVisible();
  await expect(page.getByText('Synthetic second device', { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('security-preview.png'), fullPage: true });
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Units', exact: true })).not.toBeVisible();
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview tenant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
  expect(backendRequests).toEqual([]);
});
