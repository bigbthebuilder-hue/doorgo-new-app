// Offline focused checks only: no Supabase clients, credentials or database calls.
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const read = f => readFileSync(f,'utf8');
const server = read('lib/auth/employee-password-server.ts');
assert.match(server,/^import 'server-only'/);
assert.doesNotMatch(server,/^['"]use server['"]/m);
assert.match(server,/authenticated\.auth\.getUser\(\)/);
assert.match(server,/trusted\.rpc\(/);
assert.doesNotMatch(server,/complete_dg_initial_password_setup|auth\.admin|console\./);
function walk(directory) {
  return readdirSync(directory,{withFileTypes:true}).flatMap(e => e.isDirectory()
    ? walk(path.join(directory,e.name)) : [path.join(directory,e.name)]);
}
for (const file of [...walk('app'),...walk('components'),...walk('lib')]) {
  if (!/\.tsx?$/.test(file) || file.endsWith('.test.ts') || /(?:employee-password|password-reset)-(server|operation)\.ts$/.test(file)) continue;
  assert.doesNotMatch(read(file),/employee-password-(server|operation)|password-reset-(server|operation)/,`Inactive boundary: ${file}`);
}
assert.match(read('app/account/change-password/actions.ts'),/executeInitialPasswordSetup/);
const sql = read('supabase/migrations/20261023120000_employee_password_operation_snapshot.sql');
assert.match(sql,/LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''/);
assert.match(sql,/WHERE p\.user_id=p_user_id/);
assert.match(sql,/o\.generation=s\.generation AND o\.kind='employee_setup'/);
assert.match(sql,/o\.state='succeeded' AND o\.outcome='succeeded'/);
assert.match(sql,/FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql,/TO service_role;/);
assert.doesNotMatch(sql,/\b(?:UPDATE|INSERT|DELETE|CREATE OR REPLACE|auth\.users)\b/);

const prefix = path.resolve('.tmp-employee-password-');
const temporary = mkdtempSync(prefix);
try {
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--strict','--pretty','false',
    '--target','es2022','--module','commonjs','--moduleResolution','node','--esModuleInterop',
    '--rootDir','lib','--outDir',temporary,'lib/auth/employee-password-operation.test.ts',
    'lib/auth/password-setup.test.ts','lib/auth/access.test.ts'],{stdio:'inherit'});
  execFileSync(process.execPath,['--test',path.join(temporary,'auth/employee-password-operation.test.js')],{stdio:'inherit'});
  for (const file of ['password-setup.test.js','access.test.js']) {
    execFileSync(process.execPath,[path.join(temporary,'auth',file)],{stdio:'inherit'});
  }

  // Execute the REAL adapter with mocked module boundaries. No server-only bypass in production.
  const core = require(path.join(temporary,'auth/employee-password-operation.js'));
  const sdk = require('@supabase/supabase-js');
  const userId='20000000-0000-4000-8000-000000000001';
  async function adapterCase(mode) {
    let operation=null, completed=false, authWrites=0, trustedFactories=0;
    const calls=[];
    const authenticated={auth:{
      async getUser(){ calls.push('getUser'); return {data:{user:mode==='anonymous'?null:{id:userId}},error:null}; },
      async updateUser(attributes){
        authWrites++; assert.deepEqual(Object.keys(attributes),['password']);
        if(mode==='throw')throw new Error('Network');
        let error=null;
        if(mode==='same')error=new sdk.AuthApiError('Rejected',422,'same_password');
        if(mode==='weak')error=new sdk.AuthWeakPasswordError('Rejected',422,[]);
        if(mode==='server-error')error=new sdk.AuthApiError('Failure',500,'unexpected_failure');
        if(mode==='unauthorized')error=new sdk.AuthApiError('Failure',401,'bad_jwt');
        return {data:{user:error?null:{id:mode==='wrong-user'?'20000000-0000-4000-8000-000000000002':userId}},error};
      },
    }};
    const trusted={async rpc(name,args){
      calls.push(name); assert.equal(args.p_user_id,userId);
      if(name==='dg_password_employee_snapshot') return {error:null,data:{user_id:userId,active:true,
        must_change_password:mode!=='not-required'&&!completed,generation:'1',setup_required:!completed,reset_pending:false,
        unresolved:operation?.state==='reserved'||operation?.state==='unknown'?operation:null,
        completion:completed?operation:null}};
      if(name==='dg_password_reserve') {
        assert.equal(args.p_kind,'employee_setup');assert.equal(args.p_generation,'1');
        operation={user_id:userId,operation_id:args.p_operation_id,generation:1,kind:'employee_setup',state:'reserved',outcome:null};
        return {error:null,data:operation};
      }
      assert.equal(name,'dg_password_finish');
      operation={...operation,state:args.p_outcome,outcome:args.p_outcome==='unknown'?null:args.p_outcome};
      completed=args.p_outcome==='succeeded';
      return {error:null,data:operation};
    }};
    const evaluated={exports:{}};
    const imports={ 'server-only':{}, 'node:crypto':require('node:crypto'), '@supabase/supabase-js':sdk,
      '../supabase/server':{createAuthenticatedSupabaseServerClient:async()=>authenticated},
      '../supabase/trusted-read-server':{createTrustedReadOnlySupabaseClient:()=>{trustedFactories++;return trusted;}},
      '../supabase/public-env':{getPublicSupabaseEnvironment:()=>({url:'https://test.invalid'})},
      './employee-password-operation':core };
    const js=ts.transpileModule(server,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
    runInNewContext(js,{module:evaluated,exports:evaluated.exports,URL,
      process:{env:{SUPABASE_URL:mode==='wrong-project'?'https://other.invalid':'https://test.invalid'}},
      require:id=>{assert.ok(id in imports,id);return imports[id];}});
    const form=new FormData();form.set('newPassword','valid new passphrase');form.set('confirmPassword','valid new passphrase');
    // Client-supplied authority fields are ignored.
    form.set('userId','attacker');form.set('generation','999');form.set('success','true');
    const result=await evaluated.exports.runInactiveEmployeePasswordSetup(form);
    assert.equal(calls[0],'getUser');
    if(mode==='anonymous'){assert.equal(trustedFactories,0);assert.equal(authWrites,0);}
    if(mode==='not-required')assert.equal(authWrites,0);
    if(mode==='wrong-project'){assert.equal(trustedFactories,0);assert.equal(authWrites,0);}
    return result.status;
  }
  for(const [mode,expected] of [['success','operation_complete'],['same','auth_rejected'],['weak','auth_rejected'],
    ['throw','recovery_required'],['server-error','recovery_required'],['unauthorized','recovery_required'],
    ['wrong-user','recovery_required'],['anonymous','not_allowed'],['not-required','not_allowed'],['wrong-project','unavailable']]) {
    assert.equal(await adapterCase(mode),expected,mode);
  }
  console.log('10 real-adapter/mocked-SDK cases passed; inactive import and SQL grant checks passed. No live Auth or SQL proof.');
} finally {
  // Only remove the unique compilation directory created by this invocation.
  assert.ok(path.resolve(temporary).startsWith(prefix));
  rmSync(temporary,{recursive:true,force:true});
}
