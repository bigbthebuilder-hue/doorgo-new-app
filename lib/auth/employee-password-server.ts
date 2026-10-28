import 'server-only';
import { randomUUID } from 'node:crypto';
import { isAuthApiError, isAuthWeakPasswordError } from '@supabase/supabase-js';
import { createAuthenticatedSupabaseServerClient } from '../supabase/server';
import { createTrustedReadOnlySupabaseClient } from '../supabase/trusted-read-server';
import { getPublicSupabaseEnvironment } from '../supabase/public-env';
import { executeEmployeePasswordOperation, parseEmployeeSnapshot, parsePasswordOperation,
  type EmployeeSetupResult } from './employee-password-operation';

// Connected server boundary; deployment requires the coordinated SQL cutover.
// Never fall back to legacy completion or an unreserved Auth write.
export async function runEmployeePasswordSetup(form: FormData): Promise<EmployeeSetupResult> {
  try {
    const authenticated = await createAuthenticatedSupabaseServerClient();
    let verifiedUserId: string | null = null;
    let trusted: ReturnType<typeof createTrustedReadOnlySupabaseClient> | undefined;
    async function rpc(name: string, userId: string, args: Record<string, unknown> = {}) {
      if (!verifiedUserId || verifiedUserId !== userId) throw new Error('Password operation identity mismatch');
      const authUrl = new URL(getPublicSupabaseEnvironment().url).href.replace(/\/$/,'');
      const trustedUrl = new URL(process.env.SUPABASE_URL ?? '').href.replace(/\/$/,'');
      if (authUrl !== trustedUrl) throw new Error('Password operation project mismatch');
      trusted ??= createTrustedReadOnlySupabaseClient();
      const { data, error } = await trusted.rpc(name, { ...args, p_user_id: verifiedUserId });
      if (error) throw new Error('Password operation unavailable');
      return data as unknown;
    }
    return await executeEmployeePasswordOperation(form, {
      async getUser() {
        const { data, error } = await authenticated.auth.getUser();
        if (error || !data.user) return null;
        verifiedUserId = data.user.id;
        return { id: verifiedUserId };
      },
      async snapshot(userId) { return parseEmployeeSnapshot(await rpc('dg_password_employee_snapshot',userId)); },
      newOperationId: randomUUID,
      async reserve(userId,operationId,generation) {
        return parsePasswordOperation(await rpc('dg_password_reserve',userId, {
          p_operation_id: operationId, p_generation: generation, p_kind: 'employee_setup',
        }));
      },
      async updatePassword(password) {
        const { data, error } = await authenticated.auth.updateUser({ password });
        if (!error && data.user) return { status: 'succeeded', userId: data.user.id };
        // Only explicit provider password-validation rejections are definitive here.
        // Timeout, network, 5xx, missing response and all other errors remain unknown.
        if ((isAuthApiError(error) || isAuthWeakPasswordError(error))
          && (error.status === 400 || error.status === 422)
          && (error.code === 'same_password' || error.code === 'weak_password')) return { status: 'rejected' };
        return { status: 'unknown' };
      },
      async finish(userId,operationId,outcome) {
        return parsePasswordOperation(await rpc('dg_password_finish',userId, {
          p_operation_id: operationId, p_outcome: outcome,
        }));
      },
    });
  } catch { return { status: 'unavailable' }; }
}
