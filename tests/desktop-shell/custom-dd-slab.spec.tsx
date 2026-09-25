import { expect, test } from '@playwright/experimental-ct-react';
import { InlineGlassHarness } from './InlineGlassHarness';

for (const glass of [false, true]) test(`Custom DD slabs Add/Edit/Update ${glass ? 'with glass' : 'plain'}`, async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<InlineGlassHarness/>);
  const pane = component.locator('#door-input-pane');
  await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption(glass ? 'With Glass' : 'DD');
  if (glass) {
    await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
    await pane.getByRole('button', { name: 'Add transom', exact: true }).click();
    await pane.getByRole('button', { name: 'Remove left sidelight', exact: true }).click();
  }
  await pane.getByRole('switch', { name: 'Custom Slab', exact: true }).click();
  await expect(pane.getByRole('status').filter({ hasText: 'Enter Active width, Inactive width, and shared slab height.' })).toBeVisible();
  await pane.getByLabel('Active Slab Width, inches', { exact: true }).fill('41-3/4');
  await pane.getByLabel('Inactive Slab Width, inches', { exact: true }).fill('35-3/4');
  await pane.getByLabel('Slab Height, inches', { exact: true }).fill('79');
  if (glass) {
    await expect(pane.getByLabel('RO Width (inches)', { exact: true })).toHaveCount(0);
    await expect(pane.getByTestId('calculated-ro-width')).toHaveText('80 9/16" - calculated');
    await pane.getByLabel('RO Height (inches)', { exact: true }).fill('95');
  }
  await pane.getByLabel('Line Notes', { exact: true }).click();
  await expect(pane.getByText(/SPECIAL \/ REVIEW REQUIRED/)).toHaveCount(0);
  await expect(pane.getByText(/Cut inactive slab/)).toHaveCount(0);
  await pane.getByRole('button', { name: 'Add Door', exact: true }).click();
  const saved = JSON.parse(await component.getByTestId('saved-lines').textContent() ?? '[]');
  expect(saved.at(-1).doubleDoorSizing).toEqual({ kind: 'custom-slabs', activeWidth: '41-3/4', inactiveWidth: '35-3/4', height: '79' });
  await component.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await expect(pane.getByLabel('Active Slab Width, inches', { exact: true })).toHaveValue('41-3/4');
  await pane.getByLabel('Inactive Slab Width, inches', { exact: true }).fill('35 1/2');
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  const updated = JSON.parse(await component.getByTestId('saved-lines').textContent() ?? '[]');
  expect(updated.at(-1).doubleDoorSizing).toEqual({ kind: 'custom-slabs', activeWidth: '41-3/4', inactiveWidth: '35 1/2', height: '79' });
});
