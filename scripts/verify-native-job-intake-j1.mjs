import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const writePathFiles = [
  'lib/jobs/job-intake-actions.ts',
  'lib/jobs/job-intake-service.ts',
  'lib/jobs/job-intake-repository.ts',
  'lib/jobs/local-job-intake-repository.ts',
];
const source = (await Promise.all(writePathFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const forbidden = [
  ['browser Supabase client', /lib\/supabase\/client/],
  ['trusted service-role client', /trusted-read-server|createTrustedReadOnlySupabaseClient/],
  ['hosted insert/update/upsert/delete', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(/],
  ['hosted intake RPC', /\.rpc\s*\(/],
];

for (const [label, pattern] of forbidden) {
  assert.equal(pattern.test(source), false, `J1 write path must not contain ${label}`);
}

const localRepository = await readFile('lib/jobs/local-job-intake-repository.ts', 'utf8');
for (const required of [
  'DOORGO_LOCAL_INTAKE_ENABLED',
  "runtime === 'production'",
  "path.join(process.cwd(), '.local-data', 'native-job-intake-j1.json')",
  'await rename(temporaryPath, filePath)',
  'expectedRevision',
  'createCommands',
]) {
  assert.ok(localRepository.includes(required), `local adapter contract missing: ${required}`);
}

const actions = await readFile('lib/jobs/job-intake-actions.ts', 'utf8');
const service = await readFile('lib/jobs/job-intake-service.ts', 'utf8');
assert.ok(actions.includes('actionWriteCheck(access)'), 'server actions must repeat authorization');
assert.ok(service.includes('assertJobsWriteAccess(access)'), 'services must repeat write authorization');
assert.ok(service.includes('assertJobsReadAccess(access)'), 'services must enforce read authorization');

console.log('Native Job Intake J1 verifier: PASS');
