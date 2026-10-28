// Shared orchestration; credentials and Auth clients belong only to the server adapter.
import type { CurrentDoorGoAccess } from '../auth/access';
import type { EmployeeSetupSnapshot, PasswordOperation } from '../auth/employee-password-operation';
import { assertUserAdmin, temporaryPassword, validateUserId } from './users-contract';

export type ResetResult = { status: 'operation_complete' | 'not_allowed' | 'invalid_input'
  | 'unavailable' | 'recovery_required' | 'stale_generation' | 'operation_mismatch' | 'auth_rejected' };
export type ResetOperations = {
  target: (id: string) => Promise<{ userId: string; active: boolean } | null>;
  newOperationId: () => string;
  request: (id: string, operationId: string) => Promise<PasswordOperation>;
  snapshot: (id: string) => Promise<EmployeeSetupSnapshot | null>;
  reserve: (id: string, operationId: string, generation: string) => Promise<PasswordOperation>;
  resetAuth: (id: string, password: string) => Promise<{ status: 'succeeded'; userId: string }
    | { status: 'rejected' | 'unknown' }>;
  finish: (id: string, operationId: string, outcome: 'succeeded' | 'failed' | 'unknown') => Promise<PasswordOperation>;
};

export async function executeAdminPasswordReset(access: CurrentDoorGoAccess, id: string,
  form: FormData, factory: () => ResetOperations): Promise<ResetResult> {
  try { assertUserAdmin(access,true); } catch { return { status: 'not_allowed' }; }
  let password: string;
  try { validateUserId(id); password=temporaryPassword(form); } catch { return { status: 'invalid_input' }; }
  let ops: ResetOperations;
  try {
    ops=factory();
    const target=await ops.target(id);
    if (!target || !target.active) return { status: 'not_allowed' };
    if (target.userId!==id) return { status: 'operation_mismatch' };
  } catch { return { status: 'unavailable' }; }
  const operationId=ops.newOperationId();
  let requested: PasswordOperation;
  try { requested=await ops.request(id,operationId); }
  catch { return { status: 'recovery_required' }; } // Request may have committed. Never guess or redispatch.
  const generation=requested.generation;
  const matches=(op: PasswordOperation) => op.user_id===id && op.operation_id===operationId
    && op.generation===generation && op.kind==='admin_reset';
  if (!matches(requested) || requested.state!=='pending' || requested.outcome!==null) return { status: 'operation_mismatch' };
  try {
    // The reset request atomically sets the profile and internal requirements.
    // Do not issue a separate, generation-unaware profile update here.
    const current=await ops.snapshot(id);
    if (!current || current.user_id!==id) return { status: 'operation_mismatch' };
    if (current.generation!==generation) return { status: 'stale_generation' };
    if (!current.active || !current.must_change_password || !current.setup_required
      || !current.reset_pending || current.unresolved) return { status: 'recovery_required' };
    const reserved=await ops.reserve(id,operationId,generation);
    if (!matches(reserved) || reserved.state!=='reserved' || reserved.outcome!==null) return { status: 'operation_mismatch' };
  } catch { return { status: 'recovery_required' }; }

  let response: Awaited<ReturnType<ResetOperations['resetAuth']>>;
  try { response=await ops.resetAuth(id,password); } catch { response={status:'unknown'}; }
  const outcome=response.status==='rejected' ? 'failed'
    : response.status==='succeeded' && response.userId===id ? 'succeeded' : 'unknown';
  // Only the request that observed Auth's response may repeat this same attestation.
  // No Auth retry, timeout unlock, or automatic reconciliation, even after process loss.
  for (let attempt=0; attempt<2; attempt++) {
    try {
      const settled=await ops.finish(id,operationId,outcome);
      if (!matches(settled)) return { status: 'operation_mismatch' };
      if (outcome==='unknown') return { status: 'recovery_required' };
      if (settled.state==='superseded') return { status: 'stale_generation' };
      if (settled.state!==outcome || settled.outcome!==outcome) return { status: 'recovery_required' };
      const current=await ops.snapshot(id);
      if (!current || current.user_id!==id) return { status: 'operation_mismatch' };
      if (current.generation!==generation) return { status: 'stale_generation' };
      if (!current.active || !current.must_change_password || !current.setup_required || current.unresolved
        || current.reset_pending!==(outcome==='failed')) return { status: 'recovery_required' };
      return { status: outcome==='succeeded' ? 'operation_complete' : 'auth_rejected' };
    } catch { /* Bounded retry uses the SAME operation and observed outcome only. */ }
  }
  return { status: 'recovery_required' };
}
