import { choose } from './choice';
import { expect, test, type Page } from '@playwright/test';

test('preview maintenance proposals preserve disputes and accepted responsibility across roles', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) requests.push(request.url());
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
  ).toBeVisible();
  await page.goto('./#/requests/request-1');
  async function proposal(amount: string) {
    await page.getByRole('button', { name: 'Record responsibility', exact: true }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Responsibility', { exact: true }).selectOption('TENANT_COST');
    await editor.getByLabel('Proposed tenant cost', { exact: true }).fill(amount);
    await editor.getByLabel('Explanation *', { exact: true }).fill('Broken handle');
    await editor
      .getByLabel('Evidence notes', { exact: true })
      .fill('Inspection recorded a snapped handle');
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).not.toBeVisible();
  }
  async function response(label: string, explanation: string) {
    await page.getByRole('button', { name: label, exact: true }).click();
    const editor = page.getByRole('dialog');
    await editor.getByLabel('Response explanation *', { exact: true }).fill(explanation);
    await editor.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(editor).not.toBeVisible();
  }
  async function switchRole(label: string, heading: string) {
    await logout(page, mobile);
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.goto('./#/requests/request-1');
  }
  await proposal('150.25');
  await switchRole('Preview tenant', 'My accommodation');
  await response('Dispute proposed cost', 'Damaged before arrival');
  await switchRole('Preview manager', 'Portfolio overview');
  await proposal('75.25');
  await switchRole('Preview tenant', 'My accommodation');
  await response('Accept proposed cost', 'I accept the revised amount');
  await page.reload();
  await expect(page.getByText('Cost disputed', { exact: true })).toBeVisible();
  await expect(page.getByText('Cost accepted', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Accept proposed cost', exact: true }),
  ).not.toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('maintenance-preview.png'),
    fullPage: true,
    animations: 'disabled',
  });
  expect(requests).toEqual([]);
});

test('preview contract terms and records remain read-only on desktop and mobile', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) requests.push(request.url());
  });
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview tenant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
  await page.getByRole('link', { name: 'My contracts', exact: true }).click();
  await page.getByRole('link', { name: 'Master Room', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Master Room contract', exact: true }),
  ).toBeVisible();
  await expect(page.getByText('Open-ended', { exact: true })).toBeVisible();
  await expect(page.getByText('AED 1,000.00', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Deposit entries', exact: true }).click();
  await expect(page.getByText('No records', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cases', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Kitchen tap repair', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('contract-preview.png'), fullPage: true });
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Master Room contract', exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

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

test('preview tenant profiles, directory, and read notices persist without backend requests', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) requests.push(request.url());
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview tenant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
  await navigation(page, 'My profile', mobile);
  await page.getByRole('button', { name: 'Edit profile', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Full name *', { exact: true }).fill('Updated Preview Tenant');
  await editor.getByLabel('Phone awaiting verification', { exact: true }).fill('+971500000099');
  await choose(page, 'Sleep schedule', 'Early sleeper');
  await editor.getByLabel('Non-security notices', { exact: true }).selectOption('EMAIL');
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Updated Preview Tenant', exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('profile-preview.png'), fullPage: true });
  await navigation(page, 'Notifications', mobile);
  await expect(page.getByRole('link', { name: 'Kitchen tap repair', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Mark all read', exact: true }).click();
  await page.getByLabel('Notification status', { exact: true }).selectOption('UNREAD');
  await expect(page.getByText('No notifications', { exact: true })).toBeVisible();
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
  await navigation(page, 'Tenants', mobile);
  await page.getByRole('link', { name: 'Updated Preview Tenant', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Updated Preview Tenant', exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});

test('preview unit amenities and archive persist without activation', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) requests.push(request.url());
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
  await navigation(page, 'Units', mobile);
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Unit name *', { exact: true }).fill('Preview Amenity Unit');
  await choose(page, 'Area *', 'Dubai Marina');
  await editor.getByLabel('Owner payment schedule', { exact: true }).fill('Four cheques');
  await editor.getByLabel('Wi-Fi', { exact: true }).check();
  await editor.getByLabel('Additional amenities', { exact: true }).fill('Lift');
  await editor.getByRole('checkbox', { name: /I confirm the property/ }).check();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.getByRole('link', { name: 'Preview Amenity Unit', exact: true }).click();
  await expect(page.getByText('Lift', { exact: true })).toBeVisible();
  await expect(page.getByText('Four cheques', { exact: true })).toBeVisible();
  const help = page.getByText('Future accommodation types', { exact: true });
  if (mobile) await help.click();
  else {
    await help.focus();
    await page.keyboard.press('Enter');
  }
  await expect(
    page.getByText('Bed Space and Partition: Future feature.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Archive unit', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Add room', exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Restore unit', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('unit-lifecycle-preview.png'),
    fullPage: true,
  });
  expect(requests).toEqual([]);
});

test('preview administrator queue uses masked identities and safe audit summaries', async ({
  page,
}, testInfo) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) requests.push(request.url());
  });
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview admin', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Platform overview' })).toBeVisible();
  await navigation(page, 'Account review', testInfo.project.name === 'mobile');
  await page.getByRole('link', { name: 'Demo Applicant', exact: true }).click();
  await expect(page.getByText('****1234', { exact: true })).toBeVisible();
  await expect(page.getByText('MFA and policy approval required', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('account-review-preview.png'),
    fullPage: true,
  });
  await navigation(page, 'Audit history', testInfo.project.name === 'mobile');
  await expect(page.getByText('No audit events', { exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

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
  await page.getByRole('link', { name: 'Preview Owner Two', exact: true }).click();
  await page.getByRole('button', { name: 'Archive landlord', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Restore landlord', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Edit landlord', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Company', { exact: true }).fill('Preview Properties');
  await page
    .getByRole('dialog')
    .getByLabel('Preferred contact', { exact: true })
    .selectOption('EMAIL');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await navigation(page, 'Units', mobile);
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Unit name *', { exact: true }).fill('Preview Apartment Two');
  await choose(page, 'Area *', 'Al Karama');
  await editor.getByLabel('Landlord', { exact: true }).selectOption({ label: 'Preview Owner Two' });
  await editor.getByLabel('Address notes', { exact: true }).fill('Preview entrance\nThird floor');
  await editor.getByRole('checkbox', { name: /I confirm the property/ }).check();
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
  await page.getByRole('link', { name: 'Preview Owner Two', exact: true }).click();
  await expect(
    page.getByRole('link', { name: 'Preview Apartment Two', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Archive landlord', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('landlord-preview.png'), fullPage: true });
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

test('preview cases preserve role decisions and history without backend requests', async ({
  page,
}, testInfo) => {
  const backendRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1')) backendRequests.push(request.url());
  });
  const mobile = testInfo.project.name === 'mobile';
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview tenant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
  await navigation(page, 'Requests', mobile);
  await page.getByRole('button', { name: 'New request', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByLabel('Title *', { exact: true })
    .fill('Preview private repair');
  await page
    .getByRole('dialog')
    .getByLabel('Description *', { exact: true })
    .fill('Synthetic case details');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Preview private repair', exact: true }),
  ).toBeVisible();
  const caseUrl = page.url();
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Portfolio overview' })).toBeVisible();
  await page.goto(caseUrl);
  for (const [label, response] of [
    ['Start work', ''],
    ['Mark resolved', 'Synthetic repair completed'],
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    if (response)
      await page.getByRole('alertdialog').getByLabel('Response', { exact: false }).fill(response);
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Confirm', exact: true })
      .click();
    await expect(page.getByRole('alertdialog')).not.toBeVisible();
  }
  await expect(page.getByRole('button', { name: 'Close case', exact: true })).not.toBeVisible();
  await logout(page, mobile);
  await page.getByRole('button', { name: 'Preview tenant', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'My accommodation' })).toBeVisible();
  await page.goto(caseUrl);
  await page.getByRole('button', { name: 'Accept completion', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirm', exact: true }).click();
  await expect(page.getByRole('alertdialog')).not.toBeVisible();
  await page.reload();
  await expect(page.getByText('Completion accepted', { exact: false })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('case-preview.png'), fullPage: true });
  expect(backendRequests).toEqual([]);
});

test('compact mobile navigation keeps sign-out visible and exposes all account links', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 568 });
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Portfolio overview', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const drawer = page.getByRole('dialog');
  const logoutButton = drawer.getByRole('button', { name: 'Sign out', exact: true });
  await expect(logoutButton).toBeInViewport({ ratio: 1 });
  await drawer.getByRole('link', { name: 'Preferences', exact: true }).click();
  await expect(drawer).not.toBeVisible();
  await expect(page.getByRole('heading', { name: 'Preferences', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(logoutButton).toBeInViewport({ ratio: 1 });
  await logoutButton.click();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
});

test('Dubai reference choices persist through a preview reload', async ({ page }) => {
  await page.goto('./#/login');
  await page.getByRole('button', { name: 'Preview manager', exact: true }).click();
  await page.goto('./#/units');
  await page.getByRole('button', { name: 'Add unit', exact: true }).click();
  const editor = page.getByRole('dialog');
  await editor.getByLabel('Unit name *', { exact: true }).fill('Choice catalogue apartment');
  await choose(page, 'Area *', 'Dubai Marina');
  await choose(page, 'Building', 'Aurora · Dubai Marina');
  await editor.getByRole('checkbox', { name: /I confirm the property/ }).check();
  await editor.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Edit Choice catalogue apartment', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Area *', exact: true })).toContainText(
    'Dubai Marina',
  );
  await expect(page.getByRole('combobox', { name: 'Building', exact: true })).toContainText(
    'Aurora',
  );
});
