import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const jobId = '11111111-1111-4111-8111-111111111111';
const lineId = '22222222-2222-4222-8222-222222222222';
const userId = '33333333-3333-4333-8333-333333333333';
const timestamp = '2026-11-10T12:00:00Z';
const user = { id: userId, aud: 'authenticated', email: 'label-fixture@example.invalid' };
const jobPath = '/jobs/' + jobId + '/edit';
let saved = {
  job: {
    internal_job_id: jobId, door_go_reference: 'DG-000001', biztrack_sales_order: '001234',
    customer: 'Synthetic Label Customer', site_address: '123 Fixture Street', salesperson: 'Test Operator',
    lifecycle_stage: 'Draft', po_numbers: [], revision: 1, origin: 'native',
    created_at: timestamp, updated_at: timestamp, created_by_user_id: userId, updated_by_user_id: userId,
  },
  lines: [{
    line_id: lineId, line_index: 1, line_status: 'Active', qty: 2, mode: 'Interior', door_type: 'Madison H/C',
    config: 'D', width: "2'6\"", height: "6'8\"", custom_slab: 'No', hand: 'LH', prep: 'YES',
    jamb_width: '4-9/16"', jamb_type: 'Primed', hinge_type: 'REG', notes: 'Synthetic line note',
    glass_calc: null, glass_warnings: [], glass_blockers: [], glass_units: [], panel_sidelights: [],
    created_at: timestamp, updated_at: timestamp, created_by_user_id: userId, updated_by_user_id: userId,
  }],
};
let writes = 0;
const unexpected = [];

// A loopback-only stand-in for Supabase. Next routes, server actions, auth clients and the job adapter are real.
const api = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  const reply = (body, status = 200) => response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
  if (path === '/auth/v1/user') return reply(user);
  if (path === '/rest/v1/dg_user_profiles') {
    const profile = { user_id: userId, display_name: 'Test Operator', active: true, is_manager: false, company_location: null, must_change_password: false };
    return reply(request.headers.accept?.includes('object+json') ? profile : [profile]);
  }
  if (path === '/rest/v1/dg_user_permissions') return reply([
    { permission_key: 'jobs', access_level: 'use' },
    { permission_key: 'calendar', access_level: 'use' },
  ]);
  if (path === '/rest/v1/dg_fulfillment_order_portions' && request.method === 'GET') return reply([]);
  if (path === '/rest/v1/rpc/dg_get_native_job') return reply(saved);
  if (path === '/rest/v1/rpc/dg_list_native_jobs') return reply({ items: [], page: { limit: 100, has_more: false } });
  if (path === '/rest/v1/rpc/dg_update_native_job' && request.method === 'POST') {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const update = JSON.parse(Buffer.concat(chunks).toString());
    if (update.p_internal_job_id !== jobId || update.p_expected_revision !== saved.job.revision) return reply({ message: 'native_job.stale_revision' }, 409);
    saved = {
      job: { ...saved.job, ...update.p_header, revision: saved.job.revision + 1 },
      lines: update.p_lines.map((line) => ({ ...saved.lines.find((previous) => previous.line_id === line.line_id), ...line })),
    };
    writes++;
    return reply(saved);
  }
  unexpected.push(request.method + ' ' + path);
  return reply({ message: 'Unrecognized fixture request' }, 404);
});

api.listen(0, '127.0.0.1');
await once(api, 'listening');
const backend = 'http://127.0.0.1:' + api.address().port;
const appPort = 3196;
const appUrl = 'http://127.0.0.1:' + appPort;
const app = spawn(process.execPath, [resolve('node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', String(appPort)], {
  env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP,
    NODE_ENV: 'development', NEXT_TELEMETRY_DISABLED: '1',
    NEXT_PUBLIC_SUPABASE_URL: backend, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'synthetic-key',
    SUPABASE_URL: backend, SUPABASE_SERVICE_ROLE_KEY: 'synthetic-key',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let appOutput = '';
for (const stream of [app.stdout, app.stderr]) stream.on('data', (chunk) => { appOutput = (appOutput + chunk).slice(-12000); });
let browser;
try {
  const deadline = Date.now() + 60000;
  while (!appOutput.includes('Ready in')) {
    assert.equal(app.exitCode, null, appOutput);
    assert.ok(Date.now() < deadline, appOutput);
    await delay(200);
  }
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === appUrl ? route.continue() : route.abort());
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: userId, exp: expires }) + '.c3ludGhldGlj';
  await context.addCookies([{ name: 'sb-127-auth-token', value: 'base64-' + encode({
    access_token: token, refresh_token: 'synthetic', token_type: 'bearer', expires_at: expires, expires_in: 3600, user,
  }), url: appUrl }]);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const listCode = () => page.locator('#job-lines-pane').getByRole('textbox', { name: 'Product Code' }).first();
  const listDoorId = () => page.locator('#job-lines-pane').getByRole('textbox', { name: 'Door ID', exact: true }).first();
  const intakeDoorId = () => page.locator('#door-input-pane').getByRole('textbox', { name: 'Door ID', exact: true });
  const intakeCode = () => page.locator('#door-input-pane').getByRole('textbox', { name: 'Product Code' });
  const lifecycle = () => page.getByRole('combobox', { name: 'Job lifecycle', exact: true });
  const reopen = async () => {
    const result = await page.goto(appUrl + jobPath, { timeout: 90000 });
    assert.equal(result?.status(), 200);
    assert.equal(page.url(), appUrl + jobPath);
    await listCode().waitFor();
  };
  const save = async (revision, code, doorId) => {
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByText('Rev ' + revision, { exact: true }).waitFor();
    assert.equal(saved.lines[0].glass_calc?.labelProductCode, code);
    assert.equal(saved.lines[0].glass_calc?.labelDoorId ?? '', doorId);
    await reopen();
    assert.equal(await listCode().inputValue(), code);
    assert.equal(await listDoorId().inputValue(), doorId);
  };
  const openLabels = async () => {
    await page.getByText('Documents ▾', { exact: true }).click();
    await page.getByRole('button', { name: 'Print', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Print Door Labels', exact: true }).click();
    await page.getByRole('dialog', { name: 'Door Labels' }).waitFor();
    return page.frameLocator('iframe[title="4 × 6 door label preview"]');
  };

  await reopen();
  await page.locator('#job-lines-pane').getByRole('button', { name: 'Edit', exact: true }).first().click();
  const draftCode = ' 00-Ab_9 ';
  await intakeCode().fill(draftCode);
  assert.equal(await listCode().inputValue(), draftCode);
  await intakeDoorId().fill('Draft 01');
  assert.equal(await listDoorId().inputValue(), 'Draft 01');
  await save(2, draftCode, 'Draft 01');
  assert.equal(saved.job.lifecycle_stage, 'Draft');

  await lifecycle().selectOption('Confirmed Job');
  await save(3, draftCode, 'Draft 01');
  const confirmedCode = ' 007x-Y ';
  const beforeConfirmedEdit = structuredClone(saved.lines[0]);
  await listCode().fill(confirmedCode);
  await listDoorId().fill('Confirmed 02');
  await save(4, confirmedCode, 'Confirmed 02');
  assert.equal(await lifecycle().inputValue(), 'Confirmed Job');
  assert.deepEqual({ ...saved.lines[0], glass_calc: beforeConfirmedEdit.glass_calc }, beforeConfirmedEdit);
  await page.locator('#job-lines-pane').getByRole('button', { name: 'Edit', exact: true }).first().click();
  assert.equal(await intakeCode().inputValue(), confirmedCode);
  assert.equal(await intakeDoorId().inputValue(), 'Confirmed 02');
  await page.getByRole('button', { name: 'Cancel Edit' }).click();

  const beforePrint = structuredClone(saved);
  const writesBeforePrint = writes;
  const preview = await openLabels();
  assert.equal(await preview.locator('footer div').first().textContent(), confirmedCode);
  assert.equal(await preview.locator('h1').first().textContent(), 'SO# 001234');
  assert.equal(await preview.locator('h2').first().textContent(), 'Synthetic Label Customer');
  assert.equal(await preview.getByText('Door ID Confirmed 02', { exact: true }).count(), 2);
  await page.getByText('Optional Door ID overrides', { exact: true }).click();
  await page.getByRole('textbox', { name: 'Label 2', exact: true }).fill('Batch 99');
  await preview.getByText('Batch 99', { exact: false }).waitFor();
  assert.equal(await preview.getByText('Door ID Confirmed 02', { exact: true }).count(), 1);
  await preview.locator('body').evaluate(() => { window.print = () => { document.body.dataset.printCount = String(Number(document.body.dataset.printCount ?? 0) + 1); }; });
  await page.getByRole('button', { name: 'Print 2 labels', exact: true }).click();
  await preview.locator('body[data-print-count="1"]').waitFor();
  await page.getByRole('button', { name: 'Print 2 labels', exact: true }).click();
  await preview.locator('body[data-print-count="2"]').waitFor();
  assert.equal(writes, writesBeforePrint);
  assert.deepEqual(saved, beforePrint);
  await reopen();
  const reopenedPreview = await openLabels();
  assert.equal(await reopenedPreview.locator('footer div').first().textContent(), confirmedCode);
  assert.equal(await reopenedPreview.getByText('Door ID Confirmed 02', { exact: true }).count(), 2);
  await page.getByText('Optional Door ID overrides', { exact: true }).click();
  assert.equal(await page.getByRole('textbox', { name: 'Label 2', exact: true }).inputValue(), '');
  assert.equal(writes, writesBeforePrint);
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await listDoorId().clear();
  await save(5, confirmedCode, '');
  assert.deepEqual(unexpected, []);
  console.log('Door label save/reopen passed: Draft and Confirmed Door ID and Product Code round trips, unchanged specs, and read-only printing and reprinting with batch-only overrides.');
} catch (error) {
  console.error(appOutput);
  throw error;
} finally {
  await browser?.close();
  app.kill();
  api.closeAllConnections();
  await new Promise((done) => api.close(done));
}
