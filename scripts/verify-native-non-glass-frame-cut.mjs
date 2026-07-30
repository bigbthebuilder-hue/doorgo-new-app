import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const domainFiles = ['lib/jobs/non-glass-frame-cut-contract.ts', 'lib/jobs/door-line-contract.ts'];
const source = (await Promise.all(domainFiles.map((file) => readFile(file, 'utf8')))).join('\n');
for (const [label, pattern] of [
  ['Supabase access', /lib\/supabase|createBrowserClient|createServerClient|trusted-read-server/],
  ['hosted mutation', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['RPC', /\.rpc\s*\(/],
  ['production or fulfillment mutation', /createProductionBooking|createFulfillment|production-booking-actions/],
  ['scheduling or Calendar mutation', /CalendarApp|createCalendar|updateCalendar|deleteCalendar/],
  ['email network call', /MailApp|sendEmail|nodemailer|smtp|resend|sendgrid/i],
  ['clock access', /new Date\s*\(|Date\.now\s*\(/],
  ['random identity', /randomUUID|Math\.random/],
]) assert.equal(pattern.test(source), false, `shared calculator path must not contain ${label}`);

const calculator = await readFile('lib/jobs/non-glass-frame-cut-contract.ts', 'utf8');
for (const required of ['calculateNonGlassFrameCut', "'Complete' | 'Incomplete' | 'Blocked' | 'Not Applicable'", 'formatShopDimension', 'finishedOpeningWidth: null', 'finishedOpeningHeight']) assert.ok(calculator.includes(required));
const j2 = await readFile('lib/jobs/door-line-contract.ts', 'utf8');
assert.ok(j2.includes('return calculateNonGlassFrameCut(line);'), 'J2 helper must call the shared calculator');

for (const file of ['components/jobs/DoorLineWorkspace.tsx', 'lib/jobs/job-intake-actions.ts', 'lib/jobs/local-job-intake-repository.ts']) {
  const value = await readFile(file, 'utf8');
  assert.equal(/13\s*\/\s*16|2\.75|1\.875|7\s*\/\s*32/.test(value), false, `${file} must not duplicate non-glass frame formulas`);
}
console.log('Native non-glass frame/cut verifier: PASS');
