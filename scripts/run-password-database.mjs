// Bootstrap or run rollback-only SQL tests. No cluster/database creation or service management.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { passwordTestConnection } from './password-test-connection.mjs';

const [mode, ...argv] = process.argv.slice(2);
if (!['bootstrap', 'test'].includes(mode)) throw new Error('Choose bootstrap or test');
const { executable, args, env, guard } = passwordTestConnection(argv);
const file = fileURLToPath(new URL(mode === 'bootstrap'
  ? './bootstrap-password-operations.sql' : './verify-password-operations-local.sql', import.meta.url));
// Guard and file run on the SAME connection. -X ignores psqlrc; -w prohibits prompts.
const result = spawnSync(executable, [...args, '-c', guard, '-f', file], { env, stdio: 'inherit', timeout: 60000 });
if (result.error) throw new Error(`Local psql failed: ${result.error.code}`);
if (result.status !== 0) process.exit(result.status ?? 1);
