import 'server-only';
import { getCurrentDoorGoAccess } from '../auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '../supabase/server';
import { createTrustedReadOnlySupabaseClient } from '../supabase/trusted-read-server';
import { getPublicSupabaseEnvironment } from '../supabase/public-env';
import { assertUserAdmin, validateUserId } from './users-contract';

// No Auth write: access denial must not depend on an external password operation.
export async function runEmployeeDeactivation(id: string): Promise<{ ok: boolean }> {
  try {
    const access = await getCurrentDoorGoAccess();
    assertUserAdmin(access, true);
    validateUserId(id);
    if (access.user?.id === id) return { ok: false };
    const authenticated = await createAuthenticatedSupabaseServerClient();
    const { data, error } = await authenticated.rpc('dg_admin_list_users');
    if (error || !Array.isArray(data) || !data.some(user => user?.userId === id)) return { ok: false };
    const publicUrl = new URL(getPublicSupabaseEnvironment().url).href.replace(/\/$/, '');
    if (publicUrl !== new URL(process.env.SUPABASE_URL ?? '').href.replace(/\/$/, '')) return { ok: false };
    const trusted = createTrustedReadOnlySupabaseClient();
    const result = await trusted.rpc('dg_password_deactivate', { p_user_id: id });
    const generation = typeof result.data === 'string' ? /^[1-9][0-9]*$/.test(result.data)
      : typeof result.data === 'number' && Number.isSafeInteger(result.data) && result.data > 0;
    return { ok: !result.error && generation };
  } catch { return { ok: false }; }
}
