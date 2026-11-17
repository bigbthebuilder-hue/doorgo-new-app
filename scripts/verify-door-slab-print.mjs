import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const output = mkdtempSync(join(tmpdir(), 'doorgo-slab-print-'));
try {
  for (const args of [
    [resolve('node_modules/typescript/bin/tsc'), '--pretty', 'false', '--target', 'es2022', '--module', 'commonjs', '--moduleResolution', 'node', '--esModuleInterop', '--outDir', output, 'lib/jobs/work-order-production-print.test.ts'],
    [join(output, 'jobs/work-order-production-print.test.js')],
  ]) {
    const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, NODE_PATH: resolve('node_modules') } });
    if (result.status !== 0) throw new Error('Production print verification failed');
  }
} finally { rmSync(output, { recursive: true, force: true }); }
