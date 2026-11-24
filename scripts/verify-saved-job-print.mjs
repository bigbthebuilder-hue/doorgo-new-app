import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.tmp-saved-print-'));
try {
  for (const args of [ ['node_modules/typescript/bin/tsc', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck', '--outDir', dir, 'lib/jobs/saved-job-print.test.ts'], [join(dir, 'jobs/saved-job-print.test.js')] ]) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' }); if (result.status !== 0) throw new Error('Saved printing verification failed');
  }
} finally { rmSync(dir, {recursive:true,force:true}); }
