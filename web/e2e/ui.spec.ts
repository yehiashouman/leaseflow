import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const payload = path.endsWith('/auth/me')
      ? {
          id: 'manager-1',
          role: 'LEASING_MANAGER',
          email: 'manager@example.test',
          status: 'ACTIVE',
        }
      : path.endsWith('/auth/login')
        ? { accessToken: 'ui-test-token' }
        : path.endsWith('/dashboard/manager')
          ? {
              units: 1,
              occupied: 1,
              vacant: 0,
              openRequests: 1,
              maintenance: 0,
              awaitingManager: 1,
              deadlines: [],
              financialRecords: [],
            }
          : path.endsWith('/inventory/units')
            ? [
                {
                  id: 'u1',
                  name: 'Marina Apartment',
                  area: 'Dubai Marina',
                  landlord: { name: 'Landlord One' },
                  spaces: [{ id: 's1' }],
                  active: true,
                },
              ]
            : path.endsWith('/contracts')
              ? [
                  {
                    id: 'c1',
                    tenant: { fullName: 'Tenant One' },
                    rentalSpace: { name: 'Room 1', unit: { name: 'Marina Apartment' } },
                    currency: 'AED',
                    monthlyRent: 3000,
                    dueDay: 1,
                    status: 'ACTIVE',
                  },
                ]
              : path.endsWith('/requests')
                ? [
                    {
                      id: 'r1',
                      type: 'MAINTENANCE',
                      title: 'Kitchen tap',
                      description: 'Tap needs repair.',
                      status: 'SUBMITTED',
                    },
                  ]
                : [];
    await route.fulfill({ json: payload });
  });
});

test('login, responsive routes, theme, tables, and sign out', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('manager@example.test');
  await page.getByLabel('Password').fill('ExamplePass123!');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
  await expect(page.getByText('Maintenance blocks', { exact: true })).toBeVisible();
  await expect(page.getByText('Await manager', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Deposit liabilities require a verified deposit ledger.'),
  ).toBeVisible();
  expect(
    await page.locator('body').evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe('rgba(0, 0, 0, 0)');
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true });

  for (const [label, content] of [
    ['Units', 'Marina Apartment'],
    ['Contracts', 'Tenant One'],
    ['Requests', 'Kitchen tap'],
  ]) {
    if (testInfo.project.name === 'mobile') {
      const trigger = page.getByRole('button', { name: 'Open navigation' });
      await trigger.click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('dialog').getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
    } else {
      await page.getByRole('navigation').getByRole('link', { name: label, exact: true }).click();
    }
    await expect(page.getByRole('heading', { name: label, exact: true })).toBeVisible();
    const record =
      label === 'Units'
        ? page.getByRole('link', { name: content, exact: true })
        : label === 'Contracts'
          ? page.getByRole('cell', { name: content, exact: true })
          : page.getByRole('heading', { name: content, exact: true });
    await expect(record).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(label.toLowerCase() + '.png'),
      fullPage: true,
    });
  }
  if (testInfo.project.name === 'mobile') {
    const trigger = page.getByRole('button', { name: 'Open navigation' });
    await trigger.click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.getByRole('dialog').getByRole('button', { name: 'Sign out' }).click();
  } else {
    await page.getByRole('button', { name: 'Sign out' }).click();
  }
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
});

test('failed records expose retry, not a false empty state', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('accessToken', 'ui-test-token'));
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/units',
    (route) => route.fulfill({ status: 503, json: { message: 'Unavailable' } }),
  );
  await page.goto('/units');
  await expect(page.getByRole('alert')).toContainText('Unable to load records');
  await expect(page.getByText('No units yet')).not.toBeVisible();
  await page.route(
    (url) => url.pathname === '/api/v1/inventory/units',
    (route) => route.fulfill({ json: [] }),
  );
  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('No units yet')).toBeVisible();
});
