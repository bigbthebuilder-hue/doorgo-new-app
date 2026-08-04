import { expect, test } from '@playwright/experimental-ct-react';
import { LegacyTransferReviewHarness } from './legacy-transfer-review-harness';

test('renders id-less imported lines and normalized evidence without duplicate React keys', async ({ mount, page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

  const component = await mount(<LegacyTransferReviewHarness/>);

  await expect(component.getByRole('heading', { name: 'Job Lines' })).toBeVisible();
  await expect(component.getByText('Glass line one', { exact: false })).toBeVisible();
  await expect(component.getByText('Glass line two', { exact: false })).toBeVisible();
  await expect(component.getByRole('heading', { name: 'Warnings' })).toBeVisible();
  await expect(component.locator('li').filter({ hasText: 'Review glass evidence.' })).toHaveCount(2);
  await expect(component.locator('li').filter({ hasText: 'Confirm the first line glass.' })).toBeVisible();
  await expect(component.getByRole('heading', { name: 'Blocking issues' })).toBeVisible();
  await expect(component.locator('li').filter({ hasText: 'Confirm customer.' })).toBeVisible();
  const unsupported = component.locator('p').filter({ hasText: 'Unsupported source fields:' });
  await expect(unsupported).toContainText('lines.0.glass_inputs.legacy_detail');
  await expect(unsupported).not.toContainText('legacy_detail, lines.0');

  expect(consoleErrors.filter((message) => /same key|unique "key" prop|duplicate key/i.test(message))).toEqual([]);
});
