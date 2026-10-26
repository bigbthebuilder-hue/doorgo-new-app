// Local-only cutover validation, never a hosted migration runner.
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {passwordTestConnection} from './password-test-connection.mjs';
const [mode,...argv]=process.argv.slice(2);
if(!['inspect','apply','test','guard-test'].includes(mode))throw new Error('Choose inspect, apply, test or guard-test');
const {executable,args,env,guard}=passwordTestConnection(argv);
if(argv[argv.indexOf('--host')+1]!=='127.0.0.1'||argv[argv.indexOf('--port')+1]!=='55432')throw new Error('Requires 127.0.0.1:55432');
const prerequisite=`DO $$ BEGIN
 IF to_regprocedure('public.dg_password_employee_snapshot(uuid)') IS NULL
 OR position('password_changed_at' in pg_get_functiondef('public.dg_password_settle(uuid,uuid,text,text)'::regprocedure))=0
 OR EXISTS(SELECT 1 FROM public.dg_password_setup_state) OR EXISTS(SELECT 1 FROM public.dg_password_operations)
 OR (SELECT count(*) FROM public.dg_user_profiles WHERE active AND must_change_password)<>2
 THEN RAISE EXCEPTION 'Expected atomic foundation and preserved fixtures'; END IF;
END $$;`;
const file=name=>fileURLToPath(new URL(name,import.meta.url));
const migration=file('../supabase/migrations/20261023160000_retire_legacy_password_completion.sql');
function run(commands,capture=false){const r=spawnSync(executable,[...args,'-c',guard+' '+prerequisite,...commands],{env,encoding:'utf8',stdio:capture?'pipe':'inherit',timeout:60000});if(r.error)throw r.error;return r;}
if(mode==='inspect'){
 const r=run(['-c',`SELECT current_database(),current_setting('cluster_name'),current_setting('data_directory'),inet_server_addr(),inet_server_port(),to_regprocedure('public.complete_dg_initial_password_setup()');`]);process.exit(r.status??1);
}
if(mode==='guard-test'){
 const absent=`DO $$ BEGIN IF to_regprocedure('public.complete_dg_initial_password_setup()') IS NOT NULL THEN RAISE EXCEPTION 'Run apply first; guard-test never drops an existing RPC'; END IF; END $$;`;
 assert.equal(run(['-c',absent],true).status,0);
 const clean=run(['-c',"SELECT coalesce(current_setting('doorgo.password_completion_cutover',true),'unset');"],true);
 assert.equal(clean.status,0);assert.equal(clean.stdout.trim(),'unset','Do not use inherited role/database acknowledgement defaults');
 const denied=run(['-f',migration],true);assert.notEqual(denied.status,0);assert.match(denied.stderr,/password.cutover_approval_required/);
 const separate=run(['-c',"SELECT set_config('doorgo.password_completion_cutover','approved',false);"],true);assert.equal(separate.status,0);
 const stillDenied=run(['-f',migration],true);assert.match(stillDenied.stderr,/password.cutover_approval_required/);assert.notEqual(stillDenied.status,0);
 // Existing function was already dropped by the previous authorized local run.
 // Reach the real DROP on one direct connection, then fail harmlessly on absence.
 const acknowledged=run(['-c',"SELECT set_config('doorgo.password_completion_cutover','approved',false);",'-f',migration],true);
 assert.notEqual(acknowledged.status,0);assert.doesNotMatch(acknowledged.stderr,/password.cutover_approval_required/);
 assert.match(acknowledged.stderr,/function public\.complete_dg_initial_password_setup\(\) does not exist/);
 console.log('Fresh/separate-session calls rejected; same direct psql session passed guard and reached already-absent DROP. No RPC recreated or migration reapplied.');
 process.exit(0);
}
if(mode==='apply'){
 const exists=`DO $$ BEGIN IF to_regprocedure('public.complete_dg_initial_password_setup()') IS NULL THEN RAISE EXCEPTION 'Legacy RPC already removed; do not reapply'; END IF; END $$;`;
 // Prove accidental/unacknowledged application fails before changing authority.
 const denied=run(['-c',exists,'-f',migration],true);
 assert.notEqual(denied.status,0);assert.match(denied.stderr,/password.cutover_approval_required/);
 const r=run(['-c',exists+" SELECT set_config('doorgo.password_completion_cutover','approved',false);",'-f',migration]);process.exit(r.status??1);
}
const r=run(['-f',file('./verify-password-authority-local.sql')]);process.exit(r.status??1);
