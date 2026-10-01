import { test, expect } from '@playwright/experimental-ct-react';
import { DoorLineWorkspaceHarness } from './DoorLineWorkspaceHarness';
import { GeometryExceptionHarness } from './GeometryExceptionHarness';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';

test.use({ viewport: { width: 1600, height: 1000 } });

for (const config of ['D', 'DD', 'PKT', 'B.P.']) {
  test('saved verification ' + config, async ({ mount }) => {
    const line = { ...defaultDoorLine(config === 'PKT' || config === 'B.P.' ? 'Interior' : 'Exterior'), config, lineId: 'saved', qty: 2, hand: 'LH', jambWidth: '6-9/16' };
    const component = await mount(<DoorLineWorkspaceHarness initialLines={[line]}/>);
    const card = component.locator('.job-line-card');
    await expect(card).toContainText('Qty 2');
    await expect(card).toContainText('Est. shop hours');
    if (config === 'PKT' || config === 'B.P.') {
      await expect(card).not.toContainText('Sill:');
      await expect(card.locator('h3')).not.toContainText('LH');
      await expect(card.locator('h3')).not.toContainText('6-9/16');
    } else {
      await expect(card).toContainText('Material: Fiberglass');
      await expect(card).toContainText('Sill: STD');
      await expect(card.locator('h3')).toContainText(line.width!);
      await expect(card.locator('h3')).toContainText('LH');
      await expect(card.locator('h3')).toContainText('6-9/16');
      if (config === 'DD') await expect(card).toContainText('Astragal: Standard Metal');
    }
  });
}
test('custom single uses entered size and keeps production details collapsed', async ({ mount }) => {
  const component = await mount(<DoorLineWorkspaceHarness initialLines={[{ ...defaultDoorLine('Exterior'), lineId: 'custom', material: 'wood', customSlab: 'WoodCustom', customSlabWidth: '35', customSlabHeight: '79' }]}/>);
  const card = component.locator('.job-line-card');
  await expect(card.locator('h3')).toContainText('35');
  await expect(card.locator('h3')).toContainText('79');
  await expect(card.locator('h3')).not.toContainText("3'0");
  await expect(card.getByLabel('Custom slab sizing')).toBeHidden();
  await card.getByText('Line details', { exact: true }).click();
  await expect(card.getByLabel('Custom slab sizing')).toBeVisible();
});
test('glass details retain useful calculations without exception audit JSON', async ({ mount }) => {
  const component = await mount(<GeometryExceptionHarness kind="historical"/>);
  const card = component.locator('.job-line-card');
  await expect(card).toContainText('Sidelight Type: Glass');
  await expect(card.getByText('Geometry Exception Approved', { exact: true })).toBeVisible();
  await expect(card.locator('pre')).toBeHidden();
  await expect(card.locator('.glass-unit-diagram')).toBeVisible();
  await card.getByText('Line details', { exact: true }).click();
  await expect(card.locator('pre')).toContainText('Jamb legs');
  await expect(card.getByText('Historical approval', { exact: false })).toHaveCount(1);
  await expect(card).not.toContainText('MANUAL OVERRIDE');
  await expect(card).not.toContainText('Calculated:');
  await expect(card).not.toContainText('Accepted:');
  await expect(card).not.toContainText('999');
  await expect(component.getByTestId('saved-exceptions')).toContainText('999');
});
