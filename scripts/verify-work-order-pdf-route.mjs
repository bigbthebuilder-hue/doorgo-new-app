import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual route export over HTTP with a synthetic saved repository.
// Only the access/repository boundary is substituted; no hosted reads or writes.
const require = createRequire(import.meta.url);
const compiled = path.resolve(process.argv[2] ?? '.tmp-stabilization');
const fromBuild = (file) => require(path.join(compiled, file));
const { defaultDoorLine, normalizeDoorLineInput } = fromBuild('jobs/door-line-contract.js');
const { resolveCurrentDoorGoAccess } = fromBuild('auth/access.js');
const { generateSavedWorkOrderWithAccess } = fromBuild('jobs/work-order-generation-service-contract.js');
const { generateRevisionPinnedSavedWorkOrderPdfWithAccess } = fromBuild('jobs/work-order-pdf-service-contract.js');
const { buildWorkOrderPdfUrl } = fromBuild('jobs/work-order-preview-contract.js');
const access = resolveCurrentDoorGoAccess({ user: { id: 'fixture' }, profile: { user_id: 'fixture', display_name: 'Fixture', active: true, is_manager: false, must_change_password: false, company_location: null }, permissionRows: [{ permission_key: 'jobs', access_level: 'view' }] });
const normalized = normalizeDoorLineInput({ ...defaultDoorLine('Exterior'), doorType: 'NON-PRODUCTION ROUTE TEST' });
assert.ok(normalized.ok);
const metadata = { createdAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z', createdByUserId: 'fixture', updatedByUserId: 'fixture' };
const saved = { ...metadata, internalJobId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', doorGoReference: 'DG-000123', bizTrackSalesOrder: null, customer: 'Route fixture', siteAddress: null, phone: null, email: null, salesperson: null, lifecycleStage: 'Draft', notes: 'NON-PRODUCTION TEST', hingeColor: 'C15', shopHours: 1, shopHoursSource: 'Manual', poNumbers: [], fulfillmentPlan: null, deliveryDate: null, customerPickupDate: null, shopDate: null, shopDateSource: null, revision: 4, lines: [{ ...normalized.value, ...metadata, lineId: '11111111-1111-4111-8111-111111111111', lineStatus: 'Active', lineIndex: 1 }] };
const repository = { findById: async (id) => id === saved.internalJobId ? structuredClone(saved) : null };
let warning = false;
const generate = async (id) => {
  const document = await generateSavedWorkOrderWithAccess(access, id, repository);
  if (warning) document.rowGroups[0].primaryRow.status = 'Warning';
  return document;
};
const routePath = 'app/jobs/[internalJobId]/work-order/pdf/route.ts';
const source = readFileSync(routePath, 'utf8');
const compiledRoute = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const route = {};
vm.runInNewContext(compiledRoute, { exports: route, Request, Response, URL, Uint8Array, require: (specifier) => {
  if (specifier === '@/lib/jobs/work-order-generation-service') return { generateCurrentSavedWorkOrder: generate };
  if (specifier.startsWith('@/lib/jobs/')) return fromBuild('jobs/' + specifier.slice('@/lib/jobs/'.length) + '.js');
  throw new Error('Unexpected route dependency: ' + specifier);
} }, { filename: routePath });
assert.equal(typeof route.GET, 'function');
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://127.0.0.1');
    const match = /^\/jobs\/([^/]+)\/work-order\/pdf$/.exec(url.pathname);
    if (!match) { response.writeHead(404); response.end(); return; }
    const result = await route.GET(new Request(url), { params: Promise.resolve({ internalJobId: decodeURIComponent(match[1]) }) });
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch (error) { response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
try {
  const origin = `http://127.0.0.1:${server.address().port}`;
  const url = (mode, revision = 4, acknowledged = false) => origin + buildWorkOrderPdfUrl({ internalJobId: saved.internalJobId, sourceRevision: revision, mode, acknowledged });
  const preview = await fetch(url('inline'));
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type'), /application\/pdf/);
  assert.match(preview.headers.get('content-disposition'), /^inline/);
  const bytes = Buffer.from(await preview.arrayBuffer());
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const download = await fetch(url('attachment'));
  assert.equal(download.status, 200);
  assert.match(download.headers.get('content-disposition'), /^attachment/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  const send = await generateRevisionPinnedSavedWorkOrderPdfWithAccess(access, saved.internalJobId, 4, repository);
  assert.deepEqual(Buffer.from(send.bytes), bytes, 'Preview, Download, and Send share saved revision bytes');
  assert.equal((await fetch(url('inline', 3))).status, 409);
  assert.equal((await fetch(url('inline', 0))).status, 400);
  warning = true;
  assert.equal((await fetch(url('inline'))).status, 403);
  const acknowledged = await fetch(url('inline', 4, true));
  assert.equal(acknowledged.status, 200);
  assert.equal(Buffer.from(await acknowledged.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
  console.log(`Actual PDF route handler over local HTTP: 200 application/pdf, ${bytes.length} bytes; preview/download/send identical; revision and acknowledgement checks PASS`);
  if (process.argv[3]) {
    const live = await fetch(process.argv[3] + buildWorkOrderPdfUrl({ internalJobId: saved.internalJobId, sourceRevision: 0, mode: 'inline' }));
    assert.equal(live.status, 400, 'Running Next.js must reach the registered route, not the 404 page');
    assert.match(await live.text(), /valid saved revision/);
    console.log('Running Next.js route registration: PASS (handler returned expected 400)');
  }
} finally {
  await new Promise(resolve => server.close(resolve));
}
