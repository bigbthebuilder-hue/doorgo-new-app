import { expect, test } from '@playwright/experimental-ct-react';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import { InlineGlassHarness } from './InlineGlassHarness';

for (const mode of ['Intake', 'Calculator'] as const) {
  for (const width of [1600, 390]) {
    test(mode + ' uses the shared door setup at ' + width, async ({ mount, page }) => {
      await page.setViewportSize({ width, height: 900 });
      const component = mode === 'Intake' ? await mount(<InlineGlassHarness/>) : await mount(<StandaloneGlassCalculator/>);
      const pane = component.locator('#door-input-pane');
      for (const [label, value] of [['Configuration', 'D'], ['Width', `3'0"`], ['Height', `6'8"`], ['Material', 'fiberglass'], ['Sill', 'STD'], ['Swing', 'LH']]) {
        await expect(pane.getByRole('combobox', { name: label, exact: true })).toHaveValue(value);
      }
      await expect(pane.getByRole('combobox', { name: 'Sill', exact: true }).locator('option')).toHaveText(['STD', 'DARK', 'LOW-PRO', 'NONE', 'J-4-S']);
      await expect(pane.getByRole('switch', { name: 'Custom Slab', exact: true })).toBeDisabled();
      await pane.getByRole('combobox', { name: 'Material', exact: true }).selectOption('wood');
      await pane.getByRole('switch', { name: 'Custom Slab', exact: true }).click();
      await expect(pane.getByLabel('Custom Slab Width, inches', { exact: true })).toBeVisible();
      await expect(pane.getByLabel('Custom Slab Height, inches', { exact: true })).toBeVisible();
      await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('With Glass');
      await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
      await expect(pane.getByLabel('Active Slab Width, inches', { exact: true })).toBeVisible();
      await expect(pane.getByLabel('Inactive Slab Width, inches', { exact: true })).toBeVisible();
      await pane.getByRole('switch', { name: 'Fit to RO', exact: true }).click();
      await expect(pane.getByRole('switch', { name: 'Fit to RO', exact: true })).toHaveAttribute('aria-checked', 'true');
      await expect(pane.getByLabel('RO Width (inches)', { exact: true })).toHaveAttribute('inputmode', 'decimal');
      await expect(pane.getByLabel('Sidelight Product Width (inches)', { exact: true })).toBeVisible();
      if (mode === 'Calculator') await expect(pane.locator('[data-comparison-different="true"]')).toHaveCount(0);
      expect(await pane.evaluate((node) => node.scrollWidth <= node.clientWidth + 2)).toBe(true);
    });
  }

  test(mode + ' preserves shared glass and blocks impossible SDDS until reconciled', async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const component = mode === 'Intake' ? await mount(<InlineGlassHarness/>) : await mount(<StandaloneGlassCalculator/>);
    const pane = component.locator('#door-input-pane');
    await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('With Glass');
    await pane.getByLabel('Door Type', { exact: true }).fill('Glass regression');
    // Changing the T-bar before RO exists must not discard the Clear specification.
    await pane.getByRole('combobox', { name: 'Unit T-bar Size', exact: true }).selectOption('1.5');
    await pane.getByRole('combobox', { name: 'Unit T-bar Size', exact: true }).selectOption('2.25');
    const ro = pane.getByLabel('RO Width (inches)', { exact: true });
    const side = pane.getByLabel('Sidelight Product Width (inches)', { exact: true });
    await ro.fill('60'); await ro.press('Enter');
    await pane.getByRole('button', { name: 'Add right sidelight', exact: true }).click();
    await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
    const singleWidth = await side.inputValue();
    await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
    await expect(ro).toHaveValue('60"');
    await expect(pane.getByText('Status: Blocked', { exact: true })).toBeVisible();
    await expect(pane.getByLabel('Calculated measurements')).toHaveCount(0);
    await expect(side).not.toHaveValue(singleWidth);
    await expect(pane.getByText(/Choose glass for the/)).toHaveCount(0);
    if (mode === 'Calculator') {
      await expect(component.getByRole('button', { name: 'Print', exact: true })).toHaveCount(0);
      const printout = component.locator('.glass-calculator-print');
      await expect(printout).toContainText('Blocked');
      await expect(printout).not.toContainText('Complete');
      await expect(printout).not.toContainText(singleWidth);
      await page.emulateMedia({ media: 'print' });
      await expect(printout).toBeVisible();
      await expect(pane).toBeHidden();
      await expect(printout).not.toContainText('Complete');
      await page.emulateMedia({ media: 'screen' });
    }
    await pane.getByRole('button', { name: 'Single Door', exact: true }).click();
    await expect(ro).toHaveValue('60"');
    await expect(side).toHaveValue(singleWidth);
    await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
    await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
    await side.fill('12'); await side.press('Enter');
    await expect(ro).not.toHaveValue('60"');
    await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
    await expect(pane.getByRole('combobox', { name: 'Glass Type', exact: true })).toHaveValue('CLEAR');
    await expect(pane.getByLabel('Calculated measurements')).toContainText('2 total (1 left / 1 right)');
    await pane.screenshot({ path: testInfo.outputPath(mode.toLowerCase() + '-shared-editor.png') });
    if (mode === 'Intake') {
      await pane.getByRole('button', { name: 'Add Door', exact: true }).click();
      const saved = JSON.parse(await component.getByTestId('saved-lines').textContent() ?? '[]');
      expect(saved.at(-1).sidelightSpecifications.map((entry: { glassTypeCode: string }) => entry.glassTypeCode)).toEqual(['CLEAR', 'CLEAR']);
    } else {
      await expect(component.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
      await expect(component.locator('.glass-calculator-print')).toContainText('Complete');
    }
    expect(errors).toEqual([]);
  });
}
