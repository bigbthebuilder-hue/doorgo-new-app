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
assert.ok(actions.includes('actionWriteCheck(access)'));
assert.ok(actions.includes('assertConfirmedJobActiveLineInvariant'));
assert.ok(service.includes('assertJobsWriteAccess(access)'));
assert.ok(service.includes('assertJobsReadAccess(access)'));
assert.ok(service.includes('assertConfirmedJobActiveLineInvariant'));
assert.ok(repository.includes('assertConfirmedJobActiveLineInvariant'));
assert.ok(workspace.includes('CONFIRMED_JOB_LINE_MESSAGE'));
assert.ok(form.includes('hasValidActiveDoorLine(lines)'));
assert.equal(workspace.includes('onChange((current)'), false, 'DoorLineWorkspace must not update child state from a parent state updater');
assert.ok(workspace.includes("showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE });\n      return;\n    }\n    onChange(lines.map"), 'final-line rejection must finish before the parent line update');
assert.ok(workspace.includes('clearMessageTimer();\n    setMessage({ ...next, lifecycleStage });\n    messageTimer.current = setTimeout'), 'showing feedback must clear and restart its timer');
assert.ok(workspace.includes('}, 5000);'), 'transient workspace feedback must dismiss after approximately five seconds');
assert.ok(workspace.includes("const visibleMessage = message?.lifecycleStage === lifecycleStage ? message : null;"), 'a successful lifecycle correction must hide prior feedback immediately');
assert.ok(workspace.includes('if (messageTimer.current !== null) clearTimeout(messageTimer.current);\n    messageTimer.current = null;\n  }, [lifecycleStage]);'), 'timer must be cleaned up on lifecycle changes and unmount');
assert.ok(workspace.includes('clearMessageTimer();\n      setMessage({ error: true, text: special, lifecycleStage });'), 'field validation errors must remain persistent');
assert.equal(/useEffect\s*\(\s*\(\)\s*=>\s*\{[\s\S]{0,300}setMessage\s*\(/.test(workspace), false, 'effects must not synchronously update message state');
assert.ok(form.includes("onClick={() => setLifecycleStage('Draft')}"));
assert.ok(form.includes("onClick={() => setLifecycleStage('Confirmed Job')}"));
assert.ok(form.includes("JSON.stringify({ values: nextValues, lines: nextLines, lifecycleStage: nextStage })"), 'dirty snapshot must include header, lines, and lifecycle');
assert.ok(form.includes('expectedRevision: job.revision, input, lines'));
assert.ok(form.includes('commandId: commandId.current as string, input, lines'));
console.log('Native Job Intake J2A verifier: PASS');
