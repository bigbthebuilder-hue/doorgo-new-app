import { expect, test } from '@playwright/experimental-ct-react';
import { JobEditorWorkbenchHarness } from './JobEditorWorkbenchHarness';

test('confirmed job Product Code stays in sync across intake and the right-side door list', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<JobEditorWorkbenchHarness saved salesOrder="12345"/>);
  await component.getByRole('combobox', { name: 'Job lifecycle', exact: true }).selectOption('Confirmed Job');
  const card = component.locator('.job-line-card').first();
  const inlineCode = card.getByRole('textbox', { name: 'Product Code' });
  await inlineCode.fill(' 00-Ab_9 ');
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  const intakeCode = component.getByRole('textbox', { name: 'Product Code' }).first();
  await expect(intakeCode).toHaveValue(' 00-Ab_9 ');
  await intakeCode.fill('007x');
  await expect(inlineCode).toHaveValue('007x');
  await component.getByRole('button', { name: 'Cancel Edit' }).click();
  await expect(inlineCode).toHaveValue('007x');
  await component.getByText('Documents ▾', { exact: true }).click();
  await component.getByRole('button', { name: 'Print Door Labels', exact: true }).click();
  await expect(component.getByText('Not available in component layout tests.').first()).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Door Labels' })).toHaveCount(0);
});

test('door labels open alongside work-order printing for a saved job', async ({ mount, page }) => {
  const component = await mount(<JobEditorWorkbenchHarness saved salesOrder="12345"/>);
  await component.getByText('Documents ▾', { exact: true }).click();
  await expect(component.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
  await component.getByRole('button', { name: 'Print Door Labels', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Door Labels' })).toBeVisible();
  await expect(page.frameLocator('iframe[title="4 × 6 door label preview"]').locator('h1')).toHaveText('SO# 12345');
});
