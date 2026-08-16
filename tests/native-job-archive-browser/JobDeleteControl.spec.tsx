import { expect, test } from '@playwright/experimental-ct-react';
import { DeleteHarness } from './delete-harness';

test('non-manager does not see permanent delete', async ({ mount }) => {
  const component = await mount(<DeleteHarness manager={false}/>);
  await expect(component.getByRole('button', { name: 'Permanently Delete Job' })).toHaveCount(0);
});

test('manager confirmation identifies job and cancel makes no request', async ({ mount, page }) => {
  const component = await mount(<DeleteHarness/>);
  await component.getByRole('button', { name: 'Permanently Delete Job' }).click();
  await expect(component.getByRole('heading')).toContainText('DG-000013 · Test Job');
  await expect(component.getByText('This cannot be undone.')).toBeVisible();
  await component.getByRole('button', { name: 'Cancel' }).click();
  await expect(component.getByRole('dialog')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__deleteRequests ?? [])).toEqual([]);
});

test('confirmed deletion sends revision and returns to Jobs', async ({ mount, page }) => {
  const component = await mount(<DeleteHarness/>);
  await component.getByRole('button', { name: 'Permanently Delete Job' }).click();
  await component.getByRole('button', { name: 'Delete Job Permanently' }).click();
  await expect.poll(() => page.evaluate(() => window.__deleteRequests)).toEqual([{ internalJobId: '11111111-1111-4111-8111-111111111111', expectedRevision: 7 }]);
  await expect.poll(() => page.evaluate(() => window.__deleteNavigations)).toEqual(['/jobs']);
});

test('stale deletion stays in editor dialog with useful error', async ({ mount }) => {
  const component = await mount(<DeleteHarness outcome="stale_revision"/>);
  await component.getByRole('button', { name: 'Permanently Delete Job' }).click();
  await component.getByRole('button', { name: 'Delete Job Permanently' }).click();
  await expect(component.getByRole('status')).toContainText('changed after you opened it');
  await expect(component.getByRole('dialog')).toBeVisible();
});
