import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeEmployeePasswordOperation, parseEmployeeSnapshot, parsePasswordOperation,
  type EmployeeSetupOperations, type EmployeeSetupSnapshot, type PasswordOperation } from './employee-password-operation';

const userId = '20000000-0000-4000-8000-000000000001';
const otherId = '20000000-0000-4000-8000-000000000002';
function form(password = 'valid new passphrase') {
  const f = new FormData(); f.set('newPassword',password); f.set('confirmPassword',password); return f;
}
function fixture() {
  const state: EmployeeSetupSnapshot = { user_id: userId, active: true, must_change_password: true,
    generation: '1', setup_required: true, reset_pending: false, unresolved: null, completion: null };
  const calls: string[] = [];
  let sequence = 0;
  const operations: EmployeeSetupOperations = {
    async getUser() { calls.push('identity'); return { id: userId }; },
    async snapshot(id) { assert.equal(id,userId); calls.push('snapshot'); return structuredClone(state); },
    newOperationId() { return `10000000-0000-4000-8000-${String(++sequence).padStart(12,'0')}`; },
    async reserve(id,opId,generation) {
      calls.push('reserve'); assert.equal(id,userId);
      if (generation !== state.generation || state.unresolved) throw new Error('Reservation denied');
      state.unresolved = { user_id: id, operation_id: opId, generation, kind: 'employee_setup', state: 'reserved', outcome: null };
      return structuredClone(state.unresolved);
    },
    async updatePassword(password) { calls.push('auth'); assert.equal(password,'valid new passphrase'); return { status: 'succeeded', userId }; },
    async finish(id,opId,outcome) {
      calls.push(`finish:${outcome}`); assert.equal(id,userId);
      const op = state.unresolved ?? state.completion;
      assert.ok(op); assert.equal(op.operation_id,opId);
      if (outcome === 'unknown') { op.state = 'unknown'; return structuredClone(op); }
      op.state = outcome === 'succeeded' && op.generation !== state.generation ? 'superseded' : outcome;
      op.outcome = outcome; state.unresolved = null;
      if (op.state === 'succeeded') { state.setup_required = false; state.completion = op; }
      return structuredClone(op);
    },
  };
  return { state, calls, operations, run: (f = form()) => executeEmployeePasswordOperation(f,operations) };
}

test('verified identity -> reservation -> Auth -> trusted finalization; profile flag unchanged', async () => {
  const f = fixture(); assert.deepEqual(await f.run(),{ status: 'operation_complete' });
  assert.deepEqual(f.calls,['identity','snapshot','reserve','auth','finish:succeeded','snapshot']);
  assert.equal(f.state.must_change_password,true);
});
test('definitive Auth rejection settles failed and permits a new operation', async () => {
  const f = fixture(); f.operations.updatePassword = async () => ({ status: 'rejected' });
  assert.equal((await f.run()).status,'auth_rejected'); assert.equal(f.state.unresolved,null);
  assert.ok(!f.calls.includes('finish:succeeded')); assert.equal(f.state.setup_required,true);
});
test('lost committed finalization response is recovered from a durable receipt', async () => {
  const f = fixture(), finish = f.operations.finish;
  f.operations.finish = async (...args) => { await finish(...args); throw new Error('Lost response'); };
  assert.equal((await f.run()).status,'operation_complete');
  assert.equal(f.calls.filter(c => c === 'auth').length,1);
  // New request/session: no password or client operation token is required.
  assert.equal((await f.run(new FormData())).status,'operation_complete');
  assert.equal(f.calls.filter(c => c === 'auth').length,1);
});
test('uncommitted finalization retries same operation only while this request retains Auth proof', async () => {
  const f = fixture(), finish = f.operations.finish; let attempts = 0;
  f.operations.finish = async (...args) => { if (++attempts === 1) throw new Error('Transport'); return finish(...args); };
  assert.equal((await f.run()).status,'operation_complete'); assert.equal(attempts,2);
  assert.equal(f.calls.filter(c => c === 'auth').length,1);
});
test('lost proof cannot be reconstructed on a later request', async () => {
  const f = fixture(); f.operations.finish = async () => { throw new Error('Offline'); };
  assert.equal((await f.run()).status,'recovery_required');
  assert.equal((await f.run()).status,'recovery_required');
  assert.equal(f.calls.filter(c => c === 'auth').length,1);
});
test('unknown/thrown Auth outcomes remain blocked and never infer success', async () => {
  for (const throws of [false,true]) {
    const f = fixture(); f.operations.updatePassword = async () => { if (throws) throw new Error('Timeout'); return { status: 'unknown' }; };
    assert.equal((await f.run()).status,'recovery_required'); assert.equal(f.state.unresolved?.state,'unknown');
    assert.equal((await f.run()).status,'recovery_required'); assert.ok(!f.calls.includes('finish:succeeded'));
  }
});
test('stale generation before reservation prevents Auth', async () => {
  const f = fixture(); f.operations.reserve = async () => { f.state.generation='2'; throw new Error('Stale'); };
  assert.equal((await f.run()).status,'stale_generation'); assert.ok(!f.calls.includes('auth'));
});
test('reset during Auth makes success stale rather than completing new generation', async () => {
  const f = fixture(); f.operations.updatePassword = async () => { f.state.generation='2'; f.state.reset_pending=true; return { status: 'succeeded',userId }; };
  assert.equal((await f.run()).status,'stale_generation'); assert.equal(f.state.setup_required,true);
});
test('incorrect snapshot user or reservation identity never dispatches Auth', async () => {
  const f = fixture(); f.state.user_id=otherId;
  assert.equal((await f.run()).status,'operation_mismatch'); assert.ok(!f.calls.includes('reserve'));
  for (const field of ['user_id','operation_id','generation','kind'] as const) {
    const g = fixture(), reserve=g.operations.reserve;
    g.operations.reserve = async (...args) => ({ ...await reserve(...args), [field]: field === 'generation' ? '2' : field === 'kind' ? 'admin_reset' : otherId });
    assert.equal((await g.run()).status,'operation_mismatch'); assert.ok(!g.calls.includes('auth'));
  }
});
test('mismatched Auth user is unknown, not attested success', async () => {
  const f = fixture(); f.operations.updatePassword = async () => ({ status: 'succeeded',userId:otherId });
  assert.equal((await f.run()).status,'recovery_required'); assert.equal(f.state.unresolved?.state,'unknown');
});
test('mismatched finalization response is rejected', async () => {
  const f = fixture(), finish=f.operations.finish;
  f.operations.finish = async (...args) => ({ ...await finish(...args),operation_id:otherId });
  assert.equal((await f.run()).status,'operation_mismatch');
});
test('overlapping submissions dispatch Auth at most once', async () => {
  const f = fixture(); let release!: () => void, entered!: () => void;
  const started = new Promise<void>(r => { entered=r; });
  const pending = new Promise<void>(r => { release=r; });
  f.operations.updatePassword = async () => { f.calls.push('auth'); entered(); await pending; return { status: 'succeeded',userId }; };
  const first=f.run(); await started;
  assert.equal((await f.run()).status,'recovery_required'); release();
  assert.equal((await first).status,'operation_complete'); assert.equal(f.calls.filter(c => c==='auth').length,1);
});
test('lost reservation response never permits redispatch', async () => {
  const f = fixture(), reserve=f.operations.reserve;
  f.operations.reserve = async (...args) => { await reserve(...args); throw new Error('Lost reservation'); };
  assert.equal((await f.run()).status,'recovery_required'); assert.equal((await f.run()).status,'recovery_required');
  assert.ok(!f.calls.includes('auth'));
});
test('unauthenticated, missing, inactive or no-longer-required accounts cannot reserve', async () => {
  const anonymous=fixture(); anonymous.operations.getUser=async()=>null;
  assert.equal((await anonymous.run()).status,'not_allowed'); assert.deepEqual(anonymous.calls,[]);
  const missing=fixture(); missing.operations.snapshot=async()=>null;
  assert.equal((await missing.run()).status,'not_allowed');
  for (const field of ['active','must_change_password'] as const) {
    const f=fixture(); f.state[field]=false;
    assert.equal((await f.run()).status,'not_allowed'); assert.ok(!f.calls.includes('reserve'));
  }
});
test('flags, login, and malformed receipts alone do not prove completion', async () => {
  const f=fixture(); f.state.setup_required=false;
  assert.equal((await f.run()).status,'recovery_required');
  f.state.completion={user_id:otherId,operation_id:otherId,generation:'1',kind:'employee_setup',state:'succeeded',outcome:'succeeded'};
  assert.equal((await f.run()).status,'recovery_required');
});
test('existing password validation runs before reserving', async () => {
  for (const value of ['', 'short', 'x'.repeat(257)]) {
    const f=fixture(); assert.equal((await f.run(form(value))).status,'validation_error'); assert.ok(!f.calls.includes('reserve'));
  }
  const f=fixture(), mismatched=form(); mismatched.set('confirmPassword','different');
  assert.equal((await f.run(mismatched)).status,'validation_error');
});
test('RPC parsing rejects malformed data and unsafe numeric generations', () => {
  const f=fixture(); assert.deepEqual(parseEmployeeSnapshot(f.state),f.state);
  assert.throws(()=>parseEmployeeSnapshot({...f.state,active:'true'}));
  assert.throws(()=>parseEmployeeSnapshot({...f.state,generation:Number.MAX_SAFE_INTEGER+1}));
  assert.throws(()=>parsePasswordOperation({user_id:userId}));
  const op: PasswordOperation={user_id:userId,operation_id:otherId,generation:'1',kind:'employee_setup',state:'reserved',outcome:null};
  assert.deepEqual(parsePasswordOperation({...op,generation:1}),op);
});
