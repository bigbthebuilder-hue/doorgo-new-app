import { test, expect } from '@playwright/experimental-ct-react';
import { JobEditorWorkbenchHarness } from './JobEditorWorkbenchHarness';

test('DoorGo keeps its light palette and native controls under a dark preference', async ({ mount, page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await mount(<JobEditorWorkbenchHarness saved/>);
  const colors = () => page.evaluate(() => {
    const selectors = ['html', 'body', '.app-shell', '.job-editor-surface', '#bizTrackSalesOrder', '#customer', '#door-input-pane input', '#door-input-pane select', '.job-shell-sales-order > span', '#door-input-pane label'];
    return selectors.map((selector) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error('Missing theme target: ' + selector);
      const style = getComputedStyle(element);
      return { selector, background: style.backgroundColor, color: style.color, colorScheme: style.colorScheme, border: style.borderColor };
    });
  });
  const light = await colors();
  expect(light.find((entry) => entry.selector === 'body')).toMatchObject({ background: 'rgb(255, 255, 255)', color: 'rgb(23, 23, 23)' });
  for (const entry of light) expect(entry.colorScheme).toBe('light only');
  for (const selector of ['#bizTrackSalesOrder', '#customer', '#door-input-pane input', '#door-input-pane select']) {
    expect(light.find((entry) => entry.selector === selector)?.background).toBe('rgb(255, 255, 255)');
  }
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: dark)').matches)).toBe(true);
  expect(await colors()).toEqual(light);
  await expect(page.locator('#bizTrackSalesOrder')).toHaveValue('DG-000123');
  await expect(page.locator('#customer')).toHaveValue('Fixture Customer');
  await expect(page.getByText('BizTrack Sales Order', { exact: true })).toBeVisible();
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await colors()).toEqual(light);
});
