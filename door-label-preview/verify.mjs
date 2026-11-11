import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';

const [target, pdfDirectory] = process.argv.slice(2);
if (!target || !pdfDirectory) throw new Error('Provide the static directory or preview URL and an existing PDF output directory.');
const server = target.startsWith('https://') ? null : createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const type = path === '/' ? 'text/html' : path.endsWith('.js') ? 'text/javascript' : 'text/css';
  if (path !== '/' && !/^\/assets\/[\w-]+\.(js|css)$/.test(path)) {
    response.writeHead(404).end();
    return;
  }
  try {
    const content = await readFile(resolve(target, path === '/' ? 'index.html' : path.slice(1)));
    response.writeHead(200, { 'Content-Type': type }).end(content);
  } catch {
    response.writeHead(404).end();
  }
});
let browser;
try {
  if (server) await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  const url = server ? 'http://127.0.0.1:' + server.address().port : target;
  browser = await chromium.launch(process.env.DOOR_LABEL_BROWSER ? { executablePath: process.env.DOOR_LABEL_BROWSER } : {});
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const requests = [];
  const errors = [];
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on('request', (request) => requests.push(request.url()));
  page.on('pageerror', (error) => errors.push(error.message));
  const response = await page.goto(url);
  assert.equal(response.status(), 200);
  await page.getByRole('button', { name: 'Standard job' }).click();
  const frame = page.frameLocator('iframe[title="4 × 6 door label preview"]');
  const labels = frame.locator('article');
  await labels.nth(2).waitFor();
  assert.equal(await labels.count(), 3);
  assert.equal(await labels.first().locator('h2').textContent(), 'Cedar Ridge Builders');
  assert.match(await labels.first().textContent(), /Door ID D-101/);
  assert.deepEqual(await labels.locator('footer div').allTextContents(), [' 00-Ab_9/2+ ', ' 00-Ab_9/2+ ', '00004218']);
  assert.equal(await labels.locator('svg[aria-label="Code 128 barcode"]').count(), 3);

  await page.getByText('Optional Door ID overrides', { exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Label 2' }).fill('D-101B');
  await labels.nth(1).getByText('D-101B', { exact: false }).waitFor();
  assert.match(await labels.first().textContent(), /Door ID D-101Size/);
  const print = page.getByRole('button', { name: 'Print 3 labels' });
  await print.click({ trial: true });
  await frame.locator('body').evaluate(() => {
    window.print = () => { document.body.dataset.printInvoked = 'true'; };
  });
  await print.click();
  assert.equal(await frame.locator('body').getAttribute('data-print-invoked'), 'true');
  const dimensions = await labels.first().evaluate((label) => {
    const { width, height } = label.getBoundingClientRect();
    return [width, height];
  });
  assert.deepEqual(dimensions, [384, 576]);
  const html = await page.locator('iframe').getAttribute('srcdoc');
  const printPage = await context.newPage();
  await printPage.setContent(html);
  for (const [name, preferCSSPageSize, size] of [
    ['labels-4x6', true, { width: 288, height: 432 }],
    ['labels-letter', false, { width: 612, height: 792 }],
  ]) {
    const pdf = await printPage.pdf({ format: 'Letter', preferCSSPageSize, scale: 1 });
    const document = await PDFDocument.load(pdf);
    assert.equal(document.getPageCount(), 3);
    for (const sheet of document.getPages()) assert.deepEqual(sheet.getSize(), size);
    await writeFile(resolve(pdfDirectory, name + '.pdf'), pdf);
  }
  await printPage.close();

  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Long customer name and notes' }).click();
  const heading = labels.first().locator('h2');
  await heading.waitFor();
  assert.match(await heading.textContent(), /North Shore Heritage Millwork/);
  assert.ok(await heading.evaluate((element) => element.offsetHeight > parseFloat(getComputedStyle(element).lineHeight)));
  assert.match(await labels.first().textContent(), /Keep the hardware pack/);
  await page.getByRole('button', { name: 'Print 1 label' }).click({ trial: true });
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Notes that exceed the label' }).click();
  await page.getByRole('alert').waitFor();
  const single = page.getByRole('button', { name: 'Print 1 label' });
  assert.equal(await single.isDisabled(), true);
  await page.getByRole('checkbox', { name: 'Omit line notes from this batch' }).check();
  await single.click({ trial: true });
  assert.doesNotMatch(await labels.first().textContent(), /covered staging area/);

  assert.deepEqual(errors, []);
  for (const request of requests) {
    const parsed = new URL(request);
    assert.equal(parsed.origin, new URL(url).origin);
    assert.match(parsed.pathname, /^\/(?:assets\/[\w-]+\.(?:js|css))?$/);
  }
  assert.match(await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content'), /connect-src 'none'/);
  assert.equal((await context.request.get(new URL('/api/jobs', url).href)).status(), 404);
  console.log('Verified three scenarios, exact product code text, print action, 4 × 6 and Letter PDFs, and static-only requests.');
} finally {
  await browser?.close();
  server?.close();
}
