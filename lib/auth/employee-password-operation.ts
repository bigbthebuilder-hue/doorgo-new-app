// Inactive orchestration contract. No credentials or live clients in this module.
import { validateNewPasswordForm } from './password-setup';

export type PasswordOperation = {
  operation_id: string;
  user_id: string;
  generation: string;
  kind: 'employee_setup' | 'admin_reset';
  state: 'pending' | 'reserved' | 'unknown' | 'succeeded' | 'failed' | 'superseded';
  outcome: 'succeeded' | 'failed' | null;
};
export type EmployeeSetupSnapshot = {
  user_id: string;
  active: boolean;
  must_change_password: boolean;
  generation: string;
  setup_required: boolean;
  reset_pending: boolean;
  unresolved: PasswordOperation | null;
  completion: PasswordOperation | null;
};
export type EmployeeSetupResult = {
  status: 'operation_complete' | 'unavailable' | 'not_allowed' | 'validation_error'
    | 'auth_rejected' | 'recovery_required' | 'stale_generation' | 'operation_mismatch';
  message?: string;
};
export type EmployeeSetupOperations = {
  getUser: () => Promise<{ id: string } | null>;
  snapshot: (userId: string) => Promise<EmployeeSetupSnapshot | null>;
  newOperationId: () => string;
  reserve: (userId: string, operationId: string, generation: string) => Promise<PasswordOperation>;
  updatePassword: (password: string) => Promise<
    { status: 'succeeded'; userId: string } | { status: 'rejected' | 'unknown' }>;
  finish: (userId: string, operationId: string, outcome: 'succeeded' | 'failed' | 'unknown') => Promise<PasswordOperation>;
};

function matches(op: PasswordOperation, userId: string, id: string, generation: string) {
  return op.user_id === userId && op.operation_id === id && op.generation === generation && op.kind === 'employee_setup';
}
function completed(s: EmployeeSetupSnapshot, userId: string, id?: string) {
  const op = s.completion;
  return s.active && s.must_change_password && !s.setup_required && !s.reset_pending && !s.unresolved
    && op !== null && matches(op,userId,id ?? op.operation_id,s.generation)
    && op.state === 'succeeded' && op.outcome === 'succeeded';
}

export async function executeEmployeePasswordOperation(
  form: FormData, operations: EmployeeSetupOperations,
): Promise<EmployeeSetupResult> {
  let user: { id: string } | null;
  let snapshot: EmployeeSetupSnapshot | null;
  try {
    user = await operations.getUser();
    if (!user) return { status: 'not_allowed' };
    snapshot = await operations.snapshot(user.id);
  } catch { return { status: 'unavailable' }; }
  if (!snapshot || !snapshot.active || !snapshot.must_change_password) return { status: 'not_allowed' };
  if (snapshot.user_id !== user.id) return { status: 'operation_mismatch' };
  // A durable current-generation receipt permits a later request/session to recover
  // without resubmitting a password. Login or a false setup flag alone is not proof.
  if (completed(snapshot,user.id)) return { status: 'operation_complete' };
  if (snapshot.unresolved || snapshot.reset_pending || !snapshot.setup_required) return { status: 'recovery_required' };
  const validation = validateNewPasswordForm(form);
  if (!validation.valid) return { status: 'validation_error', message: validation.message };
  const generation = snapshot.generation;
  const id = operations.newOperationId();
  let reserved: PasswordOperation;
  try { reserved = await operations.reserve(user.id,id,generation); }
  catch {
    // A lost reservation response is NOT permission to dispatch or reserve again.
    try {
      const current = await operations.snapshot(user.id);
      if (current?.user_id === user.id && current.generation !== generation) return { status: 'stale_generation' };
    } catch { /* Retain the possibly committed reservation. */ }
    return { status: 'recovery_required' };
  }
  if (!matches(reserved,user.id,id,generation) || reserved.state !== 'reserved' || reserved.outcome !== null) {
    return { status: 'operation_mismatch' };
  }

  let updated: Awaited<ReturnType<EmployeeSetupOperations['updatePassword']>>;
  try { updated = await operations.updatePassword(validation.password); }
  catch { updated = { status: 'unknown' }; }
  if (updated.status !== 'succeeded' || updated.userId !== user.id) {
    const outcome = updated.status === 'rejected' ? 'failed' : 'unknown';
    try {
      const settled = await operations.finish(user.id,id,outcome);
      if (outcome === 'failed' && matches(settled,user.id,id,generation)
        && settled.state === 'failed' && settled.outcome === 'failed') return { status: 'auth_rejected' };
    } catch { /* Reservation remains blocked when recording the outcome fails. */ }
    return { status: 'recovery_required' };
  }

  // Only this request has observed successful Auth proof. Retry the SAME finalization
  // once, never the Auth write. A later request must rely on a durable receipt instead.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const settled = await operations.finish(user.id,id,'succeeded');
      if (!matches(settled,user.id,id,generation)) return { status: 'operation_mismatch' };
      if (settled.state === 'superseded') return { status: 'stale_generation' };
      if (settled.state !== 'succeeded' || settled.outcome !== 'succeeded') return { status: 'recovery_required' };
    } catch { /* Read committed state before deciding whether a retry is safe. */ }
    try {
      const current = await operations.snapshot(user.id);
      if (!current || current.user_id !== user.id) return { status: 'operation_mismatch' };
      if (current.generation !== generation) return { status: 'stale_generation' };
      if (completed(current,user.id,id)) return { status: 'operation_complete' };
      const unresolved = current.unresolved;
      if (!current.active || !current.must_change_password || current.reset_pending
        || !unresolved || !matches(unresolved,user.id,id,generation) || unresolved.state !== 'reserved') {
        return { status: 'recovery_required' };
      }
    } catch { return { status: 'recovery_required' }; }
  }
  return { status: 'recovery_required' };
}

// Strict RPC response parsing: fail closed instead of coercing malformed authority.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid password operation response');
  return value as Record<string, unknown>;
}
function identifier(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Invalid operation identity');
  return value;
}
function generation(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value);
  if (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) return value;
  throw new Error('Invalid operation generation');
}
function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Invalid operation state');
  return value;
}
export function parsePasswordOperation(value: unknown): PasswordOperation {
  const r = record(value);
  if (r.kind !== 'employee_setup' && r.kind !== 'admin_reset') throw new Error('Invalid operation kind');
  if (typeof r.state !== 'string' || !['pending','reserved','unknown','succeeded','failed','superseded'].includes(r.state)
    || ![null,'succeeded','failed'].includes(r.outcome as string | null)) throw new Error('Invalid operation outcome');
  return { user_id: identifier(r.user_id), operation_id: identifier(r.operation_id), generation: generation(r.generation),
    kind: r.kind, state: r.state as PasswordOperation['state'], outcome: r.outcome as PasswordOperation['outcome'] };
}
export function parseEmployeeSnapshot(value: unknown): EmployeeSetupSnapshot | null {
  if (value === null) return null;
  const r = record(value);
  return { user_id: identifier(r.user_id), generation: generation(r.generation), active: boolean(r.active),
    must_change_password: boolean(r.must_change_password), setup_required: boolean(r.setup_required),
    reset_pending: boolean(r.reset_pending), unresolved: r.unresolved === null ? null : parsePasswordOperation(r.unresolved),
    completion: r.completion === null ? null : parsePasswordOperation(r.completion) };
}
