// Offline only: real adapter with mocked modules, no Auth or database connections.
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const read=f=>readFileSync(f,'utf8');
const server=read('lib/admin/password-reset-server.ts');
assert.match(server,/^import 'server-only'/);
assert.doesNotMatch(server,/^['"]use server['"]/m);
assert.doesNotMatch(server,/console\.|dg_password_reconcile|complete_dg_initial_password_setup|dg_admin_require_password_change/);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const file of [...walk('app'),...walk('components'),...walk('lib')]){
  if (['app/account/change-password/actions.ts','lib/admin/users-server.ts','lib/admin/users-service.ts'].includes(file.replaceAll('\\','/'))) continue;
  if(!/\.tsx?$/.test(file)||file.endsWith('.test.ts')||/password-reset-(server|operation)\.ts$/.test(file))continue;
  assert.doesNotMatch(read(file),/password-reset-(server|operation)/,`Server import boundary: ${file}`);
}
const prefix=path.resolve('.tmp-admin-password-');const temporary=mkdtempSync(prefix);
try{
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--strict','--pretty','false','--target','es2022',
    '--module','commonjs','--moduleResolution','node','--esModuleInterop','--rootDir','lib','--outDir',temporary,
    'lib/admin/password-reset-operation.test.ts','lib/admin/users-service.test.ts'],{stdio:'inherit'});
  execFileSync(process.execPath,['--test',path.join(temporary,'admin/password-reset-operation.test.js'),path.join(temporary,'admin/users-service.test.js')],{stdio:'inherit'});
  const core=require(path.join(temporary,'admin/password-reset-operation.js'));
  const parsers=require(path.join(temporary,'auth/employee-password-operation.js'));
  const sdk=require('@supabase/supabase-js');
  const user='20000000-0000-4000-8000-000000000001';
  const actor='20000000-0000-4000-8000-000000000002';
  async function adapterCase(mode){
    let operation=null,writes=0,factories=0,required=false,finished=false;
    const calls=[];
    const access={state:'active',user:{id:actor,email:null},profile:{userId:actor,active:true,mustChangePassword:mode==='setup-required'},permissions:{users:mode==='denied'?'view':'use'}};
    const authenticated={async rpc(name){calls.push(name);
      assert.equal(name,'dg_admin_list_users');
      return {data:[{userId:user,active:mode!=='inactive',mustChangePassword:false}],error:null};
    }};
    const trusted={auth:{admin:{async updateUserById(id,attributes){
      writes++;calls.push('Auth');assert.equal(id,user);assert.deepEqual(Object.keys(attributes),['password']);assert.equal(required,true);
      if(mode==='throw')throw new Error('network');
      const error=mode==='weak'?new sdk.AuthWeakPasswordError('Rejected',422,[]):mode==='500'?new sdk.AuthApiError('failure',500,'unexpected_failure'):null;
      return {data:{user:error?null:{id:mode==='wrong-user'?actor:user}},error};
    }}},async rpc(name,args){calls.push(name);assert.equal(args.p_user_id,user);
      assert.doesNotMatch(JSON.stringify(args),/synthetic temporary/);
      if(name==='dg_password_request_reset'){required=true;operation={user_id:user,operation_id:args.p_operation_id,generation:2,kind:'admin_reset',state:'pending',outcome:null};return {data:operation,error:null};}
      if(name==='dg_password_employee_snapshot')return {data:{user_id:user,active:true,must_change_password:required,generation:'2',setup_required:true,
        reset_pending:!finished,unresolved:operation?.state==='reserved'||operation?.state==='unknown'?operation:null,completion:null},error:null};
      if(name==='dg_password_reserve'){assert.equal(args.p_kind,'admin_reset');assert.equal(args.p_generation,'2');operation={...operation,state:'reserved'};return {data:operation,error:null};}
      assert.equal(name,'dg_password_finish');operation={...operation,state:args.p_outcome,outcome:args.p_outcome==='unknown'?null:args.p_outcome};finished=args.p_outcome==='succeeded';return {data:operation,error:null};
    }};
    const evaluated={exports:{}};
    const imports={'server-only':{},'node:crypto':require('node:crypto'),'@supabase/supabase-js':sdk,
      '../auth/current-access':{getCurrentDoorGoAccess:async()=>{calls.push('access');return access;}},
      '../auth/employee-password-operation':parsers,
      '../supabase/server':{createAuthenticatedSupabaseServerClient:async()=>authenticated},
      '../supabase/trusted-read-server':{createTrustedReadOnlySupabaseClient:()=>{factories++;return trusted;}},
      '../supabase/public-env':{getPublicSupabaseEnvironment:()=>({url:'https://test.invalid'})},'./password-reset-operation':core};
    runInNewContext(ts.transpileModule(server,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {module:evaluated,exports:evaluated.exports,URL,process:{env:{SUPABASE_URL:mode==='wrong-project'?'https://other.invalid':'https://test.invalid'}},
        require:id=>{assert.ok(id in imports,id);return imports[id];}});
    const form=new FormData();form.set('newPassword','synthetic temporary password');form.set('confirmPassword','synthetic temporary password');
    form.set('operationId',actor);form.set('generation','100');form.set('userId',actor);form.set('success','true');
    const result=await evaluated.exports.runAdminPasswordReset(user,form);
    assert.equal(calls[0],'access');assert.deepEqual(Object.keys(result),['status']);
    if(['denied','setup-required','inactive','wrong-project'].includes(mode)){assert.equal(factories,0);assert.equal(writes,0);}
    else {assert.equal(writes,1);assert.ok(calls.indexOf('dg_password_request_reset')<calls.indexOf('Auth'));}
    return result.status;
  }
  for(const [mode,expected] of [['success','operation_complete'],['denied','not_allowed'],['setup-required','not_allowed'],['inactive','not_allowed'],
    ['wrong-project','unavailable'],['weak','auth_rejected'],['500','recovery_required'],['throw','recovery_required'],['wrong-user','recovery_required']]){
    assert.equal(await adapterCase(mode),expected,mode);
  }
  console.log('9 real-adapter/mocked-SDK cases passed; server boundary passed. Not SQL/Auth integration proof.');
}finally{assert.ok(path.resolve(temporary).startsWith(prefix));rmSync(temporary,{recursive:true,force:true});}
