// Local-only Stage 4C-1 runner; never bootstrap or recreate fixtures.
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {passwordTestConnection} from './password-test-connection.mjs';
const [mode,...argv]=process.argv.slice(2);
if(!['inspect','apply','test'].includes(mode))throw new Error('Choose inspect, apply or test');
const {executable,args,env,guard}=passwordTestConnection(argv);
if(argv[argv.indexOf('--host')+1]!=='127.0.0.1'||argv[argv.indexOf('--port')+1]!=='55432')throw new Error('Requires 127.0.0.1:55432');
const prerequisite=`DO $$ BEGIN
 IF to_regprocedure('public.dg_password_employee_snapshot(uuid)') IS NULL
 OR position('password_changed_at' in pg_get_functiondef('public.dg_password_settle(uuid,uuid,text,text)'::regprocedure))=0
 OR EXISTS(SELECT 1 FROM public.dg_password_setup_state) OR EXISTS(SELECT 1 FROM public.dg_password_operations)
 OR (SELECT count(*) FROM public.dg_user_profiles WHERE active AND must_change_password)<>2
 THEN RAISE EXCEPTION 'Expected atomic foundation, snapshot and two preserved fixtures'; END IF;
END $$;`;
const commands=['-c',guard+prerequisite];
if(mode==='inspect')commands.push('-c',`SELECT current_database(),current_setting('cluster_name'),current_setting('data_directory'),
 inet_server_addr(),inet_server_port(),to_regprocedure('public.dg_password_require_change(uuid)');`);
else {
 if(mode==='apply')commands.push('-c',`DO $$ BEGIN IF to_regprocedure('public.dg_password_require_change(uuid)') IS NOT NULL
 THEN RAISE EXCEPTION 'Already present; do not reapply'; END IF; END $$;`);
 commands.push('-f',fileURLToPath(new URL(mode==='apply'?'../supabase/migrations/20261026120000_password_require_change.sql':'./verify-password-require-change-local.sql',import.meta.url)));
}
const result=spawnSync(executable,[...args,...commands],{env,stdio:'inherit',timeout:60000});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);
