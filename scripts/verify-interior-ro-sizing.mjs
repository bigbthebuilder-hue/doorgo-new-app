import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.tmp-interior-ro-'));
try {
  const run = args => { const result = spawnSync(process.execPath, args, { stdio: 'inherit' }); if (result.status !== 0) throw new Error('Interior RO verification failed'); };
  run(['node_modules/typescript/bin/tsc', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck', '--outDir', dir, 'lib/jobs/interior-ro-sizing.test.ts', 'lib/jobs/non-glass-frame-cut-contract.test.ts']);
  for (const file of ['interior-ro-sizing.test.js', 'non-glass-frame-cut-contract.test.js']) run([join(dir, 'jobs', file)]);
} finally { rmSync(dir, { recursive: true, force: true }); }
