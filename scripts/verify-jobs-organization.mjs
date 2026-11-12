import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const output = mkdtempSync(join(tmpdir(), 'doorgo-jobs-organization-'));
function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('Jobs organization verification failed');
}
try {
  run([resolve('node_modules/typescript/bin/tsc'), '--pretty', 'false', '--target', 'es2022', '--module', 'commonjs',
    '--moduleResolution', 'node', '--esModuleInterop', '--outDir', output,
    'lib/jobs/jobs-list.test.ts', 'lib/jobs/hosted-job-intake-repository.test.ts', 'lib/jobs/job-intake-contract.test.ts']);
  for (const file of ['jobs-list.test.js', 'hosted-job-intake-repository.test.js', 'job-intake-contract.test.js']) {
    run([join(output, 'jobs', file)]);
  }
} finally {
  rmSync(output, { recursive: true, force: true });
}
