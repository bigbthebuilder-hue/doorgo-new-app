import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.tmp-mobile-intake-'));
try {
  for (const args of [ ['node_modules/typescript/bin/tsc', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck', '--outDir', dir, 'lib/jobs/mobile-intake.test.ts'], [join(dir, 'jobs/mobile-intake.test.js')] ]) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
    if (result.status !== 0) throw new Error('Mobile intake verification failed');
  }
} finally { rmSync(dir, { recursive: true, force: true }); }
