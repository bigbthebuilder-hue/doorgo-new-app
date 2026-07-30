import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const intakeFiles = [
  'lib/jobs/dimension-contract.ts', 'lib/jobs/glass-geometry-contract.ts', 'lib/jobs/door-line-contract.ts',
  'lib/jobs/job-intake-actions.ts', 'lib/jobs/job-intake-service.ts', 'lib/jobs/job-intake-repository.ts',
  'lib/jobs/local-job-intake-repository.ts',
];
const source = (await Promise.all(intakeFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const forbidden = [
  ['browser Supabase client', /lib\/supabase\/client/],
  ['trusted or service-role client', /trusted-read-server|service[_-]?role|createTrustedReadOnlySupabaseClient/i],
  ['hosted mutation', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['intake RPC', /\.rpc\s*\(/],
  ['production booking mutation', /createProductionBooking|production-booking-actions|productionBooking/],
  ['fulfillment mutation', /createFulfillment|updateFulfillment|fulfillment-actions/],
  ['Calendar mutation', /createCalendar|updateCalendar|deleteCalendar|CalendarApp/],
];
for (const [label, pattern] of forbidden) assert.equal(pattern.test(source), false, `J2B1 intake path must not contain ${label}`);

const geometry = await readFile('lib/jobs/glass-geometry-contract.ts', 'utf8');
for (const required of ['GLASS_CONFIGS', 'calculateGlassGeometry', 'retainCompatibleGlassFields', 'applyManualGeometryOverride', 'isGlassLineProductionReady', 'glassLineNeedsAttention', 'generateVendorCopy']) {
  assert.ok(geometry.includes(required), `J2B1 geometry contract missing ${required}`);
}
const repository = await readFile('lib/jobs/local-job-intake-repository.ts', 'utf8');
for (const required of ['expectedRevision', 'normalizeAggregateLines', 'await atomicWriteStore', 'Door lines cannot be permanently deleted']) assert.ok(repository.includes(required));
const service = await readFile('lib/jobs/job-intake-service.ts', 'utf8');
assert.ok(service.includes('assertJobsWriteAccess(access)'));
assert.ok(service.includes('assertJobsReadAccess(access)'));
console.log('Native Job Intake J2B1 hosted-write verifier: PASS');
