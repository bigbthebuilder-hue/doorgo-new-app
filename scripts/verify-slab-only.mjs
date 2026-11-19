import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
const dir = mkdtempSync(join(process.cwd(), '.tmp-slab-only-'));
try {
  const run = (args) => { const result = spawnSync(process.execPath, args, { stdio: 'inherit' }); if (result.status !== 0) throw new Error('Slab Only verification failed'); };
  run(['node_modules/typescript/bin/tsc', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--skipLibCheck', '--outDir', dir, 'lib/jobs/slab-only.test.ts']);
  run([join(dir, 'jobs/slab-only.test.js')]);
} finally { rmSync(dir, { recursive: true, force: true }); }
