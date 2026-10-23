// Real PostgreSQL transactions, no Auth. Each case owns one unique synthetic fixture.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {passwordTestConnection} from './password-test-connection.mjs';
const argv=process.argv.slice(2);
const {executable,args,env,guard}=passwordTestConnection(argv);
if(argv[argv.indexOf('--host')+1]!=='127.0.0.1'||argv[argv.indexOf('--port')+1]!=='55432')throw new Error('Requires 127.0.0.1:55432');
function sql(statement){const r=spawnSync(executable,args,{env,encoding:'utf8',input:guard+statement,timeout:20000});assert.equal(r.status,0,r.stderr||r.error?.message);return r.stdout.trim();}
function session(tag){const child=spawn(executable,args,{env:{...env,PGAPPNAME:tag},stdio:['pipe','pipe','pipe']});
 let output='',error='';child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{error+=b;});
 const closed=once(child,'close');return {child,closed,output:()=>output,error:()=>error};}
async function until(predicate,label){for(let i=0;i<100;i++){if(predicate())return;await delay(50);}throw new Error(label);}
for(const kind of ['employee-then-reset','reset-then-employee','two-resets']){
 const u=randomUUID(),a=randomUUID(),b=randomUUID(),tag='dg_atomic_'+randomUUID();let created=false,left,right;
 try{
  sql(`BEGIN; INSERT INTO auth.users(id) VALUES('${u}'); INSERT INTO public.dg_user_profiles(user_id,display_name,active,must_change_password) VALUES('${u}','Synthetic atomic test',true,true); COMMIT;`);created=true;
  if(kind==='reset-then-employee')sql(`SELECT public.dg_password_reserve('${u}','${a}',1,'employee_setup');`);
  left=session(tag+'_a');
  const first=kind==='employee-then-reset'
   ?`SELECT public.dg_password_reserve('${u}','${a}',1,'employee_setup'); SELECT public.dg_password_finish('${u}','${a}','succeeded');`
   :`SELECT public.dg_password_request_reset('${u}','${b}');`;
  left.child.stdin.write(`BEGIN; ${guard} ${first} SELECT 'READY';\n`);
  await until(()=>left.output().includes('READY'),'First transaction did not become ready');
  right=session(tag+'_b');
  const second=kind==='reset-then-employee'?`SELECT public.dg_password_finish('${u}','${a}','succeeded');`
   :`SELECT public.dg_password_request_reset('${u}','${kind==='two-resets'?a:b}');`;
  right.child.stdin.end(`BEGIN; ${guard} ${second} COMMIT;\n`);
  // Observe real lock contention instead of assuming a sleep proved concurrency.
  await until(()=>sql(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='${tag}_b' AND wait_event_type='Lock');`)==='t','Second transaction did not wait on lock');
  left.child.stdin.end('COMMIT;\n');assert.equal((await left.closed)[0],0,left.error());
  assert.equal((await right.closed)[0],0,right.error());
  const result=JSON.parse(sql(`SELECT jsonb_build_object('generation',s.generation,'required',s.setup_required,'pending',s.reset_pending,'profile',p.must_change_password,
   'a',(SELECT state FROM public.dg_password_operations WHERE operation_id='${a}'),'b',(SELECT state FROM public.dg_password_operations WHERE operation_id='${b}'))
   FROM public.dg_password_setup_state s JOIN public.dg_user_profiles p USING(user_id) WHERE user_id='${u}';`));
  assert.deepEqual(result,{generation:kind==='two-resets'?3:2,required:true,pending:true,profile:true,
   a:kind==='employee-then-reset'?'succeeded':kind==='reset-then-employee'?'superseded':'pending',b:kind==='two-resets'?'superseded':'pending'});
  console.log(`${kind}: observed lock contention, committed ordering and final profile/state passed.`);
 }finally{
  for(const running of [left,right])if(running && running.child.exitCode===null){running.child.kill();await running.closed;}
  // Delete ONLY this invocation's successfully inserted random synthetic identity.
  // Existing bootstrap fixtures are never updated by this suite.
  if(created)sql(`BEGIN; DELETE FROM public.dg_password_operations WHERE user_id='${u}'; DELETE FROM public.dg_password_setup_state WHERE user_id='${u}'; DELETE FROM public.dg_user_profiles WHERE user_id='${u}'; DELETE FROM auth.users WHERE id='${u}'; COMMIT;`);
 }
}
