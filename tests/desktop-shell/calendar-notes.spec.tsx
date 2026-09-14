import { test, expect } from '@playwright/experimental-ct-react';
import { CalendarNoteHarness } from './CalendarNoteHarness';

test.beforeEach(async ({ page }) => {
  await page.route('**/*', route => /^https?:\/\/(localhost|127\.0\.0\.1):/.test(route.request().url()) ? route.continue() : route.abort());
});

test('Note date opens across field and label, supports keyboard, Clear and Save', async ({ mount, page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mount(<CalendarNoteHarness/>);
  const control = page.getByRole('button', { name: 'Note date', exact: true });
  const picker = page.getByRole('dialog', { name: 'Note date calendar' });
  await control.click({ position: { x: 8, y: 8 } });
  await expect(picker).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath('note-date-picker.png') });
  await picker.getByRole('button', { name: '15', exact: true }).click();
  await expect(control).toHaveText('2026-09-15');
  const bounds = await control.boundingBox();
  await control.click({ position: { x: bounds!.width - 8, y: 8 } });
  await expect(picker).toHaveCount(1);
  await picker.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(control).toHaveText('Select date');
  await page.getByText('Date (blank = Needs Attention)', { exact: true }).click();
  await expect(picker).toHaveCount(1);
  await control.click();
  await control.focus();
  await control.press('Enter');
  await expect(picker).toHaveCount(1);
  await picker.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByLabel('Saved request')).toHaveText('');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Calendar', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Saved request')).toContainText('"scheduledDate":null');
  expect(errors).toEqual([]);
});

test('Note edit Cancel closes without saving', async ({ mount, page }) => {
  await mount(<CalendarNoteHarness/>);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByText('Calendar', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Saved request')).toHaveText('');
});

for (const linked of [false, true]) test(`Production conversion preserves ${linked ? 'explicit linkage' : 'free-text Sales Order without inferred linkage'}`, async ({ mount, page }) => {
  await mount(<CalendarNoteHarness mode="convert" linked={linked}/>);
  await page.getByRole('button', { name: 'Production', exact: true }).click();
  await page.locator('input[type="date"]').fill('');
  if (!linked) await page.getByLabel('Sales Order', { exact: true }).fill('DG-000006');
  await page.getByRole('button', { name: 'Convert', exact: true }).click();
  await expect(page.getByText('Calendar', { exact: true })).toBeVisible();
  const result = JSON.parse(await page.getByLabel('Saved request').innerText());
  expect(result.scheduledDate).toBeNull();
  expect(result.shopHours).toBeNull();
  expect(result.linkedInternalJobId).toBe(linked ? '22222222-2222-4222-8222-222222222222' : null);
  if (!linked) expect(result.salesOrder).toBe('DG-000006');
});
