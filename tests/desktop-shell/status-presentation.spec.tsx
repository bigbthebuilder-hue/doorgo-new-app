import { test, expect } from '@playwright/experimental-ct-react';
import { DoorLineWorkspaceHarness } from './DoorLineWorkspaceHarness';
import { GeometryExceptionHarness } from './GeometryExceptionHarness';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';

test('incomplete saved line and editor use Details Needed without duplicate attention', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<DoorLineWorkspaceHarness initialLines={[{ ...defaultDoorLine('Exterior'), lineId: 'details', config: 'SD', roWidth: '', sidelightType: 'Glass', sidelightGlass: 'Clear' }]}/>);
  const saved = component.locator('#job-lines-pane');
  await expect(saved.getByText('Details Needed', { exact: true })).toBeVisible();
  await expect(saved).not.toContainText('Needs Attention');
  await expect(saved).not.toContainText('Glass Detail Needed');
  await saved.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(component.getByRole('button', { name: 'Leave Details Needed', exact: true })).toBeVisible();
  await expect(component.getByText('Status: Details Needed', { exact: true })).toBeVisible();
});

for (const kind of ['warning', 'blocked'] as const) {
  test('saved ' + kind + ' has one specific status', async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const component = await mount(<GeometryExceptionHarness kind={kind}/>);
    const saved = component.locator('#job-lines-pane');
    await expect(saved.getByText(kind === 'warning' ? 'Warning' : 'Blocked', { exact: true })).toBeVisible();
    await expect(saved).not.toContainText('Needs Attention');
  });
}

test('standalone normalizes incomplete glass wording and preserves print eligibility', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  const component = await mount(<StandaloneGlassCalculator/>);
  const print = component.getByRole('button', { name: 'Print', exact: true });
  await expect(print).toBeEnabled();
  await component.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('With Glass');
  await expect(component.getByText('Status: Details Needed', { exact: true })).toBeVisible();
  await expect(print).toBeDisabled();
  await expect(component).not.toContainText('Glass Detail Needed');
  await component.getByRole('combobox', { name: 'Configuration', exact: true }).selectOption('D');
  await expect(print).toBeEnabled();
});
