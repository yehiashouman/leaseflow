import type { Page } from '@playwright/test';
export async function choose(page: Page, label: string, option: string) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('combobox', { name: 'Search choices', exact: true }).fill(option);
  await page.getByRole('option', { name: option, exact: true }).click();
}
