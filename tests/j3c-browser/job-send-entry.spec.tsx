import { expect, test } from '@playwright/experimental-ct-react';
import { DirtySendEntryHarness } from './j3c-harness';

test('real Send entry blocks dirty state and opens saved state', async ({ mount }) => {
  const dirty = await mount(<DirtySendEntryHarness dirty/>); await dirty.getByRole('button', { name: 'Send Work Order' }).click(); await expect(dirty.getByText('Save the job before sending the work order.')).toBeVisible(); await dirty.unmount();
  const saved = await mount(<DirtySendEntryHarness dirty={false}/>); await saved.getByRole('button', { name: 'Send Work Order' }).click(); await expect(saved.getByText('opened')).toBeVisible();
});
