import { expect, test } from '@playwright/experimental-ct-react';
import { ImportedGlassBuilderHarness } from './imported-glass-builder-harness';

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

  await dialog.getByRole('button', { name: 'Use Configuration' }).click();
  await component.getByRole('button', { name: 'Update Door' }).click();
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
  await component.getByRole('dialog').getByRole('button', { name: '− Remove Transom' }).click();
  await expect(component.getByRole('dialog').getByText('Status: Complete', { exact: false })).toBeVisible();
  await component.getByRole('dialog').getByRole('button', { name: '+ Add Transom Above' }).click();
  await expect(component.getByRole('dialog').getByText('Status: Glass Detail Needed', { exact: false })).toBeVisible();
  await component.getByRole('dialog').getByLabel('Transom Glass Type').selectOption('CLEAR');
  await component.getByRole('dialog').getByLabel('RO Height (inches)').fill('98');
  await expect(component.getByRole('dialog').getByText('Status: Complete', { exact: false })).toBeVisible();
  expect(consoleErrors.filter((message) => /same key|unique "key" prop|duplicate key|nan|infinity/i.test(message))).toEqual([]);
});
