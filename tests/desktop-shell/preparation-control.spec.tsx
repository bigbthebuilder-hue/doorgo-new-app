import { expect, test } from '@playwright/experimental-ct-react';
import { SlabSizingHarness } from './SlabSizingHarness';
import { defaultDoorLine } from '../../lib/jobs/door-line-contract';

for (const manual of [false, true]) {
  test('preparation ' + (manual ? 'manual override survives height and reopening' : 'automatic follows nominal height without STD wording'), async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const component = await mount(<SlabSizingHarness line={{ ...defaultDoorLine(), lineId: 'fixture', lineIndex: 1, lineStatus: 'Active', doorType: '3070SG10LE' }}/>);
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    const pane = component.locator('#door-input-pane');
    const prep = pane.getByRole('combobox', { name: 'Prep', exact: true });
    await expect(prep.locator('option')).toHaveText(['Double Drill', 'Single Drill', 'Multipoint']);
    await expect(prep).toHaveValue('STD');
    if (manual) await prep.selectOption('SINGLE');
    const height = pane.getByRole('combobox', { name: 'Height', exact: true });
    await height.selectOption(`8'0"`);
    await expect(prep).toHaveValue(manual ? 'SINGLE' : 'MULTI');
    await height.selectOption(`7'0"`);
    await expect(prep).toHaveValue(manual ? 'SINGLE' : 'STD');
    await height.selectOption(`8'0"`);
    if (manual) await prep.selectOption('STD');
    await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
    const lines = JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]');
    expect(lines[0].prep).toBe(manual ? 'STD' : 'MULTI');
    expect(lines[0].prepSource).toBe(manual ? 'manual' : 'automatic');
    await component.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(prep).toHaveValue(manual ? 'STD' : 'MULTI');
    await height.selectOption(`7'0"`);
    await expect(prep).toHaveValue('STD');
  });
}

test('incompatible manual preparation requires a choice instead of silent reset', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<SlabSizingHarness line={{ ...defaultDoorLine('Interior'), lineId: 'fixture', prepSource: 'manual', lineStatus: 'Active' }}/>);
  await component.getByRole('button', { name: 'Edit', exact: true }).click();
  const pane = component.locator('#door-input-pane');
  await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('PKT');
  const prep = pane.getByRole('combobox', { name: 'Prep', exact: true });
  await expect(prep).toHaveValue('YES');
  await expect(prep.locator('option:checked')).toHaveText('Choose preparation');
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  expect(JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]')[0].config).toBe('D');
  await prep.selectOption('Round Weiser');
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  expect(JSON.parse(await component.getByTestId('saved-sizing').textContent() ?? '[]')[0].prep).toBe('Round Weiser');
});


test('blank new exterior line starts automatically and Jobs View remains read-only', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<SlabSizingHarness line={{ qty: 1, notes: '' }}/>);
  const pane = component.locator('#door-input-pane');
  await pane.getByRole('button', { name: 'Exterior', exact: true }).click();
  const prep = pane.getByRole('combobox', { name: 'Prep', exact: true });
  await expect(prep).toHaveValue('STD');
  await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption(`8'0"`);
  await expect(prep).toHaveValue('MULTI');
  await component.unmount();
  const readOnly = await mount(<SlabSizingHarness canEdit={false} line={{ ...defaultDoorLine(), prepSource: 'manual', lineId: 'readonly' }}/>);
  await expect(readOnly.getByRole('combobox', { name: 'Prep', exact: true })).toHaveCount(0);
  await expect(readOnly.getByText('Door lines and geometry are read-only with jobs = view.')).toBeVisible();
});
