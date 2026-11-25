import { test, expect } from '@playwright/experimental-ct-react';
import { StandaloneGlassCalculator } from '../../components/jobs/StandaloneGlassCalculator';
import { SlabSizingHarness } from './SlabSizingHarness';
import { defaultDoorLine, DOOR_HEIGHTS } from '../../lib/jobs/door-line-contract';

for (const width of [412, 1600]) for (const height of DOOR_HEIGHTS) {
  test(`Interior Fit to RO default and optional gap at ${height}, ${width}px`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const component = await mount(<SlabSizingHarness line={{ ...defaultDoorLine('Interior'), height, customSlab: 'RO', roHeight: '77 1/4', lineId: 'fixture', lineIndex: 1, lineStatus: 'Active' }}/>);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    const pane = component.locator('#door-input-pane');
    const gap = pane.getByRole('textbox', { name: 'Gap Under Door, inches', exact: true });
    const summary = pane.getByRole('region', { name: 'Custom RO sizing', exact: true });
    await expect(gap).toHaveValue('1');
    await expect(summary).toContainText('Jamb legs: 76 3/4"');
    await expect(summary).toContainText('74 7/8"');
    await gap.fill('1/2');
    await expect(summary).toContainText('Jamb legs: 76 3/4"');
    await expect(summary).toContainText('75 3/8"');
    await expect(summary).toContainText('Gap under door: 1/2"');
    await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
    const saved = JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]');
    expect(saved[0].gapUnderDoor).toBe('1/2"');
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(gap).toHaveValue('1/2');
    await pane.getByRole('textbox', { name: 'RO Height, inches', exact: true }).fill('110');
    await expect(summary).toContainText('full-height slab retained');
    await expect(summary).not.toContainText('Door will be cut down');
    await expect(pane.getByRole('alert')).toHaveCount(0);
    await gap.fill('1');
    await expect(summary).not.toContainText('Gap under door:');
  });
}

test('Excluded sizing workflows have no Gap Under Door input and Jobs View remains read-only', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  for (const line of [defaultDoorLine(), { ...defaultDoorLine('Interior'), construction: 'low-profile-quarter-sill' as const }, { ...defaultDoorLine('Interior'), construction: 'jamb-four-sides' as const }, { ...defaultDoorLine('Interior'), supplyType: 'slab-only' as const, prep: 'MTM' }]) {
    const component = await mount(<SlabSizingHarness line={{ ...line, customSlab: 'RO', lineId: 'fixture' }}/>);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(component.getByRole('textbox', { name: 'Gap Under Door, inches', exact: true })).toHaveCount(0);
    await component.unmount();
  }
  const readOnly = await mount(<SlabSizingHarness canEdit={false} line={{ ...defaultDoorLine('Interior'), customSlab: 'RO', gapUnderDoor: '1/2', lineId: 'readonly' }}/>);
  await expect(readOnly.getByRole('textbox', { name: 'Gap Under Door, inches', exact: true })).toHaveCount(0);
});

for (const width of [390, 1600]) for (const config of ['D', 'DD']) {
  test(`Independent gap preserves slabs through sizing switches and editing ${config} at ${width}`, async ({ mount, page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const component = await mount(<SlabSizingHarness line={{ ...defaultDoorLine('Interior'), config, lineId: 'independent', doorType: 'Molded', material: 'wood' }}/>);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    const pane = component.locator('#door-input-pane');
    const gap = pane.getByRole('textbox', { name: 'Gap Under Door, inches', exact: true });
    await expect(gap).toHaveValue('1');
    await gap.fill('1/2');
    await gap.press('Tab');
    await pane.getByRole('switch', { name: 'Fit to RO', exact: true }).click();
    await expect(gap).toHaveValue('1/2');
    await pane.getByRole('switch', { name: 'Fit to RO', exact: true }).click();
    await expect(gap).toHaveValue('1/2');
    if (config === 'DD') {
      await pane.getByRole('switch', { name: 'Custom Slab', exact: true }).click();
      await pane.getByRole('textbox', { name: 'Active Slab Width, inches', exact: true }).fill('22 7/8');
      await pane.getByRole('textbox', { name: 'Inactive Slab Width, inches', exact: true }).fill('22 7/8');
      await pane.getByRole('textbox', { name: 'Slab Height, inches', exact: true }).fill('78');
    } else {
      await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption('Custom');
      await pane.getByRole('textbox', { name: 'Actual slab height, inches', exact: true }).fill('78');
    }
    await expect(gap).toHaveValue('1/2');
    await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
    await expect(component.getByTestId('saved-sizing')).toContainText('1/2');
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(gap).toHaveValue('1/2');
    await pane.getByRole('button', { name: 'Cancel Edit', exact: true }).click();
    await component.getByRole('button', { name: 'Duplicate', exact: true }).click();
    const saved = JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]');
    expect(saved).toHaveLength(2);
    expect(saved.map((line: { gapUnderDoor: string }) => line.gapUnderDoor)).toEqual(['1/2"', '1/2"']);
  });
}

test('standalone calculator shares interior gap and printed jamb dimensions', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<StandaloneGlassCalculator/>);
  await component.getByRole('button', { name: 'Interior', exact: true }).click();
  const gap = component.getByRole('textbox', { name: 'Gap Under Door, inches', exact: true });
  await expect(gap).toHaveValue('1');
  await gap.fill('1/2');
  await gap.press('Tab');
  await page.emulateMedia({ media: 'print' });
  const report = component.getByRole('region', { name: 'Door Calculation printout', exact: true });
  await expect(report).toBeVisible();
  await expect(report).toContainText('Gap under door');
  await expect(report).toContainText('81 3/8"');
  await expect(report).toContainText('1/2"');
});
