import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CurrentDoorGoAccess } from '../auth/access';
import type { EmployeeSetupSnapshot, PasswordOperation } from '../auth/employee-password-operation';
import { executeAdminPasswordReset, type ResetOperations } from './password-reset-operation';

const user='20000000-0000-4000-8000-000000000001';
const other='20000000-0000-4000-8000-000000000002';
function access(): CurrentDoorGoAccess & {state:'active'} { return {state:'active',user:{id:other,email:null},
  profile:{userId:other,displayName:'Admin',active:true,isManager:false,companyLocation:null,mustChangePassword:false},permissions:{users:'use'}}; }
function form(password='synthetic temporary password') { const f=new FormData(); f.set('newPassword',password); f.set('confirmPassword',password); return f; }
// Mock state transitions for orchestration tests, NOT database concurrency proof.
function fixture() {
  const state: EmployeeSetupSnapshot={user_id:user,active:true,must_change_password:false,generation:'1',setup_required:false,reset_pending:false,unresolved:null,completion:null};
  const rows=new Map<string,PasswordOperation>(); const calls:string[]=[]; let sequence=0;
  const operations: ResetOperations={
    async target(id) { calls.push('target'); assert.equal(id,user); return {userId:user,active:state.active}; },
    newOperationId() { return `30000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`; },
    async request(id,operationId) {
      calls.push('request'); assert.equal(id,user);
      state.generation=String(Number(state.generation)+1); state.setup_required=true; state.reset_pending=true; state.must_change_password=true;
      for(const row of rows.values()) if(row.state==='pending')row.state='superseded';
      const row:PasswordOperation={user_id:id,operation_id:operationId,generation:state.generation,kind:'admin_reset',state:'pending',outcome:null};
      rows.set(operationId,row); return structuredClone(row);
    },
    async snapshot(id) { assert.equal(id,user); calls.push('snapshot'); return structuredClone(state); },
    async reserve(id,operationId,generation) {
      calls.push('reserve'); const row=rows.get(operationId)!;
      if(!state.active || state.unresolved || generation!==state.generation || row.state!=='pending' || row.user_id!==id)throw new Error('Denied');
      row.state='reserved'; state.unresolved=row; return structuredClone(row);
    },
    async resetAuth(id,password) { calls.push('auth'); assert.equal(id,user); assert.equal(password,'synthetic temporary password'); return {status:'succeeded',userId:id}; },
    async finish(id,operationId,outcome) {
      calls.push('finish:'+outcome); const row=rows.get(operationId)!; assert.equal(row.user_id,id);
      if(row.state==='succeeded' || row.state==='failed' || row.state==='superseded') {assert.equal(row.outcome,outcome);return structuredClone(row);}
      if(row.state==='unknown' && outcome!=='unknown')throw new Error('Reconciliation required');
      if(outcome==='unknown') {row.state='unknown';return structuredClone(row);}
      row.state=outcome==='succeeded' && (row.generation!==state.generation || !state.active)?'superseded':outcome;
      row.outcome=outcome;state.unresolved=null;
      if(row.state==='succeeded')state.reset_pending=false;
      return structuredClone(row);
    },
  };
  return {state,rows,calls,operations,run:(a:CurrentDoorGoAccess=access(),f=form(),id=user)=>executeAdminPasswordReset(a,id,f,()=>{calls.push('factory');return operations;})};
}
test('authorized reset: generation and real profile requirement precede Auth; setup stays required',async()=>{
  const f=fixture();assert.deepEqual(await f.run(),{status:'operation_complete'});
  assert.deepEqual(f.calls,['factory','target','request','snapshot','reserve','auth','finish:succeeded','snapshot']);
  assert.equal(f.state.generation,'2');assert.equal(f.state.setup_required,true);assert.equal(f.state.must_change_password,true);assert.equal(f.state.reset_pending,false);
});
test('unauthorized/view/setup-required/inactive administrators never instantiate operations',async()=>{
  const denied:CurrentDoorGoAccess[]=[{state:'unauthenticated',user:null,profile:null,permissions:{}}];
  for(const permission of ['none','view'] as const)denied.push({...access(),permissions:{users:permission}});
  const setup=access();setup.profile!.mustChangePassword=true;denied.push(setup);
  denied.push({...access(),state:'inactive_profile'} as CurrentDoorGoAccess);
  for(const a of denied){const f=fixture();assert.equal((await f.run(a)).status,'not_allowed');assert.deepEqual(f.calls,[]);}
});
test('invalid password/target uses existing validation without mutation',async()=>{
  const f=fixture();assert.equal((await f.run(access(),form('short'))).status,'invalid_input');
  assert.equal((await f.run(access(),form(),'invalid')).status,'invalid_input');assert.deepEqual(f.calls,[]);
});
test('deactivated or missing target never establishes a reset',async()=>{
  for(const missing of [false,true]) {const f=fixture();f.state.active=false;if(missing)f.operations.target=async()=>null;
    assert.equal((await f.run()).status,'not_allowed');assert.ok(!f.calls.includes('request'));}
});
test('definitive rejection records failed and retains both setup requirements',async()=>{
  const f=fixture();f.operations.resetAuth=async()=>({status:'rejected'});assert.equal((await f.run()).status,'auth_rejected');
  assert.equal([...f.rows.values()][0].state,'failed');assert.equal(f.state.reset_pending,true);assert.equal(f.state.must_change_password,true);
});
test('unknown/thrown/wrong-user Auth response remains unresolved; next reset cannot write',async()=>{
  for(const mode of ['unknown','throw','wrong']) {const f=fixture();let writes=0;
    f.operations.resetAuth=async()=>{writes++;if(mode==='throw')throw new Error('network');return mode==='wrong'?{status:'succeeded',userId:other}:{status:'unknown'};};
    assert.equal((await f.run()).status,'recovery_required');assert.equal(f.state.unresolved?.state,'unknown');
    assert.equal((await f.run()).status,'recovery_required');assert.equal(writes,1);assert.equal(f.state.generation,'3');}
});
test('lost finalization response retries only the same attestation, never Auth',async()=>{
  const f=fixture();const finish=f.operations.finish;let count=0;
  f.operations.finish=async(...args)=>{const value=await finish(...args);if(++count===1)throw new Error('lost');return value;};
  assert.equal((await f.run()).status,'operation_complete');assert.equal(count,2);assert.equal(f.calls.filter(c=>c==='auth').length,1);
});
test('uncommitted finalization retry is bounded; loss of proof remains blocked',async()=>{
  const f=fixture();let count=0;f.operations.finish=async()=>{count++;throw new Error('unavailable');};
  assert.equal((await f.run()).status,'recovery_required');assert.equal(count,2);assert.equal(f.state.unresolved?.state,'reserved');
  assert.equal((await f.run()).status,'recovery_required');assert.equal(f.calls.filter(c=>c==='auth').length,1);
});
test('two administrative requests before reservation supersede older generation',async()=>{
  const f=fixture();const request=f.operations.request;let second:ReturnType<typeof f.run>|undefined;
  f.operations.request=async(...args)=>{const row=await request(...args);if(!second){second=Promise.resolve({status:'unavailable'});second=f.run();await second;}return row;};
  assert.equal((await f.run()).status,'stale_generation');assert.equal((await second!).status,'operation_complete');assert.equal(f.calls.filter(c=>c==='auth').length,1);
});
test('reset requested during an administrative Auth write cannot compete; earlier success is stale',async()=>{
  const f=fixture();f.operations.resetAuth=async()=>{f.calls.push('auth');assert.equal((await f.run()).status,'recovery_required');return {status:'succeeded',userId:user};};
  assert.equal((await f.run()).status,'stale_generation');assert.equal(f.calls.filter(c=>c==='auth').length,1);assert.equal(f.state.reset_pending,true);
});
test('employee write racing with reset leaves reset pending and does not dispatch',async()=>{
  const f=fixture();f.state.unresolved={user_id:user,operation_id:'40000000-0000-4000-8000-000000000001',generation:'1',kind:'employee_setup',state:'reserved',outcome:null};
  assert.equal((await f.run()).status,'recovery_required');assert.equal(f.state.generation,'2');assert.equal(f.state.reset_pending,true);assert.ok(!f.calls.includes('auth'));
});
test('deactivation or lost reservation after snapshot never dispatches',async()=>{
  for(const mode of ['inactive','lost']){const f=fixture();const reserve=f.operations.reserve;
    f.operations.reserve=async(...args)=>{if(mode==='inactive')f.state.active=false;await reserve(...args);throw new Error('lost');};
    assert.equal((await f.run()).status,'recovery_required');assert.ok(!f.calls.includes('auth'));}
});
test('cross-user and mismatched operation results fail closed',async()=>{
  for(const phase of ['target','request','reserve','finish'] as const){const f=fixture();
    if(phase==='target')f.operations.target=async()=>({userId:other,active:true});
    else if(phase==='request'){const original=f.operations.request;f.operations.request=async(...args)=>({...await original(...args),user_id:other});}
    else if(phase==='reserve'){const original=f.operations.reserve;f.operations.reserve=async(...args)=>({...await original(...args),operation_id:other});}
    else {const original=f.operations.finish;f.operations.finish=async(...args)=>({...await original(...args),generation:'99'});}
    assert.equal((await f.run()).status,'operation_mismatch');if(phase!=='finish')assert.ok(!f.calls.includes('auth'));
  }
});
test('lost atomic reset response retains both requirements without Auth',async()=>{
  const f=fixture();const request=f.operations.request;f.operations.request=async(...args)=>{await request(...args);throw new Error('lost');};
  assert.equal((await f.run()).status,'recovery_required');assert.equal(f.state.reset_pending,true);assert.equal(f.state.must_change_password,true);assert.ok(!f.calls.includes('auth'));
});
