// Offline execution of real actions/adapters with mocked service boundaries.
// Does not establish hosted SQL, Supabase Auth or browser behavior.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const read = f => readFileSync(f, 'utf8');
function evaluate(file, imports, globals = {}) {
  const evaluated = { exports: {} };
  runInNewContext(ts.transpileModule(read(file), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  }}).outputText, { module: evaluated, exports: evaluated.exports, URL, ...globals, require(id) {
    assert.ok(id in imports, 'Unexpected dependency: ' + id); return imports[id];
  }});
  return evaluated.exports;
}
let checks = 0;
const redirected = href => { throw new Error('redirect:' + href); };
for (const mode of ['anonymous', 'inactive', 'success', 'receipt', 'validation', 'rejected', 'unavailable', 'unknown', 'stale', 'mismatch', 'not-allowed']) {
  let calls = 0;
  const statuses = { success:'operation_complete', receipt:'operation_complete', validation:'validation_error', rejected:'auth_rejected', unavailable:'unavailable', unknown:'recovery_required', stale:'stale_generation', mismatch:'operation_mismatch', 'not-allowed':'not_allowed' };
  const form = new FormData();
  const action = evaluate('app/account/change-password/actions.ts', {
    'next/navigation': { redirect: redirected },
    '@/lib/auth/current-access': { getCurrentDoorGoAccess: async () => ({
      state: mode === 'anonymous' ? 'unauthenticated' : mode === 'inactive' ? 'inactive_profile' : 'active',
      profile: { mustChangePassword: mode !== 'receipt' },
    }) },
    '@/lib/auth/employee-password-server': { runEmployeePasswordSetup: async submitted => {
      calls++; assert.equal(submitted, form); return { status: statuses[mode], message: 'Validation unchanged' };
    } },
  });
  const run = () => action.changeInitialPasswordAction({ resetKey: 3 }, form);
  if (['anonymous','success','receipt'].includes(mode)) {
    await assert.rejects(run(), new RegExp('redirect:' + (mode === 'anonymous' ? '/login' : '/account')));
  } else {
    const result = await run(); assert.equal(result.resetKey, 4);
    assert.equal(result.status, mode === 'validation' ? 'validation_error' : 'operational_error');
    if (mode === 'validation') assert.equal(result.message, 'Validation unchanged');
    if (['unknown','stale','mismatch'].includes(mode)) assert.match(result.message, /administrator for recovery/);
    assert.doesNotMatch(result.message, /Your password was changed/);
  }
  assert.equal(calls, ['anonymous','inactive'].includes(mode) ? 0 : 1); checks++;
}
class UserAdminError extends Error {}
const calls = []; let saved = { userId:'target' };
const svc = Object.fromEntries(['create','savePermissions','setActive','requirePasswordChange','resetPassword','reactivate'].map(name => [name, async (...args) => { calls.push({name,args}); return saved; }]));
const actions = evaluate('lib/admin/users-actions.ts', {
  'next/cache': { revalidatePath: p => assert.equal(p, '/manager') },
  './users-contract': { UserAdminError },
  './users-server': { currentUsersService: async () => svc },
});
for (const [action, method, args] of [
  ['createAdminUser','create',[new FormData(),{}]], ['saveAdminPermissions','savePermissions',['target',{}]],
  ['setAdminUserActive','setActive',['target',false]], ['requireAdminPasswordChange','requirePasswordChange',['target']],
  ['resetAdminPassword','resetPassword',['target',new FormData()]], ['reactivateAdminUser','reactivate',['target',new FormData()]],
]) {
  const result = await actions[action](...args); assert.equal(result.ok,true);
  assert.equal(calls.at(-1).name,method); assert.deepEqual(Array.from(calls.at(-1).args),args); checks++;
}
saved = undefined;
const refreshed = await actions.resetAdminPassword('target',new FormData());
assert.equal(refreshed.ok,true); assert.match(refreshed.message,/Refresh users/); checks++;
svc.resetPassword = async () => { throw new UserAdminError('Recovery required'); };
assert.equal((await actions.resetAdminPassword('target',new FormData())).message,'Recovery required'); checks++;

// Ensure the real server service factory binds each callback to the intended adapter.
const delegates = {reset:async()=>{},reactivate:async()=>{},require:async()=>{},deactivate:async()=>{}};
let captured;
const server = evaluate('lib/admin/users-server.ts', {
  'server-only':{}, '../auth/current-access':{getCurrentDoorGoAccess:async()=>({})},
  '../supabase/server':{createAuthenticatedSupabaseServerClient:async()=>({})},
  '../supabase/trusted-read-server':{createTrustedReadOnlySupabaseClient:()=>({auth:{admin:{}}})},
  './users-contract':{UserAdminError}, './users-service':{usersService:(_access,factory)=>{captured=factory;return {}; }},
  './password-reset-server':{runAdminPasswordReset:delegates.reset}, './reactivation-server':{runReactivation:delegates.reactivate},
  './require-password-change-server':{runRequirePasswordChange:delegates.require}, './deactivation-server':{runEmployeeDeactivation:delegates.deactivate},
});
await server.currentUsersService(); const bound = captured();
assert.equal(bound.resetPassword,delegates.reset); assert.equal(bound.reactivate,delegates.reactivate);
assert.equal(bound.requirePasswordChange,delegates.require); assert.equal(bound.deactivate,delegates.deactivate); checks++;

for (const mode of ['success','denied','setup-required','inactive','self','missing','lookup-error','project','rpc-error','bad-result','lost-response']) {
  let writes=0, factories=0;
  const actor='20000000-0000-4000-8000-000000000001', target='20000000-0000-4000-8000-000000000002';
  const adapter=evaluate('lib/admin/deactivation-server.ts', {
    'server-only':{}, '../auth/current-access':{getCurrentDoorGoAccess:async()=>({mode,user:{id:actor}})},
    './users-contract': { assertUserAdmin:a=>{if(['denied','setup-required','inactive'].includes(a.mode))throw new Error('denied');},validateUserId:id=>assert.ok([actor,target].includes(id)) },
    '../supabase/server':{createAuthenticatedSupabaseServerClient:async()=>({rpc:async name=>{
      assert.equal(name,'dg_admin_list_users');return {data:mode==='missing'?[]:[{userId:target}],error:mode==='lookup-error'?{}:null};
    }})},
    '../supabase/public-env':{getPublicSupabaseEnvironment:()=>({url:'https://test.invalid'})},
    '../supabase/trusted-read-server':{createTrustedReadOnlySupabaseClient:()=>{factories++;return {rpc:async(name,args)=>{
      writes++; assert.equal(name,'dg_password_deactivate');assert.equal(args.p_user_id,target);
      assert.deepEqual(Object.keys(args),['p_user_id']);if(mode==='lost-response')throw new Error('network');
      return {data:mode==='bad-result'?null:'3',error:mode==='rpc-error'?{}:null};
    }};}},
  },{process:{env:{SUPABASE_URL:mode==='project'?'https://other.invalid':'https://test.invalid'}}});
  const result=await adapter.runEmployeeDeactivation(mode==='self'?actor:target);
  assert.equal(result.ok,mode==='success');
  assert.equal(writes,['success','rpc-error','bad-result','lost-response'].includes(mode)?1:0);
  assert.equal(factories,writes); checks++;
}
// UI wiring checks are static, not a substitute for manual/browser acceptance.
const ui=read('components/manager/UsersAccessWorkspace.tsx');
assert.match(ui,/selected.active \? resetAdminPassword\(selected.userId, form\) : reactivateAdminUser\(selected.userId, form\)/);
assert.doesNotMatch(ui,/setAdminUserActive\(selected.userId, !selected.active\)/);
assert.match(ui,/Reactivate with Temporary Password/);assert.match(ui,/else if \(result.ok\)/);
assert.doesNotMatch(read('lib/admin/users-service.ts'),/dg_admin_set_user_active|dg_admin_require_password_change|resetAuth/);
assert.doesNotMatch(read('app/account/change-password/actions.ts'),/executeInitialPasswordSetup|complete_dg_initial_password_setup|auth.updateUser/);
console.log(checks + ' connected action/service/deactivation cases passed; UI wiring static checks passed. Mocked boundaries, not live Auth/SQL proof.');
