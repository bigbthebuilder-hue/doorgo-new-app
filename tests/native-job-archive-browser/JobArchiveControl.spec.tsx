import { expect, test } from '@playwright/experimental-ct-react';
import { ArchiveHarness } from './archive-harness';

test('is absent for an unsaved job', async ({ mount }) => {
  const component = await mount(<ArchiveHarness saved={false}/>);
  await expect(component.getByRole('button', { name: 'Archive Job' })).toHaveCount(0);
});

test('requires a reason and confirmation, then archives the exact saved revision and returns to Jobs', async ({ mount, page }) => {
  const component = await mount(<ArchiveHarness/>);
  await expect(component.getByRole('button', { name: 'Archive Job' })).toBeVisible();
  await component.getByRole('button', { name: 'Archive Job' }).click();
  await expect(component.getByRole('status')).toHaveText('Enter a reason for archiving this job.');
  await component.getByLabel('Archive reason').fill('Controlled hosted acceptance complete');
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('does not delete it'); await dialog.dismiss(); });
  await component.getByRole('button', { name: 'Archive Job' }).click();
  expect(await page.evaluate(() => window.__archiveRequests ?? [])).toEqual([]);
  page.once('dialog', async (dialog) => { expect(dialog.message()).toContain('Unrelated unsaved editor changes will not be saved.'); await dialog.accept(); });
  await component.getByRole('button', { name: 'Archive Job' }).click();
  await expect.poll(() => page.evaluate(() => window.__archiveRequests ?? [])).toEqual([{ internalJobId: '11111111-1111-4111-8111-111111111111', expectedRevision: 7, reason: 'Controlled hosted acceptance complete' }]);
  await expect.poll(() => page.evaluate(() => window.__archiveNavigations ?? [])).toEqual(['/jobs']);
});

for (const failure of [
  { outcome: 'stale_revision', message: 'This draft changed after you opened it. Reload and review the latest version before saving.' },
  { outcome: 'permission_required', message: 'Your account does not have permission for this action.' },
] as const) {
  test(`keeps ${failure.outcome} visible`, async ({ mount, page }) => {
    const component = await mount(<ArchiveHarness outcome={failure.outcome}/>);
    await component.getByLabel('Archive reason').fill('Controlled test');
    page.once('dialog', (dialog) => dialog.accept());
    await component.getByRole('button', { name: 'Archive Job' }).click();
    await expect(component.getByRole('status')).toHaveText(failure.message);
    expect(await page.evaluate(() => window.__archiveNavigations ?? [])).toEqual([]);
  });
}
