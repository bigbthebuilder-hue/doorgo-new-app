import { expect, test } from '@playwright/experimental-ct-react';
import { DirectDimensionGlassBuilderHarness, ImportedGlassBuilderHarness } from './imported-glass-builder-harness';

test('completed imported T/DS glass state renders visibly and survives application and reopening', async ({ mount, page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const component = await mount(<ImportedGlassBuilderHarness/>);
  const dialog = component.getByRole('dialog');

  await expect(dialog.getByText('Status: Complete', { exact: false })).toBeVisible();
  const svg = dialog.getByRole('img');
  await expect(svg).toHaveAttribute('viewBox', /^-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+$/);
  for (const kind of ['door', 'glass', 'divider', 'transom-divider']) await expect(svg.locator(`[data-kind="${kind}"]`).first()).toBeVisible();
  await expect(svg.getByText('Transom')).toBeVisible();
  const numericAttributes = await svg.locator('[data-kind]').evaluateAll((nodes) => nodes.flatMap((node) => ['data-x', 'data-y', 'data-width', 'data-height'].map((name) => node.getAttribute(name))));
  expect(numericAttributes.every((value) => value !== null && Number.isFinite(Number(value)))).toBe(true);
  const fills = await svg.locator('.diagram-background,.diagram-part').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill));
  expect(new Set(fills).size).toBeGreaterThan(2);
  expect(fills.every((fill) => fill !== 'rgb(0, 0, 0)')).toBe(true);

  await dialog.getByRole('button', { name: 'Add Door to Order' }).click();
  await expect(component.getByTestId('saved-status')).toHaveText('Complete');
  await expect(component.getByTestId('attention-count')).toHaveText('0');
  await expect(component.getByTestId('unit-count')).toHaveText('2');

  for (const theme of ['light-diagram', 'dark-diagram']) {
    const rendered = component.getByTestId(theme).getByRole('img');
    const themeFills = await rendered.locator('.diagram-background,.diagram-part').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).fill));
    expect(new Set(themeFills).size).toBeGreaterThan(2);
    expect(themeFills.every((fill) => fill !== 'rgb(0, 0, 0)')).toBe(true);
  }

  await component.getByRole('button', { name: 'Reopen Glass Builder' }).click();
  await expect(component.getByRole('dialog').getByText('Status: Complete', { exact: false })).toBeVisible();
  page.once('dialog', (confirmation) => confirmation.accept());
  await component.getByRole('dialog').getByRole('button', { name: 'Remove transom' }).click();
  await expect(component.getByRole('dialog').getByText('Status: Complete', { exact: false })).toBeVisible();
  await component.getByRole('dialog').getByRole('button', { name: 'Add transom' }).click();
  await expect(component.getByRole('dialog').getByText('Status: Glass Detail Needed', { exact: false })).toBeVisible();
  await component.getByRole('dialog').getByLabel('Transom Glass Type').selectOption('CLEAR');
  await component.getByRole('dialog').getByLabel('RO Height (inches)').fill('98');
  await expect(component.getByRole('dialog').getByText('Status: Complete', { exact: false })).toBeVisible();
  await component.getByRole('dialog').getByRole('button', { name: 'Save Door Changes' }).click();
  await expect(component.getByTestId('saved-status')).toHaveText('Complete');
  expect(consoleErrors.filter((message) => /same key|unique "key" prop|duplicate key|nan|infinity/i.test(message))).toEqual([]);
});

test('T/SDS unit type, Clear selection, and committed custom width remain canonical', async ({ mount }) => {
  const component = await mount(<DirectDimensionGlassBuilderHarness/>);
  const dialog = component.getByRole('dialog');
  await expect(dialog.getByLabel('Sidelight Type')).toHaveCount(1);
  await expect(dialog.getByLabel('Unit T-bar Size')).toHaveCount(1);
  await expect(dialog.getByText('Sidelight Product Width')).toBeVisible();
  await dialog.getByLabel('Sidelight Type').selectOption('Glass');
  const right = dialog.getByRole('group', { name: 'Right sidelight 1' });
  await right.getByLabel('Glass Type').selectOption('CLEAR');
  const width = dialog.getByLabel('Sidelight Product Width (inches)');
  await width.fill('14 1/8');
  await width.press('Enter');
  await expect(width).toHaveValue('14 1/8"');
  await expect(dialog.getByLabel('RO Width (inches)')).not.toHaveValue('');
  await expect(dialog.getByLabel('Calculated measurements')).toBeVisible();
  await expect(dialog.getByText('Transom Product Size')).toBeVisible();
  await expect(dialog.getByText(/Choose glass for the right sidelight 1/i)).toHaveCount(0);
});

test('RO height normalization and one space-safe unit panel note survive commit and reopen', async ({ mount }) => {
  const component = await mount(<DirectDimensionGlassBuilderHarness/>);
  let dialog = component.getByRole('dialog');
  const roHeight = dialog.getByLabel('RO Height (inches)');
  for (const [raw, formatted] of [['94.25', '94 1/4"'], ['94.125', '94 1/8"'], ['94 1/4', '94 1/4"'], ['94-1/4', '94 1/4"']]) {
    await roHeight.fill(raw);
    await roHeight.press('Enter');
    await expect(roHeight).toHaveValue(formatted);
  }
  await roHeight.fill('invalid height');
  await roHeight.press('Enter');
  await expect(roHeight).toHaveValue('invalid height');
  await expect(dialog.getByText('Enter a valid RO height in inches.')).toBeVisible();
  await roHeight.fill('96');
  await roHeight.press('Enter');
  await dialog.getByLabel('Sidelight Type').selectOption('Panel');
  await expect(dialog.getByLabel('Sidelight Panel Construction Notes')).toHaveCount(1);
  await dialog.getByLabel('Sidelight Panel Construction Notes').fill('w/ 764 Adelaide glass');
  await expect(dialog.getByLabel('Sidelight Panel Construction Notes')).toHaveValue('w/ 764 Adelaide glass');
  await dialog.getByRole('button', { name: 'Add Door to Order' }).click();
  await component.getByRole('button', { name: 'Reopen Glass Builder' }).click();
  dialog = component.getByRole('dialog');
  await expect(dialog.getByLabel('Sidelight Panel Construction Notes')).toHaveValue('w/ 764 Adelaide glass');
});
