import { expect, test } from '@playwright/experimental-ct-react';
import { DoorLabelDialog } from '../../components/jobs/DoorLabelDialog';
import { PDFDocument } from 'pdf-lib';
import { code128, prepareDoorLabels } from '../../lib/jobs/door-label-contract';
import type { NativeDoorLine, NativeJobAggregate } from '../../lib/jobs/job-intake-types';

const line = {
  lineId: 'door-1', lineIndex: 1, lineStatus: 'Active', mode: 'Interior', config: 'D',
  width: "3'0\"", height: "6'8\"", hand: 'LH', jambWidth: '4-9/16"',
  qty: 2, individualDoorIds: ['', 'North'], doorId: 'Saved 01', notes: 'Handle with care', productCode: ' 00-Ab_9 ',
} as NativeDoorLine;
const job = {
  customer: 'Example & Sons <North>', bizTrackSalesOrder: '000123', siteAddress: 'Example Street',
  lines: [line, { ...line, lineId: 'door-2', lineIndex: 2, qty: 1, productCode: null }, { ...line, lineId: 'archived', lineStatus: 'Archived' }],
} as NativeJobAggregate;

test('Code 128 starts with the correct symbol, preserves spaces and leading zeros, and rejects unsupported input', () => {
  const alpha = code128(' A ');
  expect(alpha?.modules).toBe(88);
  expect(alpha?.bars.slice(0, 9)).toEqual([
    { x: 10, width: 2 }, { x: 13, width: 1 }, { x: 16, width: 1 },
    { x: 21, width: 2 }, { x: 24, width: 2 }, { x: 28, width: 2 },
    { x: 32, width: 1 }, { x: 34, width: 1 }, { x: 38, width: 2 },
  ]);
  expect(code128('000123')).not.toEqual(code128('0123'));
  expect(code128(' A ')).not.toEqual(code128('A'));
  expect(code128('café')).toBeNull();
  expect(code128('A'.repeat(100))).toBeNull();
});

test('preview defaults to door quantities and prints selected copies and individual IDs', async ({ mount, page }) => {
  await mount(<DoorLabelDialog job={job} onClose={() => {}}/>);
  const preview = page.frameLocator('iframe[title="4 × 6 door label preview"]');
  await expect(preview.locator('article')).toHaveCount(3);
  await expect(preview.locator('h1').first()).toHaveText('SO# 000123');
  await expect(preview.locator('h2').first()).toHaveText(job.customer!);
  await expect(preview.locator('svg')).toHaveCount(2);
  expect(await preview.locator('footer div').first().textContent()).toBe(line.productCode);
  const print = page.getByRole('button', { name: 'Print 3 labels' });
  await expect(print).toBeEnabled();
  await preview.locator('body').evaluate(() => {
    window.print = () => { document.body.dataset.printed = 'yes'; };
  });
  await print.click();
  await print.click();
  await expect(preview.locator('body')).toHaveAttribute('data-printed', 'yes');
  await page.getByRole('checkbox', { name: 'Include' }).last().uncheck();
  await expect(preview.locator('article')).toHaveCount(2);
  await expect(preview.locator('article').first()).toContainText('Door ID Saved 01');
  await expect(preview.locator('article').last()).toContainText('Door ID North');
  await page.getByText('Saved individual Door IDs', { exact: true }).first().click();
  await expect(page.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Print 2 labels' })).toBeEnabled();
});

test('required data and label overflow block printing', async ({ mount, page }) => {
  const missing = await mount(<DoorLabelDialog job={{ ...job, bizTrackSalesOrder: null }} onClose={() => {}}/>);
  await expect(page.getByRole('status')).toContainText('sales order number and customer name');
  await expect(page.getByRole('button', { name: 'Print labels' })).toBeDisabled();
  await missing.unmount();
  await mount(<DoorLabelDialog job={{ ...job, lines: [{ ...line, notes: 'Long note\n'.repeat(100) }] }} onClose={() => {}}/>);
  await expect(page.getByRole('alert')).toContainText('exceeds the available space');
  const print = page.getByRole('button', { name: 'Print 2 labels' });
  await expect(print).toBeDisabled();
  await page.getByRole('checkbox', { name: 'Omit line notes from this batch' }).check();
  await expect(print).toBeEnabled();
});


test('Chromium prints one 4 × 6 page per copy', async ({ page }) => {
  const preview = prepareDoorLabels(job, {
    'door-1': { selected: true, quantity: '2', doorIds: [] },
    'door-2': { selected: true, quantity: '1', doorIds: [] },
  }, false);
  expect(preview.html).toBeTruthy();
  await page.setContent(preview.html!);
  const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true }));
  expect(pdf.getPageCount()).toBe(3);
  for (const label of pdf.getPages()) expect(label.getSize()).toEqual({ width: 288, height: 432 });
});
