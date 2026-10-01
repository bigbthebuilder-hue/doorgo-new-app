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
  await pane.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('With Glass');
  await pane.getByRole('button', { name: 'Add transom', exact: true }).click();
  await pane.getByRole('button', { name: 'Remove left sidelight', exact: true }).click();
  await pane.getByRole('button', { name: 'Double Door', exact: true }).click();
  const roWidth = pane.getByLabel('RO Width (inches)', { exact: true });
  const roHeight = pane.getByLabel('RO Height (inches)', { exact: true });
  await roWidth.fill('76'); await roWidth.press('Enter');
  await roHeight.fill('96'); await roHeight.press('Enter');
  await expect(pane.getByText('Status: Complete', { exact: true })).toBeVisible();
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
  await expect(component.getByRole('button', { name: 'Print', exact: true })).toBeVisible();
});
