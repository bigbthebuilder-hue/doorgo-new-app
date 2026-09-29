import { test, expect } from '@playwright/experimental-ct-react';
import { InlineGlassHarness } from './InlineGlassHarness';

test('Jamb 4 sides selects, recalculates inline, adds and reopens', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<InlineGlassHarness/>);
  const pane = component.locator('#door-input-pane');
  const sill = pane.getByRole('combobox', { name: 'Sill', exact: true });
  await sill.selectOption('J-4-S');
  await expect(pane.getByText('Outside frame: 37 1/2" x 80 3/4"', { exact: false })).toBeVisible();
  await pane.getByRole('button', { name: 'Add Door', exact: true }).click();
  let lines = JSON.parse(await component.getByTestId('saved-lines').textContent() ?? '[]');
  expect(lines.at(-1).construction).toBe('jamb-four-sides');
  await component.getByRole('button', { name: 'Edit', exact: true }).last().click();
  await expect(sill).toHaveValue('J-4-S');
  await expect(sill).not.toHaveAttribute('data-comparison-different');
  await sill.selectOption('STD');
  await expect(sill).toHaveAttribute('data-last-edited', 'true');
  await pane.getByRole('spinbutton', { name: 'Quantity', exact: true }).fill('2');
  await expect(sill).toHaveAttribute('data-comparison-different', 'true');
  await expect(sill).toHaveCSS('background-color', 'rgb(243, 237, 251)');
  await sill.selectOption('J-4-S');
  await expect(sill).not.toHaveAttribute('data-comparison-different');
  await pane.getByRole('button', { name: 'Cancel Edit', exact: true }).click();
  await component.getByRole('button', { name: 'Edit', exact: true }).first().click();
  const result = pane.getByLabel('Calculated measurements');
  await sill.selectOption('STD');
  await expect(result).toContainText('11 5/8');
  await sill.selectOption('J-4-S');
  await expect(result).toContainText('12 1/8');
  await sill.selectOption('STD');
  await expect(result).toContainText('11 5/8');
  await sill.selectOption('J-4-S');
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  lines = JSON.parse(await component.getByTestId('saved-lines').textContent() ?? '[]');
  expect(lines[0].construction).toBe('jamb-four-sides');
  expect(lines[0].glassCalc.transomHeight).toBe('12 1/8"');
  await component.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(sill).toHaveValue('J-4-S');
});

test('single Sill control defaults, Interior OUT conversion and No-Jamb visibility', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<InlineGlassHarness/>);
  const pane = component.locator('#door-input-pane');
  const sill = pane.getByRole('combobox', { name: 'Sill', exact: true });
  await expect(sill).toHaveCount(1);
  await expect(sill.locator('option')).toHaveText(['STD', 'DARK', 'LOW-PRO', 'NONE', 'J-4-S']);
  await expect(sill).toHaveValue('STD');
  await expect(pane.getByRole('textbox', { name: 'Sill', exact: true })).toHaveCount(0);
  await expect(pane.getByRole('combobox', { name: 'Construction', exact: true })).toHaveCount(0);
  await pane.getByRole('button', { name: 'Interior', exact: true }).click();
  await expect(sill).toHaveValue('NONE');
  const swing = pane.getByRole('combobox', { name: 'Swing', exact: true });
  for (const hand of ['LHOUT', 'RHOUT']) {
    for (const code of ['STD', 'DARK', 'NONE', 'J-4-S']) {
      await sill.selectOption('LOW-PRO');
      await swing.selectOption(hand);
      await sill.selectOption(code);
      await expect(swing).toHaveValue(hand === 'LHOUT' ? 'LH' : 'RH');
    }
  }
  const config = pane.getByRole('combobox', { name: 'Configuration', exact: true });
  for (const noJamb of ['PKT', 'B.P.']) {
    await config.selectOption('D');
    await sill.selectOption('LOW-PRO');
    await config.selectOption(noJamb);
    await expect(sill).toHaveCount(0);
  }
});
