import { expect, test } from '@playwright/experimental-ct-react';
import { DoorLabelDialog } from '../../components/jobs/DoorLabelDialog';
import { PDFDocument } from 'pdf-lib';
import { runInNewContext } from 'node:vm';
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

test('required data blocks printing and long notes use explicit continuation labels', async ({ mount, page }) => {
  const missing = await mount(<DoorLabelDialog job={{ ...job, bizTrackSalesOrder: null }} onClose={() => {}}/>);
  await expect(page.getByRole('status')).toContainText('sales order number and customer name');
  await expect(page.getByRole('button', { name: 'Print labels' })).toBeDisabled();
  await missing.unmount();
  await mount(<DoorLabelDialog job={{ ...job, lines: [{ ...line, notes: 'Long note\n'.repeat(100) }] }} onClose={() => {}}/>);
  await expect(page.getByRole('status')).toContainText('continues onto additional labels');
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Print [0-9]+ labels$/ })).toBeEnabled();
  await page.getByRole('checkbox', { name: 'Omit line notes from this batch' }).check();
  await expect(page.getByRole('button', { name: 'Print 2 labels' })).toBeEnabled();
});


test('Chromium prints bordered labels without backgrounds, clipping or extra pages', async ({ page }) => {
  const preview = prepareDoorLabels(job, {
    'door-1': { selected: true, quantity: '2', doorIds: [] },
    'door-2': { selected: true, quantity: '1', doorIds: [] },
  }, false);
  expect(preview.html).toBeTruthy();
  await page.setContent(preview.html!);
  await page.emulateMedia({ media: 'print' });
  expect(await page.locator('h1').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeCloseTo(38 * 96 / 72, 2);
  expect(await page.locator('h2').first().evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThan(28 * 96 / 72);
  for (const label of await page.locator('article').all()) {
    expect(await label.evaluate(element => {
      const border = getComputedStyle(element.querySelector('header')!);
      return {
        width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
        overflow: element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth,
        borderStyle: border.borderTopStyle, borderColor: border.borderTopColor,
      };
    })).toEqual({ width: 384, height: 576, overflow: false, borderStyle: 'solid', borderColor: 'rgb(0, 0, 0)' });
  }
  for (const footer of await page.locator('footer').all()) {
    expect(await footer.evaluate(element => {
      const page = element.closest('article')!.getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      const barcode = element.querySelector('svg')?.getBoundingClientRect();
      return bounds.bottom <= page.bottom - 14 && bounds.top > page.top + page.height / 2 &&
        (!barcode || (barcode.left >= page.left + 14 && barcode.right <= page.right - 14));
    })).toBe(true);
  }
  const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: false }));
  expect(pdf.getPageCount()).toBe(3);
  for (const label of pdf.getPages()) expect(label.getSize()).toEqual({ width: 288, height: 432 });
});

test('large label headings wrap with ordinary notes inside one portrait label', async ({ page }) => {
  const preview = prepareDoorLabels({
    ...job, customer: 'North Shore Heritage Millwork & Renovations Ltd.',
    lines: [{ ...line, qty: 1, notes: 'Protect the finished face.\nKeep the hardware pack with the unit.' }],
  }, { 'door-1': { selected: true, quantity: '1', doorIds: ['North 02'] } }, false);
  await page.setContent(preview.html!);
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('article')).toHaveCount(1);
  const label = page.locator('article');
  expect(await label.evaluate(element => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
  await expect(label).toContainText('Door ID North 02');
  await expect(label).toContainText('Keep the hardware pack with the unit.');
  const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: false }));
  expect(pdf.getPageCount()).toBe(1);
  expect(pdf.getPages()[0].getSize()).toEqual({ width: 288, height: 432 });
});


test('labels include saved descriptions and optional specifications without changing barcode values', async ({ page }) => {
  const detailed = { ...line, mode: 'Exterior' as const, doorType: 'Custom fir panel — manually entered <door>', material: 'Wood', sill: 'DARK' };
  const preview = prepareDoorLabels({ ...job, lines: [detailed] }, { 'door-1': { selected: true, quantity: '1', doorIds: [] } }, false);
  await page.setContent(preview.html!);
  await expect(page.locator('body')).toHaveAttribute('data-labels-ready', 'true');
  await expect(page.locator('article')).toHaveCount(1);
  for (const value of ['Door type Exterior', 'Description ' + detailed.doorType, 'Material Wood', 'Sill DARK', 'Size', 'Swing LH', 'Jamb width', 'Configuration D']) {
    await expect(page.locator('article').first()).toContainText(value);
  }
  expect(await page.locator('footer div').first().textContent()).toBe(line.productCode);
  expect(await page.locator('.door-id').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(22 * 96 / 72);
  expect(await page.locator('.description').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThan(20 * 96 / 72);
});

for (const size of ['short', 'typical', 'unusually long'] as const) {
  test('portrait print preserves all ' + size + ' text and uses only intentional continuation pages', async ({ page }) => {
    const customer = size === 'short' ? 'Smith' : size === 'typical' ? 'North Shore Heritage Millwork & Renovations Ltd.' : 'Customer🙂NoBreak'.repeat(60);
    const doorId = size === 'short' ? 'A1' : size === 'typical' ? 'Second floor north bedroom' : 'DoorID-NoBreak'.repeat(90);
    const description = size === 'short' ? 'Flush' : size === 'typical' ? 'Custom three-panel fir door with matching jamb' : 'Custom door description & details <do not omit> '.repeat(90);
    const notes = size === 'unusually long' ? 'Keep all instructions.\n'.repeat(60) : '';
    const preview = prepareDoorLabels({ ...job, customer, lines: [{ ...line, doorType: description, notes, material: null, sill: null }] }, { 'door-1': { selected: true, quantity: '1', doorIds: [doorId] } }, false);
    await page.setContent(preview.html!);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('body')).toHaveAttribute('data-labels-ready', 'true');
    expect((await page.locator('h2').allTextContents()).join('')).toBe(customer);
    expect((await page.locator('.door-id span').allTextContents()).join('')).toBe(doorId);
    expect((await page.locator('.description span').allTextContents()).join('')).toBe(description);
    expect((await page.locator('.notes span').allTextContents()).join('')).toBe(notes);
    const count = await page.locator('article').count();
    if (size === 'short') expect(count).toBe(1);
    if (size === 'unusually long') {
      expect(count).toBeGreaterThan(1);
      await expect(page.locator('.page-reference').last()).toContainText('Continued');
    }
    for (const article of await page.locator('article').all()) {
      expect(await article.evaluate(el => {
        const section = el.querySelector('section')!;
        return section.scrollHeight <= section.clientHeight + 1 && section.scrollWidth <= section.clientWidth + 1;
      })).toBe(true);
      await expect(article.locator('svg')).toHaveCount(1);
      expect(await article.locator('svg').evaluate(el => Number(el.getAttribute('viewBox')!.split(' ')[2]) * 2 / 203 * 96)).toBeCloseTo(await article.locator('svg').evaluate(el => el.getBoundingClientRect().width), 1);
    }
    const pdf = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: false }));
    expect(pdf.getPageCount()).toBe(count);
    for (const sheet of pdf.getPages()) expect(sheet.getSize()).toEqual({ width: 288, height: 432 });
  });
}


test('standalone print script has no bundler dependencies and optional data is escaped', () => {
  const source = { ...job, lines: [{ ...line, doorType: 'Custom <script>alert(1)</script> & fir', material: 'Wood', sill: 'DARK' }] };
  const before = JSON.stringify(source);
  const result = prepareDoorLabels(source, { 'door-1': { selected: true, quantity: '2', doorIds: [] } }, false);
  expect(result.count).toBe(2);
  expect(result.html).toContain('Custom &lt;script&gt;alert(1)&lt;/script&gt; &amp; fir');
  expect(result.html).toContain('article:last-of-type{break-after:auto}');
  expect(result.html).toContain('Door ID</strong> <span>Saved 01');
  expect(result.html).toContain('Door ID</strong> <span>North');
  expect(result.html).toContain('preserveAspectRatio="none"');
  expect(result.html).toContain('Material</strong> <span>Wood');
  expect(result.html).toContain('Sill</strong> <span>DARK');
  const document = { querySelectorAll: () => [], body: { dataset: {} as Record<string, string> } };
  runInNewContext(result.html!.match(/<script>([\s\S]*?)<\/script>/)![1], { document });
  expect(document.body.dataset.labelsReady).toBe('true');
  expect(JSON.stringify(source)).toBe(before);
});
