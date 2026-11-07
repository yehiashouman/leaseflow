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
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Preview Apartment Two', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Room Alpha', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('inventory-preview.png'), fullPage: true });
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Units', exact: true })).not.toBeVisible();
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview tenant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
  expect(backendRequests).toEqual([]);
});
