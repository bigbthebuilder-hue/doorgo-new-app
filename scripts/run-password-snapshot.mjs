// Explicit isolated-only snapshot validation; never bootstraps or creates a database.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { passwordTestConnection } from './password-test-connection.mjs';

const [mode, ...argv] = process.argv.slice(2);
if (!['inspect', 'apply', 'test'].includes(mode)) throw new Error('Choose inspect, apply, or test');
const connection = passwordTestConnection(argv);
if (argv[argv.indexOf('--host') + 1] !== '127.0.0.1'
  || argv[argv.indexOf('--port') + 1] !== '55432') throw new Error('Requires 127.0.0.1:55432');
const { executable, args, env, guard } = connection;
const prerequisites = `DO $$ BEGIN
  IF to_regprocedure('public.dg_password_reserve(uuid,uuid,bigint,text)') IS NULL
    OR to_regprocedure('public.dg_password_finish(uuid,uuid,text)') IS NULL
    OR to_regclass('public.dg_password_operations') IS NULL
    OR to_regclass('public.dg_password_setup_state') IS NULL
    OR (SELECT count(*) FROM public.dg_user_profiles WHERE active AND must_change_password)<>2
    OR EXISTS(SELECT 1 FROM public.dg_password_setup_state)
    OR EXISTS(SELECT 1 FROM public.dg_password_operations)
    THEN RAISE EXCEPTION 'Expected preserved unused foundation fixtures'; END IF;
END $$;`;
const absent = `DO $$ BEGIN IF to_regprocedure('public.dg_password_employee_snapshot(uuid)') IS NOT NULL
  THEN RAISE EXCEPTION 'Snapshot already exists; inspect instead of overwriting'; END IF; END $$;`;
const commands = ['-c', `${guard} ${prerequisites}`];
if (mode === 'inspect') commands.push('-c', `SELECT current_database(),current_setting('cluster_name'),
  inet_server_addr(),inet_server_port(),current_setting('data_directory'),
  to_regprocedure('public.dg_password_employee_snapshot(uuid)');`);
else {
  if (mode === 'apply') commands.push('-c', absent);
  commands.push('-f', fileURLToPath(new URL(mode === 'apply'
    ? '../supabase/migrations/20261023120000_employee_password_operation_snapshot.sql'
    : './verify-password-snapshot-local.sql', import.meta.url)));
}
const result = spawnSync(executable, [...args, ...commands], { env, stdio: 'inherit', timeout: 60000 });
if (result.error) throw new Error(`Local psql failed: ${result.error.code}`);
if (result.status !== 0) process.exit(result.status ?? 1);
