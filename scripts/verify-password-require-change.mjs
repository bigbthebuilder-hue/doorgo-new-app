// Offline source checks and real-adapter tests with mocked server/SQL boundaries.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import path from 'node:path';
import ts from 'typescript';
const require=createRequire(import.meta.url),read=f=>readFileSync(f,'utf8');
const server=read('lib/admin/require-password-change-server.ts');
const sql=read('supabase/migrations/20261026120000_password_require_change.sql');
assert.match(sql,/dg_password_lock_state\(p_user_id\)/);
assert.match(sql,/IF s.reset_pending THEN RAISE EXCEPTION/);
assert.match(sql,/generation=generation\+1,setup_required=true/);
assert.match(sql,/SET must_change_password=true/);
assert.match(sql,/REVOKE ALL ON FUNCTION.*FROM PUBLIC,anon,authenticated,service_role/);
assert.match(sql,/GRANT EXECUTE ON FUNCTION.*TO service_role/);
assert.doesNotMatch(sql,/(?:UPDATE|INSERT INTO|DELETE FROM) public\.dg_password_operations|reset_pending\s*=|CREATE OR REPLACE/i);
assert.match(server,/^import 'server-only'/);
assert.doesNotMatch(server,/['"]use server['"]|updateUser|createUser|\.auth\.|console\.|dg_password_reconcile/);
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):[path.join(d,e.name)]);
for(const file of [...walk('app'),...walk('components'),...walk('lib')]){
  if(!/\.tsx?$/.test(file)||file.endsWith('.test.ts')||file.endsWith('require-password-change-server.ts'))continue;
  assert.doesNotMatch(read(file),/require-password-change-server/,`Inactive boundary: ${file}`);
}
assert.match(read('lib/admin/users-service.ts'),/rpc\('dg_admin_require_password_change'/);
const prefix=path.resolve('.tmp-require-password-'),temporary=mkdtempSync(prefix);
try{
  execFileSync(process.execPath,['node_modules/typescript/bin/tsc','--strict','--pretty','false','--target','es2022',
    '--module','commonjs','--moduleResolution','node','--esModuleInterop','--rootDir','lib','--outDir',temporary,
    'lib/admin/users-contract.ts'],{stdio:'inherit'});
  const contract=require(path.join(temporary,'admin/users-contract.js'));
  const user='20000000-0000-4000-8000-000000000001';
  for(const mode of ['success','repeat','denied','setup-required','inactive-actor','unauthenticated','invalid-id',
    'inactive-target','missing-target','lookup-error','wrong-project','rpc-error','lost-response','bad-result']){
    let factories=0,writes=0;const calls=[];
    const access={state:mode==='unauthenticated'?'unauthenticated':mode==='inactive-actor'?'inactive_profile':'active',
      profile:{mustChangePassword:mode==='setup-required'},permissions:{users:mode==='denied'?'view':'use'}};
    const authenticated={async rpc(name){calls.push(name);assert.equal(name,'dg_admin_list_users');
      return {data:mode==='missing-target'?[]:[{userId:user,active:mode!=='inactive-target'}],error:mode==='lookup-error'?{}:null};}};
    const trusted={async rpc(name,args){writes++;calls.push(name);assert.equal(name,'dg_password_require_change');
      assert.equal(args.p_user_id,user);assert.deepEqual(Object.keys(args),['p_user_id']);
      if(mode==='lost-response')throw new Error('unknown transport outcome');
      return {data:mode==='bad-result'?null:2+writes,error:mode==='rpc-error'?{}:null};}};
    const imports={'server-only':{},'../auth/current-access':{getCurrentDoorGoAccess:async()=>access},
      '../supabase/server':{createAuthenticatedSupabaseServerClient:async()=>authenticated},
      '../supabase/trusted-read-server':{createTrustedReadOnlySupabaseClient:()=>{factories++;return trusted;}},
      '../supabase/public-env':{getPublicSupabaseEnvironment:()=>({url:'https://test.invalid'})},'./users-contract':contract};
    const evaluated={exports:{}};
    runInNewContext(ts.transpileModule(server,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
      {module:evaluated,exports:evaluated.exports,URL,process:{env:{SUPABASE_URL:mode==='wrong-project'?'https://other.invalid':'https://test.invalid'}},
        require:id=>{assert.ok(id in imports,id);return imports[id];}});
    const result=await evaluated.exports.runInactiveRequirePasswordChange(mode==='invalid-id'?'bad':user);
    assert.equal(result.ok,['success','repeat'].includes(mode),mode);
    assert.deepEqual(Object.keys(result),['ok']);
    if(mode==='repeat'){assert.equal((await evaluated.exports.runInactiveRequirePasswordChange(user)).ok,true);assert.equal(writes,2);}
    else if(['success','rpc-error','lost-response','bad-result'].includes(mode))assert.equal(writes,1);
    else {assert.equal(writes,0);assert.equal(factories,0);}
  }
  console.log('14 mocked adapter cases and SQL/inactive-boundary static checks passed. No Auth/database integration claimed.');
}finally{assert.ok(path.resolve(temporary).startsWith(prefix));rmSync(temporary,{recursive:true,force:true});}
