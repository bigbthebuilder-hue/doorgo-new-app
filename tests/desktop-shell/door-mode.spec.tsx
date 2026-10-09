import { expect, test } from '@playwright/experimental-ct-react';
import { DoorLineWorkspaceHarness } from './DoorLineWorkspaceHarness';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';

test('Exterior astragal and Interior single-door saved wording remain unchanged', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await mount(<DoorLineWorkspaceHarness initialLines={[
    { ...defaultDoorLine('Exterior'), lineId: 'metal', config: 'DD', doubleDoorAstragal: 'standard-metal-ds347' },
    { ...defaultDoorLine('Exterior'), lineId: 'ferco', config: 'DD', doubleDoorAstragal: 'wood-ferco-astra-lock' },
    { ...defaultDoorLine('Interior'), lineId: 'single', config: 'D' },
  ]}/>);
  const cards = page.locator('.job-line-card');
  await expect(cards.nth(0)).toContainText('Astragal: Standard Metal');
  await expect(cards.nth(1)).toContainText('Astragal: Wood + Ferco Astra Lock');
  await expect(cards.nth(2)).not.toContainText(/Astragal|Mag Catch/);
  for (const card of await cards.all()) await expect(card).not.toContainText('Mag Catch');
});

for (const doubleDoorAstragal of [null, 'standard-metal-ds347', 'wood-ferco-astra-lock'] as const) {
  test(`Interior DD saved card Mag Catch with internal ${doubleDoorAstragal}`, async ({ mount, page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await mount(<DoorLineWorkspaceHarness initialLines={[{ ...defaultDoorLine('Interior'), lineId: 'interior-dd', doorType: 'Molded', config: 'DD', doubleDoorAstragal }]}/>);
    const card = page.locator('.job-line-card');
    await expect(card).toContainText('Mag Catch');
    expect((await card.innerText()).match(/Mag Catch/g)).toHaveLength(1);
    await expect(card).not.toContainText(/astragal|ferco|DS347|standard metal/i);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await page.getByRole('button', { name: 'Update Door', exact: true }).click();
    await expect(card).toContainText('Mag Catch');
    expect((await card.innerText()).match(/Mag Catch/g)).toHaveLength(1);
    await expect(card).not.toContainText(/astragal|ferco|DS347|standard metal/i);
  });
}

for (const mode of ['Exterior', 'Interior'] as const) test(`first door explicitly chooses ${mode}`, async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await mount(<DoorLineWorkspaceHarness initialLines={[]}/>);
  const pane = page.locator('#door-input-pane');
  for (const name of ['Exterior', 'Interior']) await expect(pane.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(pane.getByRole('button', { name: 'Add Door', exact: true })).toBeDisabled();
  await expect(pane.getByRole('status')).toHaveText('Choose Exterior or Interior before adding a door.');
  await expect(pane.locator('.door-input-preview')).toHaveText('Preview: Choose a designation to begin.');
  await expect(pane.getByRole('combobox', { name: 'Sill', exact: true })).toHaveCount(0);
  await expect(page.getByTestId('saved-lines')).toHaveText('[]');
  await pane.getByRole('button', { name: mode, exact: true }).click();
  await expect(pane.getByRole('combobox', { name: 'Sill', exact: true })).toHaveValue(mode === 'Exterior' ? 'STD' : 'NONE');
  await expect(pane.getByRole('combobox', { name: 'Hinge Type', exact: true })).toHaveValue(mode === 'Exterior' ? 'BB' : 'REG');
  await pane.getByLabel('Door Type', { exact: true }).fill('Test door');
  await pane.getByRole('button', { name: 'Add Door', exact: true }).click();
  const saved = JSON.parse((await page.getByTestId('saved-lines').textContent())!);
  expect(saved).toHaveLength(1);
  expect(saved[0].mode).toBe(mode);
  await expect(pane.getByRole('button', { name: mode, exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('active order controls inheritance; edits and archives retain their authority', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await mount(<DoorLineWorkspaceHarness initialLines={[{ ...defaultDoorLine('Exterior'), doorType: 'Exterior saved', lineId: 'first' }, { ...defaultDoorLine('Interior'), lineId: 'archived', lineStatus: 'Archived' }]}/>);
  const pane = page.locator('#door-input-pane');
  await expect(pane.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pane.getByRole('button', { name: 'Interior', exact: true }).click();
  await pane.getByLabel('Door Type', { exact: true }).fill('Interior saved');
  await pane.getByRole('button', { name: 'Add Door', exact: true }).click();
  await expect(pane.getByRole('button', { name: 'Interior', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(pane.getByRole('combobox', { name: 'Sill', exact: true })).toHaveValue('NONE');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(pane.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await pane.getByRole('button', { name: 'Update Door', exact: true }).click();
  await expect(pane.getByRole('button', { name: 'Interior', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Archive / Remove', exact: true }).last().click();
  await expect(pane.getByRole('button', { name: 'Exterior', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Archive / Remove', exact: true }).click();
  await expect(pane.getByRole('button', { name: 'Add Door', exact: true })).toBeDisabled();
  for (const name of ['Exterior', 'Interior']) await expect(pane.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false');
});

test('loading only archived lines requires a fresh designation', async ({ mount, page }) => {
  await mount(<DoorLineWorkspaceHarness initialLines={[{ ...defaultDoorLine('Interior'), lineId: 'old', lineStatus: 'Archived' }]}/>);
  await expect(page.getByRole('button', { name: 'Add Door', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Interior', exact: true })).toHaveAttribute('aria-pressed', 'false');
});
