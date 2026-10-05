import { expect, test } from '@playwright/experimental-ct-react';
import { SlabSizingHarness } from './SlabSizingHarness';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';

test('independent axes save, reopen, cancel and duplicate without losing intent', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<SlabSizingHarness line={{ ...defaultDoorLine('Interior'), lineId: 'axis', doorType: 'Molded' }}/>);
  const saved = component.getByTestId('saved-sizing');
  const pane = component.locator('#door-input-pane');
  await component.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(pane.getByRole('switch', { name: 'Custom Slab', exact: true })).toHaveCount(0);
  await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption('Custom');
  await expect(pane.getByLabel('Actual slab width, inches', { exact: true })).toHaveCount(0);
  await expect(pane.getByRole('combobox', { name: 'Height', exact: true })).toHaveAttribute('data-comparison-different', 'true');
  await pane.getByLabel('Actual slab height, inches', { exact: true }).fill('79-1/2');
  await pane.getByLabel('Actual slab height, inches', { exact: true }).press('Tab');
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  await expect(saved).toContainText('CustomHeight');
  await component.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(pane.getByRole('combobox', { name: 'Width', exact: true })).toHaveValue(`2'6"`);
  await expect(pane.getByRole('combobox', { name: 'Height', exact: true })).toHaveValue('Custom');
  const before = await saved.textContent();
  await pane.getByRole('combobox', { name: 'Width', exact: true }).selectOption('Custom');
  await pane.getByRole('button', { name: 'Cancel Edit', exact: true }).click();
  expect(await saved.textContent()).toBe(before);
  await component.getByRole('button', { name: 'Duplicate', exact: true }).click();
  expect(JSON.parse(await saved.textContent() ?? '[]').map((line: { customSlab: string }) => line.customSlab)).toEqual(['CustomHeight', 'CustomHeight']);
});

for (const stored of [false, true]) {
  test('glass initialization ' + (stored ? 'preserves saved light T-bar and diagram false' : 'defaults new heavy T-bar and diagram on'), async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const component = await mount(<SlabSizingHarness initializeGlass line={{ ...defaultDoorLine('Exterior'), lineId: 'glass', config: 'T/SD', roWidth: '60', roHeight: '96', sidelightType: 'Glass', sidelightGlass: 'Clear', transomGlass: 'Clear', ...(stored ? { includeDiagramOnWorkOrder: false, sidelightSpecifications: [{ side: 'left', index: 1, finishedWidth: '20', tBarSize: '1.5', glassTypeCode: 'CLEAR', customGlassDescription: null, panelSizeMode: null, panelConstructionNotes: null }] } : {}) }}/ >);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    const pane = component.locator('#door-input-pane');
    await expect(pane.getByRole('combobox', { name: 'Unit T-bar Size', exact: true })).toHaveValue(stored ? '1.5' : '2.25');
    if (stored) await expect(pane.getByLabel('Include diagram on work order')).not.toBeChecked();
    else await expect(pane.getByLabel('Include diagram on work order')).toBeChecked();
  });
}

for (const config of ['SD', 'T/D']) {
  test('new panel/transom default is heavy: ' + config, async ({ mount }) => {
    const component = await mount(<SlabSizingHarness initializeGlass line={{ ...defaultDoorLine('Exterior'), config, sidelightType: 'Panel' }}/>);
    const line = JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]')[0];
    expect(config === 'SD' ? line.sidelightSpecifications[0].tBarSize : line.transomTBarSize).toBe('2.25');
    expect(line.includeDiagramOnWorkOrder).toBe(true);
  });
}

for (const customSlab of ['WoodCustom', 'Yes', 'CustomWidth']) {
  test('reopen preserves explicit size mode: ' + customSlab, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const component = await mount(<SlabSizingHarness line={{ ...defaultDoorLine('Interior'), lineId: 'legacy', customSlab, customSlabWidth: '31', customSlabHeight: customSlab === 'CustomWidth' ? null : '79' }}/>);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    const pane = component.locator('#door-input-pane');
    await expect(pane.getByRole('combobox', { name: 'Width', exact: true })).toHaveValue('Custom');
    await expect(pane.getByRole('combobox', { name: 'Height', exact: true })).toHaveValue(customSlab === 'CustomWidth' ? `6'8"` : 'Custom');
    await expect(pane.getByLabel('Actual slab width, inches', { exact: true })).toHaveValue('31');
  });
}
