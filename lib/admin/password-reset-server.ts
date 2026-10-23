import 'server-only';
import { randomUUID } from 'node:crypto';
import { isAuthApiError, isAuthWeakPasswordError } from '@supabase/supabase-js';
import { getCurrentDoorGoAccess } from '../auth/current-access';
import { parseEmployeeSnapshot, parsePasswordOperation } from '../auth/employee-password-operation';
import { createAuthenticatedSupabaseServerClient } from '../supabase/server';
import { createTrustedReadOnlySupabaseClient } from '../supabase/trusted-read-server';
import { getPublicSupabaseEnvironment } from '../supabase/public-env';
import { executeAdminPasswordReset, type ResetResult } from './password-reset-operation';

function profile(value: unknown): { userId: string; active: boolean; mustChangePassword: boolean } {
  if (!value || typeof value!=='object' || !('userId' in value) || typeof value.userId!=='string'
    || !('active' in value) || typeof value.active!=='boolean'
    || !('mustChangePassword' in value) || typeof value.mustChangePassword!=='boolean') throw new Error('Invalid profile');
  return {userId:value.userId,active:value.active,mustChangePassword:value.mustChangePassword};
}

// INACTIVE. No action/UI callers or 'use server' directive; no feature flag.
// Do not wire before legacy writers, completion authority and business gates are coordinated.
export async function runInactiveAdminPasswordReset(id: string, form: FormData): Promise<ResetResult> {
  try {
    const access=await getCurrentDoorGoAccess(); // auth.getUser + current profile/permissions
    const authenticated=await createAuthenticatedSupabaseServerClient();
    return await executeAdminPasswordReset(access,id,form,()=> {
      const publicUrl=new URL(getPublicSupabaseEnvironment().url).href.replace(/\/$/,'');
      if (publicUrl!==new URL(process.env.SUPABASE_URL ?? '').href.replace(/\/$/,'')) throw new Error('Project mismatch');
      let trusted: ReturnType<typeof createTrustedReadOnlySupabaseClient> | undefined;
      const client=()=> trusted ??= createTrustedReadOnlySupabaseClient();
      async function rpc(name: string,args: Record<string,unknown>) {
        const {data,error}=await client().rpc(name,{...args,p_user_id:id});
        if (error) throw new Error('Password operation unavailable');
        return data as unknown;
      }
      return {
        async target() {
          const {data,error}=await authenticated.rpc('dg_admin_list_users');
          if (error || !Array.isArray(data)) throw new Error('User lookup unavailable');
          const found=data.map(profile).find(user=>user.userId===id);
          return found ?? null;
        },
        newOperationId:randomUUID,
        async request(_user,operationId) { return parsePasswordOperation(await rpc('dg_password_request_reset',{p_operation_id:operationId})); },
        async snapshot() { return parseEmployeeSnapshot(await rpc('dg_password_employee_snapshot',{})); },
        async reserve(_user,operationId,generation) { return parsePasswordOperation(await rpc('dg_password_reserve',{
          p_operation_id:operationId,p_generation:generation,p_kind:'admin_reset',
        })); },
        async resetAuth(_user,password) {
          const {data,error}=await client().auth.admin.updateUserById(id,{password});
          if (!error && data.user) return {status:'succeeded',userId:data.user.id};
          if ((isAuthApiError(error) || isAuthWeakPasswordError(error)) && (error.status===400 || error.status===422)
            && (error.code==='same_password' || error.code==='weak_password')) return {status:'rejected'};
          return {status:'unknown'};
        },
        async finish(_user,operationId,outcome) { return parsePasswordOperation(await rpc('dg_password_finish',{
          p_operation_id:operationId,p_outcome:outcome,
        })); },
      };
    });
  } catch { return {status:'unavailable'}; }
}
