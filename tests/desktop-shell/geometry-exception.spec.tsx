import { test, expect } from '@playwright/experimental-ct-react';
import { GeometryExceptionHarness } from './GeometryExceptionHarness';

test('warning approval is read-only geometry, reason required, removable and invalidated on edits', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await mount(<GeometryExceptionHarness/>);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const section = page.getByRole('region', { name: 'Geometry Exception', exact: true });
  const geometry = page.getByLabel('Calculated measurements');
  const original = await geometry.innerText();
  await expect(section.locator('input')).toHaveCount(0);
  await expect(section.locator('textarea')).toHaveCount(1);
  await expect(section.getByRole('button', { name: 'Approve Exception' })).toBeDisabled();
  await section.getByLabel('Approval Reason').fill('Verified opening');
  await section.getByRole('button', { name: 'Approve Exception' }).click();
  await expect(section).toContainText('Geometry Exception Approved');
  await expect(section).toContainText('Fixture Approver');
  expect(await geometry.innerText()).toBe(original);
  await section.getByRole('button', { name: 'Remove Approval' }).click();
  await expect(section.getByRole('button', { name: 'Approve Exception' })).toBeVisible();
  expect(await geometry.innerText()).toBe(original);
  await section.getByLabel('Approval Reason').fill('Slow approval');
  await section.getByRole('button', { name: 'Approve Exception' }).click();
  await page.getByLabel('RO Width (inches)', { exact: true }).fill('61');
  await page.getByLabel('RO Width (inches)', { exact: true }).blur();
  await page.waitForTimeout(500);
  await expect(section.getByRole('button', { name: 'Remove Approval' })).toHaveCount(0);
});

for (const kind of ['normal', 'blocked', 'historical'] as const) {
  test('exception presentation: ' + kind, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await mount(<GeometryExceptionHarness kind={kind}/>);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const section = page.getByRole('region', { name: 'Geometry Exception', exact: true });
    if (kind === 'historical') {
      await expect(section).toContainText('Historical approval');
      await expect(section).toContainText('Fixture Approver');
      await expect(section).not.toContainText('999');
      await expect(section.locator('input, textarea')).toHaveCount(0);
      await page.getByRole('button', { name: 'Update Door', exact: true }).click();
      expect(JSON.parse(await page.getByTestId('saved-exceptions').textContent() ?? '[]')[0].glassOverride.acceptedValues).toEqual({ headerWidth: '999' });
    } else await expect(section).toHaveCount(0);
  });
}
