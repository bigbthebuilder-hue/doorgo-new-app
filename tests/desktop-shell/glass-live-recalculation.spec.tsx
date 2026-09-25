import { expect, test } from '@playwright/experimental-ct-react';
import { InlineGlassHarness } from './InlineGlassHarness';
import { defaultDoorLine } from '../../lib/jobs/door-line-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit } from '../../lib/jobs/glass-dimension-reconciliation-contract';

test('composition clicks recalculate from current RO after editing product width', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<InlineGlassHarness/>);
  await component.getByRole('button', { name: 'Edit', exact: true }).click();
  const pane = component.locator('#door-input-pane');
  const ro = pane.getByLabel('RO Width (inches)', { exact: true });
  const height = pane.getByLabel('RO Height (inches)', { exact: true });
  const side = pane.getByLabel('Sidelight Product Width (inches)', { exact: true });
  await side.fill('50');
  await side.press('Enter'); // Establish the former stale sidelight authority.
  const roValue = await ro.inputValue();
  const heightValue = await height.inputValue();
  const check = async (config: string) => {
    const line = { ...defaultDoorLine('Exterior'), config, roWidth: roValue, roHeight: heightValue, construction: 'low-profile-quarter-sill' as const, sidelightType: 'Glass' as const, sidelightGlass: 'CLR_SB60_K4SG', transomGlassTypeCode: 'CLEAR' as const, transomTBarSize: '1.5' as const };
    const expected = reconcileGlassDimensionCommit({ ...line, sidelightSpecifications: canonicalSidelightSpecifications(line).map(entry => ({ ...entry, tBarSize: '1.5' as const })) }, { kind: 'roWidth', value: roValue });
    expect(expected.blockers).toEqual([]);
    const calc = expected.calculatedGeometry.glassCalc!;
    await expect(pane.locator('#glass-builder-title + p')).toHaveText(config);
    await expect(ro).toHaveValue(roValue);
    await expect(height).toHaveValue(heightValue);
    await expect(side).toHaveValue(String(expected.sourcePatch.sidelightSpecifications?.[0].finishedWidth));
    await expect(pane.getByLabel('Transom Product Width (inches)', { exact: true })).toHaveValue(String(calc.transomWidth));
    await expect(pane.getByLabel('Calculated measurements')).toContainText(String(calc.headerWidth));
    await expect(pane.getByLabel('Calculated measurements')).toContainText(String(calc.jambLeg));
    await expect(pane.getByLabel('Calculated measurements')).toContainText(String(calc.transomHeight));
    await expect(pane.getByText('Status: ' + expected.calculatedGeometry.status, { exact: true })).toBeVisible();
    await expect(pane.locator('details').filter({ hasText: 'Vendor-copy preview' }).locator('pre')).toContainText(expected.calculatedGeometry.glassUnits[0].width);
  };
  await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
  await check('T/DDS');
  await pane.getByRole('button', { name: 'Single Door', exact: true }).click();
  await check('T/DS');
  await side.fill('50');
  await side.press('Enter');
  await pane.getByRole('button', { name: 'Add left sidelight', exact: true }).click();
  await check('T/SDS');
  await pane.getByRole('button', { name: 'Remove left sidelight', exact: true }).click();
  await check('T/DS');
  await pane.getByRole('button', { name: 'Add right sidelight', exact: true }).click();
  await check('T/DSS');
  await pane.getByRole('button', { name: 'Remove right sidelight', exact: true }).click();
  await check('T/DS');
  page.once('dialog', dialog => dialog.accept());
  await pane.getByRole('button', { name: 'Remove transom', exact: true }).click();
  await expect(pane.locator('#glass-builder-title + p')).toHaveText('DS');
  await expect(pane.getByLabel('Transom Product Width (inches)', { exact: true })).toHaveCount(0);
  await expect(pane.getByLabel('Calculated measurements')).toContainText('80 5/8"');
  await pane.getByRole('button', { name: 'Add transom', exact: true }).click();
  await expect(pane.locator('#glass-builder-title + p')).toHaveText('T/DS');
  await expect(pane.getByText('Status: Glass Detail Needed', { exact: true })).toBeVisible();
  await expect(height).toHaveValue(''); // Existing removal discards transom height; never infer it.
});
