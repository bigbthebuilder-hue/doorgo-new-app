import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.tmp-preparation-'));
try {
  const run = (args) => { const result = spawnSync(process.execPath, args, { stdio: 'inherit' }); if (result.status !== 0) throw new Error('Preparation verification failed'); };
  run(['node_modules/typescript/bin/tsc', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck', '--outDir', dir, 'lib/jobs/preparation-control.test.ts', 'lib/jobs/door-line-lifecycle.test.ts']);
  run([join(dir, 'jobs/preparation-control.test.js')]);
  run([join(dir, 'jobs/door-line-lifecycle.test.js')]);
} finally { rmSync(dir, { recursive: true, force: true }); }
