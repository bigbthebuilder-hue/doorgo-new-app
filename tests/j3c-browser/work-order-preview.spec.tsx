import { expect, test } from '@playwright/experimental-ct-react';
import { J3CBrowserHarness } from './j3c-harness';
import { blockedPreflight, excludedInactiveRecipient, recipientIds, recipients, warningPreflight } from './j3c-fixtures';

test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); await page.evaluate(() => { window.__j3cRequests = []; }); });

test('real preview UI exposes actions and sends IDs only', async ({ mount, page }) => {
  const component = await mount(<J3CBrowserHarness/>);
  await expect(component.getByText('Saved Work Order')).toBeVisible();
  await expect(component.getByRole('link', { name: 'Download PDF' })).toBeVisible();
  await expect(component.getByRole('button', { name: 'Print' })).toBeEnabled();
  await component.getByRole('button', { name: 'Send' }).click();
  await expect(component.getByText('Fixture Alpha')).toBeVisible();
  await expect(component.getByText(excludedInactiveRecipient.displayName)).toHaveCount(0);
  await expect(component.getByText('alpha.fixture@example.invalid')).toBeVisible();
  await expect(component.locator('input[type=email]')).toHaveCount(0);
  await expect(component.getByText('DoorGo Work Order – SO-900')).toBeVisible();
  await component.getByRole('button', { name: 'Send Email' }).click(); await expect(component.getByRole('alert')).toHaveText('Select at least one recipient.');
  await component.getByLabel(/Fixture Alpha/).check(); await component.getByLabel(/Fixture Zulu/).check();
  await component.getByRole('button', { name: 'Send Email' }).click();
  await expect(component.getByText('Sent to 2 recipients.')).toBeVisible();
  const requests = await page.evaluate(() => window.__j3cRequests);
  expect(requests).toEqual([{ internalJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', expectedRevision: 7, acknowledged: true, recipientUserIds: [...recipientIds] }]);
  expect(JSON.stringify(requests)).not.toContain('@');
});

test('permissions, blockers, warnings, and directory errors fail closed', async ({ mount }) => {
  for (const props of [{ accessLevel: 'none' as const }, { accessLevel: 'none' as const, manager: true }]) { const denied = await mount(<J3CBrowserHarness {...props}/>); await expect(denied.getByRole('button', { name: 'Send' })).toHaveCount(0); await denied.unmount(); }
  for (const accessLevel of ['view', 'use'] as const) { const allowed = await mount(<J3CBrowserHarness accessLevel={accessLevel}/>); await expect(allowed.getByRole('button', { name: 'Send' })).toBeVisible(); await allowed.unmount(); }
  const blocked = await mount(<J3CBrowserHarness preflight={blockedPreflight}/>); await expect(blocked.getByRole('button', { name: 'Send' })).toBeDisabled(); await expect(blocked.getByText('Fixture line is blocked.')).toBeVisible(); await blocked.unmount();
  const warned = await mount(<J3CBrowserHarness preflight={warningPreflight}/>); await expect(warned.getByRole('button', { name: 'Send' })).toBeDisabled(); await warned.getByRole('button', { name: 'Acknowledge and Preview' }).click(); await warned.getByRole('button', { name: 'Send' }).click(); await expect(warned.getByText('Fixture warning requires review.', { exact: true })).toBeVisible(); await warned.unmount();
  const directory = await mount(<J3CBrowserHarness directoryError="Recipient directory unavailable." recipients={[]}/>); await directory.getByRole('button', { name: 'Send' }).click(); await expect(directory.getByRole('alert')).toHaveText('Recipient directory unavailable.');
});

test('partial, stale, loading lock, and retry behavior remain on the order', async ({ mount, page }) => {
  const delayed = await mount(<J3CBrowserHarness outcome="delayed-success"/>); await delayed.getByRole('button', { name: 'Send' }).click(); await delayed.getByLabel(/Fixture Alpha/).check(); await delayed.getByRole('button', { name: 'Send Email' }).dblclick(); await expect(delayed.getByRole('button', { name: /Sending/ })).toBeDisabled(); await expect(delayed.getByText('Sent to 1 recipient.')).toBeVisible(); expect((await page.evaluate(() => window.__j3cRequests))?.length).toBe(1); await delayed.unmount();
  const partial = await mount(<J3CBrowserHarness outcome="partial"/>); await partial.getByRole('button', { name: 'Send' }).click(); for (const recipient of recipients) await partial.getByLabel(new RegExp(recipient.displayName)).check(); await partial.getByRole('button', { name: 'Send Email' }).click(); await expect(partial.getByText('Sent to 1 of 2 recipients. 1 failed.')).toBeVisible(); await expect(partial.getByLabel(/Fixture Zulu/)).toBeChecked(); await partial.unmount();
  const retry = await mount(<J3CBrowserHarness outcome="failure-then-success"/>); await retry.getByRole('button', { name: 'Send' }).click(); await retry.getByLabel(/Fixture Alpha/).check(); await retry.getByRole('button', { name: 'Send Email' }).click(); await expect(retry.getByRole('alert')).toContainText('Email failed for all 1 recipient'); await retry.getByRole('button', { name: 'Send Email' }).click(); await expect(retry.getByText('Sent to 1 recipient.')).toBeVisible(); await retry.unmount();
  const stale = await mount(<J3CBrowserHarness outcome="stale"/>); await stale.getByRole('button', { name: 'Send' }).click(); await stale.getByLabel(/Fixture Alpha/).check(); await stale.getByRole('button', { name: 'Send Email' }).click(); await expect(stale.getByRole('alert')).toContainText('Refresh before sending'); await expect(stale.getByText('Saved Work Order')).toBeVisible();
});

test('keyboard and narrow layout remain usable', async ({ mount, page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const component = await mount(<J3CBrowserHarness visibleIdentifier="DG-000123" pdfFilename="Work_Order_DG-000123.pdf"/>);
  await component.getByRole('button', { name: 'Send' }).focus(); await page.keyboard.press('Enter');
  await component.getByLabel(/Fixture Alpha/).focus(); await page.keyboard.press('Space'); await expect(component.getByLabel(/Fixture Alpha/)).toBeChecked();
  await expect(component.getByText('Work_Order_DG-000123.pdf', { exact: true })).toBeVisible();
  await component.getByRole('button', { name: 'Send Email' }).click(); await expect(component.getByText('Sent to 1 recipient.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBeTruthy();
});
