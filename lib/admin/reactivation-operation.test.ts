import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CurrentDoorGoAccess } from '../auth/access';
import type { EmployeeSetupSnapshot, PasswordOperation } from '../auth/employee-password-operation';
import { executeReactivation, type ReactivationOperations } from './reactivation-operation';

const user='20000000-0000-4000-8000-000000000001';
const other='20000000-0000-4000-8000-000000000002';
function access(): CurrentDoorGoAccess & {state:'active'} { return {state:'active',user:{id:other,email:null},
  profile:{userId:other,displayName:'Admin',active:true,isManager:false,companyLocation:null,mustChangePassword:false},permissions:{users:'use'}}; }
function form(password='synthetic temporary password') { const f=new FormData(); f.set('newPassword',password); f.set('confirmPassword',password); return f; }
// Mock state transitions for orchestration tests, NOT database concurrency proof.
function fixture() {
  const state: EmployeeSetupSnapshot={user_id:user,active:false,must_change_password:false,generation:'1',setup_required:false,reset_pending:false,unresolved:null,completion:null};
  const rows=new Map<string,PasswordOperation>(); const calls:string[]=[]; let sequence=0;
  const operations: ReactivationOperations={
    async target(id) { calls.push('target'); assert.equal(id,user); return {userId:user,active:state.active}; },
    newOperationId() { return `30000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`; },
    async request(id,operationId) {
      calls.push('request'); assert.equal(id,user);
      state.generation=String(Number(state.generation)+1); state.setup_required=true; state.reset_pending=true; state.must_change_password=true;
      for(const row of rows.values()) if(row.state==='pending')row.state='superseded';
      const row:PasswordOperation={user_id:id,operation_id:operationId,generation:state.generation,kind:'reactivation',state:'pending',outcome:null};
      rows.set(operationId,row); return structuredClone(row);
    },
    async snapshot(id) { assert.equal(id,user); calls.push('snapshot'); return structuredClone(state); },
    async reserve(id,operationId,generation) {
      calls.push('reserve'); const row=rows.get(operationId)!;
      if(state.active || state.unresolved || generation!==state.generation || row.state!=='pending' || row.user_id!==id)throw new Error('Denied');
      row.state='reserved'; state.unresolved=row; return structuredClone(row);
    },
    async resetAuth(id,password) { calls.push('auth'); assert.equal(id,user); assert.equal(password,'synthetic temporary password'); return {status:'succeeded',userId:id}; },
    async finish(id,operationId,outcome) {
      calls.push('finish:'+outcome); const row=rows.get(operationId)!; assert.equal(row.user_id,id);
      if(row.state==='succeeded' || row.state==='failed' || row.state==='superseded') {assert.equal(row.outcome,outcome);return structuredClone(row);}
      if(row.state==='unknown' && outcome!=='unknown')throw new Error('Reconciliation required');
      if(outcome==='unknown') {row.state='unknown';return structuredClone(row);}
      row.state=outcome==='succeeded' && (row.generation!==state.generation || state.active)?'superseded':outcome;
      row.outcome=outcome;state.unresolved=null;
      if(row.state==='succeeded'){state.reset_pending=false;state.active=true;}
      return structuredClone(row);
    },
  };
  return {state,rows,calls,operations,run:(a:CurrentDoorGoAccess=access(),f=form(),id=user)=>executeReactivation(a,id,f,()=>{calls.push('factory');return operations;})};
}
test('reactivation reserves while inactive; only confirmed success activates with setup required',async()=>{
  const f=fixture();f.operations.resetAuth=async()=>{assert.equal(f.state.active,false);return {status:'succeeded',userId:user};};
  assert.equal((await f.run()).status,'operation_complete');
  assert.equal(f.state.active,true);assert.equal(f.state.must_change_password,true);assert.equal(f.state.setup_required,true);
  assert.equal(f.state.reset_pending,false);assert.equal(f.state.generation,'2');
  assert.equal((await f.run()).status,'not_allowed');
});
test('unauthorized or setup-required actor cannot obtain operations',async()=>{
  for(const a of [{...access(),permissions:{users:'view' as const}}, {...access(),profile:{...access().profile,mustChangePassword:true}}]){
    const f=fixture();assert.equal((await f.run(a)).status,'not_allowed');assert.deepEqual(f.calls,[]);
  }
});
test('active/missing target and invalid password rejected before request',async()=>{
  const f=fixture();f.state.active=true;assert.equal((await f.run()).status,'not_allowed');assert.ok(!f.calls.includes('request'));
  f.operations.target=async()=>null;assert.equal((await f.run()).status,'not_allowed');
  assert.equal((await fixture().run(access(),form('short'))).status,'invalid_input');
});
test('definitive failure stays inactive; unknown and thrown responses retain reservation',async()=>{
  for(const outcome of ['rejected','unknown','throw'] as const){const f=fixture();
    f.operations.resetAuth=async()=>{f.calls.push('auth');if(outcome==='throw')throw new Error('transport');return {status:outcome};};
    assert.equal((await f.run()).status,outcome==='rejected'?'auth_rejected':'recovery_required');
    assert.equal(f.state.active,false);assert.equal(f.state.must_change_password,true);
    assert.equal(f.calls.filter(c=>c==='auth').length,1);
    if(outcome!=='rejected'){assert.equal(f.state.unresolved?.state,'unknown');assert.equal((await f.run()).status,'recovery_required');}
  }
});
test('deactivation during Auth makes older success stale',async()=>{
  const f=fixture();f.operations.resetAuth=async()=>{f.state.generation='3';f.state.active=false;f.state.reset_pending=false;return {status:'succeeded',userId:user};};
  assert.equal((await f.run()).status,'stale_generation');assert.equal(f.state.active,false);
});
test('lost successful finalization response retries only attestation, not Auth',async()=>{
  const f=fixture(),finish=f.operations.finish;let lost=true;
  f.operations.finish=async(...args)=>{const result=await finish(...args);if(lost){lost=false;throw new Error('lost');}return result;};
  assert.equal((await f.run()).status,'operation_complete');assert.equal(f.calls.filter(c=>c==='auth').length,1);
});
test('lost reservation response never dispatches Auth',async()=>{
  const f=fixture(),reserve=f.operations.reserve;f.operations.reserve=async(...args)=>{await reserve(...args);throw new Error('lost');};
  assert.equal((await f.run()).status,'recovery_required');assert.ok(!f.calls.includes('auth'));assert.equal(f.state.active,false);
});
test('cross-user Auth result remains unknown and cannot activate',async()=>{
  const f=fixture();f.operations.resetAuth=async()=>({status:'succeeded',userId:other});
  assert.equal((await f.run()).status,'recovery_required');assert.equal(f.state.active,false);assert.equal(f.state.unresolved?.state,'unknown');
});
