import { test, expect } from '@playwright/experimental-ct-react';
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
