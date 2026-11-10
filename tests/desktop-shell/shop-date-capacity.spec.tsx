import { expect, test } from '@playwright/experimental-ct-react';
import { JobEditorWorkbenchHarness } from './JobEditorWorkbenchHarness';

test('saved job recomputes fit from live hours and keeps full and closed dates selectable', async ({ mount, page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T20:00:00Z'));
  await mount(<JobEditorWorkbenchHarness saved />);
  const hours = page.locator('#shopHours');
  await hours.fill('4');
  const shopDate = page.getByRole('button', { name: 'Shop Date', exact: true });
  await shopDate.click();
  const picker = page.getByRole('dialog', { name: 'Shop Date calendar' });
  await expect(picker.getByRole('button', { name: '2026-11-10, Fits' })).toBeVisible();
  await hours.fill('5');
  await expect(picker.getByRole('button', { name: '2026-11-10, Would exceed' })).toBeVisible();
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    shopCapacityRequests?: [string, string | null, number | null][];
  }).shopCapacityRequests)).toEqual([['2026-11', '11111111-1111-4111-8111-111111111111', 4], ['2026-11', '11111111-1111-4111-8111-111111111111', 5]]);

  await picker.getByRole('button', { name: 'Next month' }).click();
  await expect(picker.getByRole('button', { name: '2026-12-10, Would exceed' })).toBeVisible();
  await picker.getByRole('button', { name: '2026-12-11, Closed or unavailable' }).click();
  await expect(shopDate).toHaveText('2026-12-11');
});

test('new job can select a full day at zero hours and fulfillment has no indicators', async ({ mount, page }) => {
  await page.clock.setFixedTime(new Date('2026-11-10T20:00:00Z'));
  await page.setViewportSize({ width: 360, height: 740 });
  await mount(<JobEditorWorkbenchHarness />);
  await page.locator('#shopHours').fill('0');
  const shopDate = page.getByRole('button', { name: 'Shop Date', exact: true });
  await shopDate.click();
  const picker = page.getByRole('dialog', { name: 'Shop Date calendar' });
  const bounds = await picker.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(360);
  await page.getByRole('button', { name: '2026-11-10, Full or over capacity' }).click();
  await expect(shopDate).toHaveText('2026-11-10');

  await page.locator('#fulfillmentPlan').selectOption('Delivery');
  await page.getByRole('button', { name: 'Delivery Date', exact: true }).click();
  const deliveryPicker = page.getByRole('dialog', { name: 'Delivery Date calendar' });
  await expect(deliveryPicker.locator('[data-capacity]')).toHaveCount(0);
  await deliveryPicker.getByRole('button', { name: '15', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delivery Date', exact: true })).toHaveText('2026-11-15');

  await page.locator('#fulfillmentPlan').selectOption('Customer Pickup');
  await page.getByRole('button', { name: 'Customer Pickup Date', exact: true }).click();
  const pickupPicker = page.getByRole('dialog', { name: 'Customer Pickup Date calendar' });
  await expect(pickupPicker.locator('[data-capacity]')).toHaveCount(0);
  await pickupPicker.getByRole('button', { name: '16', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Customer Pickup Date', exact: true })).toHaveText('2026-11-16');
  expect(await page.evaluate(() => (globalThis as typeof globalThis & {
    shopCapacityRequests?: [string, string | null, number | null][];
  }).shopCapacityRequests)).toEqual([['2026-11', null, 0]]);
});
