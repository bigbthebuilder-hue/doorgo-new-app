import { test, expect } from '@playwright/experimental-ct-react';
import { JobEditorWorkbenchHarness } from './JobEditorWorkbenchHarness';

for (const saved of [false, true]) {
  test(`${saved ? 'existing blank-SO' : 'new'} job checks SO on blur and clears duplicate`, async ({ mount, page }) => {
    await mount(<JobEditorWorkbenchHarness saved={saved} salesOrder=""/>);
    const input = page.locator('#bizTrackSalesOrder');
    const status = page.locator('#sales-order-check');
    await input.fill('UNUSED');
    expect(await page.evaluate(() => (globalThis as typeof globalThis & { salesOrderChecks?: string[] }).salesOrderChecks ?? [])).toEqual([]);
    await input.blur();
    await expect(status).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
    await input.fill('DUPLICATE');
    await input.blur();
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(status).toHaveText('Sales Order already belongs to another job.');
    await expect(page.getByText('Sales Order already belongs to another job.', { exact: true })).toHaveCount(1);
    await expect(page.locator('section[aria-label="Job header validation"]')).not.toContainText('Sales Order');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save and Exit', exact: true })).toBeDisabled();
    await input.fill('UNUSED');
    await input.blur();
    await expect(status).toHaveCount(0);
    await expect(input).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeEnabled();
  });
}

test('own SO remains valid; late responses and unavailable checks are handled', async ({ mount, page }) => {
  await mount(<JobEditorWorkbenchHarness saved/>);
  const input = page.locator('#bizTrackSalesOrder');
  const status = page.locator('#sales-order-check');
  await input.focus();
  await input.blur();
  await expect(status).toHaveCount(0);
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await input.fill('DUPLICATE');
  await input.blur();
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await input.fill('DG-000123');
  await input.blur();
  await expect(status).toHaveCount(0);
  await expect(input).not.toHaveAttribute('aria-invalid', 'true');
  await input.fill('SLOW-DUPLICATE');
  await input.blur();
  await expect(status).toContainText('Checking');
  await input.fill('UNUSED');
  await input.blur();
  await page.waitForTimeout(400);
  await expect(status).toHaveCount(0);
  await input.fill('UNAVAILABLE');
  await input.blur();
  await expect(status).toContainText('Could not check');
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await input.fill('');
  await input.blur();
  await expect(status).toHaveCount(0);
});

for (const width of [1600, 1024, 390]) {
  test('Sales Order message stays inside its header row at ' + width, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mount(<JobEditorWorkbenchHarness salesOrder=""/>);
    await page.locator('#bizTrackSalesOrder').fill('DUPLICATE');
    await page.locator('#bizTrackSalesOrder').blur();
    const message = page.locator('#sales-order-check');
    await expect(message).toHaveText('Sales Order already belongs to another job.');
    const bounds = await message.boundingBox();
    const field = await page.locator('.job-shell-sales-order').boundingBox();
    const nextRow = await page.locator('.job-shell-po').boundingBox();
    expect(bounds).not.toBeNull();
    expect(field).not.toBeNull();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(field!.y + field!.height + 1);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(field!.x + field!.width + 1);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(nextRow!.y + 1);
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  });
}
