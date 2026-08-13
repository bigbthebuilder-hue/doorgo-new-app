import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const persistencePath = [
  'lib/jobs/job-intake-actions.ts', 'lib/jobs/job-intake-service.ts',
  'lib/jobs/job-intake-repository.ts', 'lib/jobs/local-job-intake-repository.ts',
  'lib/jobs/door-line-contract.ts',
];
const source = (await Promise.all(persistencePath.map((file) => readFile(file, 'utf8')))).join('\n');
const forbidden = [
  ['browser Supabase client', /lib\/supabase\/client/],
  ['trusted service-role client', /trusted-read-server|createTrustedReadOnlySupabaseClient/],
  ['hosted insert/update/upsert/delete', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['intake RPC', /\.rpc\s*\(/],
  ['production booking call', /createProductionBooking|production-booking-actions|productionBooking/],
  ['Calendar mutation', /createCalendar|updateCalendar|deleteCalendar|CalendarApp/],
];
for (const [label, pattern] of forbidden) assert.equal(pattern.test(source), false, `J2A persistence path must not contain ${label}`);

const repository = await readFile('lib/jobs/local-job-intake-repository.ts', 'utf8');
for (const required of ['schemaVersion: 2', 'lines: Array.isArray(job.lines)', 'normalizeAggregateLines', 'expectedRevision', 'await atomicWriteStore', 'Door lines cannot be permanently deleted']) {
  assert.ok(repository.includes(required), `J2A aggregate contract missing: ${required}`);
}
const actions = await readFile('lib/jobs/job-intake-actions.ts', 'utf8');
const service = await readFile('lib/jobs/job-intake-service.ts', 'utf8');
const workspace = await readFile('components/jobs/DoorLineWorkspace.tsx', 'utf8');
const form = await readFile('components/jobs/JobHeaderForm.tsx', 'utf8');
const doorLineContractTests = await readFile('lib/jobs/door-line-contract.test.ts', 'utf8');
assert.ok(actions.includes('actionWriteCheck(access)'));
assert.ok(actions.includes('assertConfirmedJobActiveLineInvariant'));
assert.ok(service.includes('assertJobsWriteAccess(access)'));
assert.ok(service.includes('assertJobsReadAccess(access)'));
assert.ok(service.includes('assertConfirmedJobActiveLineInvariant'));
assert.ok(repository.includes('assertConfirmedJobActiveLineInvariant'));
assert.ok(workspace.includes('CONFIRMED_JOB_LINE_MESSAGE'));
assert.ok(form.includes('hasValidActiveDoorLine(lines)'));
assert.equal(workspace.includes('onChange((current)'), false, 'DoorLineWorkspace must not update child state from a parent state updater');
const archiveBody = workspace.match(/function archive\(lineId: unknown\) \{([\s\S]*?)function restore/)?.[1] ?? '';
const rejectionIndex = archiveBody.indexOf('showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE });');
const rejectionReturnIndex = archiveBody.indexOf('return;', rejectionIndex);
const parentUpdateIndex = archiveBody.indexOf('onChange(lines.map');
assert.ok(rejectionIndex >= 0 && rejectionReturnIndex > rejectionIndex && parentUpdateIndex > rejectionReturnIndex, 'final-line rejection must finish before the parent line update');
for (const behavior of [
  'final valid line archive is blocked',
  'rejected final archive does not change persisted data',
  'rejected final archive does not change revision',
  'another valid active line permits archive',
]) {
  assert.ok(doorLineContractTests.includes(behavior), `J2A behavioral contract missing: ${behavior}`);
}
assert.match(workspace, /clearMessageTimer\(\);\s*setMessage\(\{ \.\.\.next, lifecycleStage \}\);\s*messageTimer\.current = setTimeout/, 'showing feedback must clear and restart its timer');
assert.ok(workspace.includes('}, 5000);'), 'transient workspace feedback must dismiss after approximately five seconds');
assert.ok(workspace.includes("const visibleMessage = message?.lifecycleStage === lifecycleStage ? message : null;"), 'a successful lifecycle correction must hide prior feedback immediately');
assert.match(workspace, /if \(messageTimer\.current !== null\) clearTimeout\(messageTimer\.current\);\s*messageTimer\.current = null;\s*\}, \[lifecycleStage\]\);/, 'timer must be cleaned up on lifecycle changes and unmount');
assert.match(workspace, /clearMessageTimer\(\);\s*setMessage\(\{ error: true, text: special, lifecycleStage \}\);/, 'field validation errors must remain persistent');
assert.equal(/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,300}setMessage\s*\(/.test(workspace), false, 'effects must not synchronously update message state');
assert.ok(form.includes("onClick={() => setLifecycleStage('Draft')}"));
assert.ok(form.includes("onClick={() => setLifecycleStage('Confirmed Job')}"));
assert.ok(form.includes('jobAggregateDirtySnapshot({ values: nextValues, lines: nextLines, lifecycleStage: nextStage, pendingPoNumber: nextPendingPo })'), 'dirty snapshot must include header, lines, lifecycle, and pending PO input');
assert.ok(form.includes('expectedRevision: job.revision, input, lines'));
assert.ok(form.includes('commandId: commandId.current as string, input, lines'));
console.log('Native Job Intake J2A verifier: PASS');
