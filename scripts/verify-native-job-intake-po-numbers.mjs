import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const files = [
  'components/jobs/JobHeaderForm.tsx', 'lib/jobs/job-intake-actions.ts',
  'lib/jobs/job-intake-service.ts', 'lib/jobs/job-intake-contract.ts',
  'lib/jobs/job-intake-types.ts', 'lib/jobs/local-job-intake-repository.ts',
];
const source = (await Promise.all(files.map((file) => readFile(file, 'utf8')))).join('\n');
for (const [label, pattern] of [
  ['Supabase intake access', /lib\/supabase\/(?:client|server|trusted-read-server)|createBrowserClient|createServerClient/],
  ['hosted mutation', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['intake RPC', /\.rpc\s*\(/],
  ['production or fulfillment mutation', /createProductionBooking|createFulfillment|production-booking-actions/],
  ['scheduling or Calendar mutation', /CalendarApp|calendar.*(?:insert|update|delete)/i],
  ['email network call', /MailApp|sendEmail|nodemailer|smtp|resend|sendgrid/i],
]) assert.equal(pattern.test(source), false, `PO persistence must not contain ${label}`);

const form = await readFile('components/jobs/JobHeaderForm.tsx', 'utf8');
for (const required of ['Production Setup', 'PO Numbers', 'Add PO', 'Remove PO', 'pendingPoNumber', 'disabled={!canEdit}']) {
  assert.ok(form.includes(required), `PO header UI missing ${required}`);
}
assert.equal(form.includes('NEXT_PUBLIC_'), false);
console.log('Native Job Intake PO hosted-write verifier: PASS');
