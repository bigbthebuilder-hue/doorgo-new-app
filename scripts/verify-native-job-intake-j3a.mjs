import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const generationFiles = [
  'lib/jobs/work-order-document-contract.ts', 'lib/jobs/work-order-generation-service-contract.ts',
  'lib/jobs/work-order-generation-service.ts',
];
const source = (await Promise.all(generationFiles.map((file) => readFile(file, 'utf8')))).join('\n');
for (const [label, pattern] of [
  ['Supabase intake access', /lib\/supabase|createBrowserClient|createServerClient|trusted-read-server|service[_-]?role/i],
  ['hosted mutation', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['intake RPC', /\.rpc\s*\(/],
  ['production or fulfillment mutation', /createProductionBooking|createFulfillment|production-booking-actions/],
  ['scheduling or Calendar mutation', /CalendarApp|createCalendar|updateCalendar|deleteCalendar/],
  ['email network call', /MailApp|sendEmail|nodemailer|smtp|resend|sendgrid/i],
  ['network request', /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|node:https?|axios/i],
  ['repository write', /repository\.(?:create|update)\s*\(/],
]) assert.equal(pattern.test(source), false, `J3A generation must not contain ${label}`);

const model = await readFile('lib/jobs/work-order-document-contract.ts', 'utf8');
for (const required of [
  'generateWorkOrderDocument', 'calculateNonGlassFrameCut(outputLine)', 'withDerivedGlassGeometry(line)', 'FIRST_PAGE_WEIGHT_CAPACITY = 22',
  'CONTINUATION_PAGE_WEIGHT_CAPACITY = 26', 'formatWorkOrderPoNumbers', 'createWorkOrderPdfFilename',
  "line.lineStatus === 'Active'", 'sourceAggregateRevision', 'Manual Override',
]) assert.ok(model.includes(required), `J3A model missing ${required}`);
assert.equal(/13\s*\/\s*16|2\.75|1\.875|7\s*\/\s*32/.test(model), false, 'J3A must not duplicate geometry formulas');
assert.equal(/document\.|window\.|getBoundingClientRect|scrollHeight|offsetHeight/.test(model), false, 'pagination must not use DOM measurement');

const server = await readFile('lib/jobs/work-order-generation-service.ts', 'utf8');
assert.ok(server.startsWith("import 'server-only';"));
assert.ok(server.includes('getCurrentDoorGoAccess()'));
assert.ok(server.includes('createJobIntakeRepository()'));
const service = await readFile('lib/jobs/work-order-generation-service-contract.ts', 'utf8');
assert.ok(service.includes("canReadJobs(getPermissionAccess(access, 'jobs'))"));
assert.ok(service.includes('repository.findById(internalJobId)'));
console.log('Native Job Intake J3A hosted-write and architecture verifier: PASS');
