import { expect, test } from '@playwright/experimental-ct-react';
import { PDFDocument } from 'pdf-lib';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { Workspace } from '@/components/app-shell/Workspace';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';

test('standalone T/DD prints only its report on one sheet and restores the screen', async ({ mount, page }, testInfo) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const component = await mount(<AppShell navigation={[]} scrollOwner="workspace"
    topBar={<ContextTopBar title="Glass Calculator"/>}
    bottomBar={<ContextBottomBar label="Glass Calculator actions" actions={<div id="glass-calculator-bottom-actions"/>}/>}
  ><Workspace className="glass-calculator-workspace" width="fluid"><StandaloneGlassCalculator/></Workspace></AppShell>);
  const pane = component.locator('#door-input-pane');
  const print = component.getByRole('button', { name: 'Print', exact: true });
  const reset = component.getByRole('button', { name: 'Reset', exact: true });
  await expect(component.locator('#glass-calculator-bottom-actions').getByRole('button')).toHaveText(['Print', 'Reset']);
  await expect(print).toBeVisible();
  await expect(print).toBeEnabled();
  await expect(reset).toBeVisible();
  await expect(reset).toBeEnabled();
  await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('DD');
  await expect(print).toBeVisible();
  await expect(print).toBeEnabled();
  await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('With Glass');
  await expect(print).toBeVisible();
  await expect(print).toBeDisabled();
  await pane.getByRole('button', { name: 'Add transom', exact: true }).click();
  await pane.getByRole('button', { name: 'Remove left sidelight', exact: true }).click();
  await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
  const roWidth = pane.getByLabel('RO Width (inches)', { exact: true });
  const roHeight = pane.getByLabel('RO Height (inches)', { exact: true });
  await roWidth.fill('76'); await roWidth.press('Enter');
  await roHeight.fill('96'); await roHeight.press('Enter');
  await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
  await expect(print).toBeVisible();
  await expect(print).toBeEnabled();
  const report = component.locator('.glass-calculator-print');
  await expect(report).toBeHidden();
  const beforeWidth = await roWidth.inputValue();
  const beforeHeight = await roHeight.inputValue();
  const before = await pane.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }));
  await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printRequested = 'true'; }; });
  await component.getByRole('button', { name: 'Print', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
  await page.emulateMedia({ media: 'print' });
  await expect(report).toBeVisible();
  await expect(report).toContainText('Complete');
  await expect(report).toContainText('T/DD');
  await expect(report.getByRole('heading', { name: 'Glass Calculation', exact: true })).toBeVisible();
  await expect(report.locator('.glass-unit-diagram')).toBeVisible();
  await expect(pane).toBeHidden();
  await expect(component.locator('.glass-entry-workspace')).toBeHidden();
  await expect(component.locator('.app-context-bar')).toBeHidden();
  await expect(component.locator('.app-context-bottom-bar')).toBeHidden();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeHidden();
  await expect(component.getByRole('button', { name: 'Print', exact: true })).toBeHidden();
  const pdf = await page.pdf({ preferCSSPageSize: true, path: testInfo.outputPath('glass-calculation.pdf') });
  expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
  await page.emulateMedia({ media: 'screen' });
  await expect(report).toBeHidden();
  await expect(pane).toBeVisible();
  await expect(roWidth).toHaveValue(beforeWidth);
  await expect(roHeight).toHaveValue(beforeHeight);
  expect(await pane.evaluate((element) => ({ width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }))).toEqual(before);
  await expect(print).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  for (const config of ['D', 'DD']) {
    await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption(config);
    await expect(print).toBeVisible();
    await expect(print).toBeEnabled();
    await expect(reset).toBeVisible();
    await expect(reset).toBeEnabled();
  }
});

for (const scenario of ['D', 'DD', 'Interior D', 'Patio DD', 'Custom D', 'Custom DD', 'Fit to RO D']) {
  test(`${scenario} prints a one-page Door Calculation without a diagram`, async ({ mount, page }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    const component = await mount(<AppShell navigation={[]} scrollOwner="workspace"
      topBar={<ContextTopBar title="Glass Calculator"/>}
      bottomBar={<ContextBottomBar label="Glass Calculator actions" actions={<div id="glass-calculator-bottom-actions"/>}/>}
    ><Workspace className="glass-calculator-workspace" width="fluid"><StandaloneGlassCalculator/></Workspace></AppShell>);
    const pane = component.locator('#door-input-pane');
    if (scenario === 'Interior D') await pane.getByRole('button', { name: 'Interior', exact: true }).click();
    if (scenario.includes('DD')) await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('DD');
    if (scenario === 'Patio DD') await pane.getByRole('combobox', { name: 'DD Sizing', exact: true }).selectOption('5');
    if (scenario.startsWith('Custom')) {
      if (scenario === 'Custom D') await pane.getByRole('combobox', { name: 'Material', exact: true }).selectOption('wood');
      if (scenario === 'Custom DD') await pane.getByRole('switch', { name: 'Custom Slab', exact: true }).click();
      if (scenario === 'Custom D') {
        await pane.getByRole('combobox', { name: 'Width', exact: true }).selectOption('Custom');
        await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption('Custom');
        await pane.getByLabel('Actual slab width, inches', { exact: true }).fill('35');
        await pane.getByLabel('Actual slab height, inches', { exact: true }).fill('79');
      } else {
        await pane.getByLabel('Active Slab Width, inches', { exact: true }).fill('35');
        await pane.getByLabel('Inactive Slab Width, inches', { exact: true }).fill('33');
        await pane.getByLabel('Slab Height, inches', { exact: true }).fill('79');
      }
    }
    if (scenario === 'Fit to RO D') {
      await pane.getByRole('switch', { name: 'Fit to RO', exact: true }).click();
      await pane.getByLabel('RO Width, inches', { exact: true }).fill('38');
      await pane.getByLabel('RO Height, inches', { exact: true }).fill('80');
    }
    await expect(pane.locator('.glass-entry-workspace')).toHaveCount(0);
    await expect(component.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
    await expect(component.getByRole('button', { name: 'Print', exact: true })).toBeEnabled();
    await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
    await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
    const inputsBefore = await pane.locator('input, select, textarea').evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));
    const report = component.locator('.glass-calculator-print');
    await page.evaluate(() => { window.print = () => { document.documentElement.dataset.printRequested = 'true'; }; });
    await component.getByRole('button', { name: 'Print', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-print-requested', 'true');
    await page.emulateMedia({ media: 'print' });
    await expect(report.getByRole('heading', { name: 'Door Calculation', exact: true })).toBeVisible();
    await expect(report.locator('.glass-unit-diagram, svg')).toHaveCount(0);
    await expect(pane).toBeHidden();
    await expect(report).toContainText('Jamb legs');
    await expect(report).toContainText('Actual slab');
    await expect(report).toContainText('Header length');
    if (scenario === 'D' || scenario === 'DD') {
      const measurement = (label: string) => report.locator('dl > div').filter({ has: page.getByText(label, { exact: true }) }).locator('dd');
      await expect(measurement('Header length')).toHaveText(scenario === 'D' ? '36"' : '72 9/16"');
      await expect(measurement('Frame width')).toHaveText(scenario === 'D' ? '37 1/2"' : '74 1/16"');
    }
    if (scenario === 'Patio DD') await expect(report).toContainText('28 1/2"');
    if (scenario === 'Custom DD') await expect(report).toContainText('33"');
    if (scenario === 'Fit to RO D') {
      await expect(report).toContainText('Warning');
      await expect(report).toContainText('Door will be cut down');
    } else await expect(report).toContainText('Complete');
    const pdf = await page.pdf({ preferCSSPageSize: true, path: testInfo.outputPath('door-calculation.pdf') });
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(1);
    await page.emulateMedia({ media: 'screen' });
    await expect(report).toBeHidden();
    await expect(pane).toBeVisible();
    expect(await pane.locator('input, select, textarea').evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value))).toEqual(inputsBefore);
  });
}

test('incomplete custom slabs and DD reductions remain non-printable', async ({ mount, page }) => {
  const component = await mount(<StandaloneGlassCalculator/>);
  const pane = component.locator('#door-input-pane');
  const report = component.locator('.glass-calculator-print');
  const print = component.getByRole('button', { name: 'Print', exact: true });
  await pane.getByRole('combobox', { name: 'Material', exact: true }).selectOption('wood');
  await pane.getByRole('combobox', { name: 'Width', exact: true }).selectOption('Custom');
  await pane.getByRole('combobox', { name: 'Height', exact: true }).selectOption('Custom');
  await expect(print).toBeVisible();
  await expect(print).toBeDisabled();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  await expect(report).toContainText('Incomplete');
  await pane.getByLabel('Actual slab width, inches', { exact: true }).fill('-1');
  await pane.getByLabel('Actual slab height, inches', { exact: true }).fill('79');
  await expect(print).toBeVisible();
  await expect(print).toBeDisabled();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  await expect(report).toContainText('Blocked');
  await expect(report).not.toContainText('Complete');
  await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('DD');
  await expect(print).toBeVisible();
  await expect(print).toBeDisabled();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  await pane.getByRole('switch', { name: 'Fit to RO', exact: true }).click();
  await pane.getByLabel('RO Width, inches', { exact: true }).fill('60');
  await expect(print).toBeVisible();
  await expect(print).toBeDisabled();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Reset', exact: true })).toBeEnabled();
  await page.emulateMedia({ media: 'print' });
  await expect(report).toContainText('Blocked');
  await expect(report).toContainText('SPECIAL / REVIEW REQUIRED');
  await expect(report).not.toContainText('Complete');
});
