import { expect, test } from '@playwright/experimental-ct-react';
import { SlabSizingHarness } from './SlabSizingHarness';
import { defaultDoorLine } from '../../lib/jobs/door-line-contract';
import { calculateGlassGeometry, numericDimension, withDerivedGlassGeometry } from '../../lib/jobs/glass-geometry-contract';
import { createWorkOrderRowGroup } from '../../lib/jobs/work-order-document-contract';
import type { NativeDoorLine } from '../../lib/jobs/job-intake-types';

for (const direct of [false, true]) {
  test(`Door Setup keeps synchronized RO after ${direct ? 'direct sidelight' : 'RO'} entry, save and reopen`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const component = await mount(<SlabSizingHarness initializeGlass line={{ ...defaultDoorLine('Exterior'), lineId: 'horizontal', config: 'T/SD', roWidth: '60', roHeight: '96', sidelightType: 'Glass', sidelightGlass: 'CLEAR', transomGlass: 'CLEAR' }}/>);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    const pane = component.locator('#door-input-pane');
    const ro = pane.getByLabel('RO Width (inches)', { exact: true });
    const side = pane.getByLabel('Sidelight Product Width (inches)', { exact: true });
    const width = pane.getByRole('combobox', { name: 'Width', exact: true });
    if (direct) { await side.fill('20'); await side.press('Enter'); }
    else { await ro.fill('60'); await ro.press('Enter'); }
    const fixedRo = await ro.inputValue();
    await expect(side).toHaveValue(direct ? '20"' : '19 5/8"');
    await width.selectOption(`3'6"`);
    await expect(ro).toHaveValue(fixedRo);
    await expect(side).toHaveValue(direct ? '14"' : '13 5/8"');
    await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
    await expect(pane.getByLabel('Transom Product Width (inches)', { exact: true })).toHaveValue(direct ? '58 1/4"' : '57 7/8"');
    await pane.getByRole('combobox', { name: 'Material', exact: true }).selectOption('wood');
    await expect(ro).toHaveValue(fixedRo);
    await expect(side).toHaveValue(direct ? '13 3/4"' : '13 3/8"');
    await pane.getByRole('combobox', { name: 'Material', exact: true }).selectOption('fiberglass');
    await expect(side).toHaveValue(direct ? '14"' : '13 5/8"');
    await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
    const saved = JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]')[0] as NativeDoorLine;
    const geometry = calculateGlassGeometry(saved);
    expect(geometry.status).toBe('Complete');
    expect(withDerivedGlassGeometry(saved).glassCalc).toEqual(geometry.glassCalc);
    const workOrder = createWorkOrderRowGroup(saved, null);
    expect(workOrder.primaryRow.status).toBe('Complete');
    expect(workOrder.diagram).not.toBeNull();
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    expect(numericDimension(await ro.inputValue())).toEqual(numericDimension(fixedRo));
    await expect(side).toHaveValue(saved.sidelightSpecifications![0].finishedWidth!);
    await expect(pane.getByLabel('Calculated measurements')).toContainText(String(geometry.glassCalc!.headerWidth));
    await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
    const reopened = JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]')[0] as NativeDoorLine;
    expect(calculateGlassGeometry(reopened)).toEqual(geometry);
    expect(createWorkOrderRowGroup(reopened, null)).toEqual(workOrder);
  });
}

test('Custom Width changes reconcile; height-only edit preserves widths; impossible RO cannot save Complete', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<SlabSizingHarness initializeGlass line={{ ...defaultDoorLine('Exterior'), material: 'wood', lineId: 'custom-horizontal', config: 'T/SD', roWidth: '60', roHeight: '96', sidelightType: 'Glass', sidelightGlass: 'CLEAR', transomGlass: 'CLEAR' }}/>);
  const saved = await component.getByTestId('saved-sizing').textContent();
  await component.getByRole('button', { name: 'Edit', exact: true }).click();
  const pane = component.locator('#door-input-pane');
  const width = pane.getByRole('combobox', { name: 'Width', exact: true });
  const side = pane.getByLabel('Sidelight Product Width (inches)', { exact: true });
  const ro = pane.getByLabel('RO Width (inches)', { exact: true });
  const fixedRo = await ro.inputValue();
  await width.selectOption('Custom');
  const actual = pane.getByLabel('Actual slab width, inches', { exact: true });
  await actual.fill('40'); await actual.press('Tab');
  await expect(side).toHaveValue('15 3/8"');
  await expect(ro).toHaveValue(fixedRo);
  await actual.fill('41'); await actual.press('Tab');
  await expect(side).toHaveValue('14 3/8"');
  await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption('Custom');
  await pane.getByLabel('Actual slab height, inches', { exact: true }).fill('78');
  await pane.getByLabel('Actual slab height, inches', { exact: true }).press('Tab');
  await expect(side).toHaveValue('14 3/8"');
  await actual.fill('60'); await actual.press('Tab');
  await expect(pane.getByText('Status: Blocked', { exact: true })).toBeVisible();
  await expect(pane.getByText('Status: Complete', { exact: true })).toHaveCount(0);
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  expect(await component.getByTestId('saved-sizing').textContent()).toBe(saved);
  await width.selectOption(`3'0"`);
  await expect(side).toHaveValue('19 3/8"');
  await expect(ro).toHaveValue(fixedRo);
  await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
});

test('DD astragal change keeps RO and reconciles the shared sidelights', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<SlabSizingHarness initializeGlass line={{ ...defaultDoorLine('Exterior'), lineId: 'dd-horizontal', config: 'T/SDDS', roWidth: '110 1/16', roHeight: '96', sidelightType: 'Glass', sidelightGlass: 'CLEAR', transomGlass: 'CLEAR' }}/>);
  await component.getByRole('button', { name: 'Edit', exact: true }).click();
  const pane = component.locator('#door-input-pane');
  const ro = pane.getByLabel('RO Width (inches)', { exact: true });
  const side = pane.getByLabel('Sidelight Product Width (inches)', { exact: true });
  const beforeRo = await ro.inputValue();
  const beforeSide = await side.inputValue();
  await pane.getByRole('combobox', { name: 'Astragal', exact: true }).selectOption('wood-ferco-astra-lock');
  await expect(ro).toHaveValue(beforeRo);
  await expect(side).not.toHaveValue(beforeSide);
  await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
});
