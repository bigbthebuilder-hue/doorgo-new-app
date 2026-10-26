import 'server-only';
import { getCurrentDoorGoAccess } from '../auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '../supabase/server';
import { createTrustedReadOnlySupabaseClient } from '../supabase/trusted-read-server';
import { getPublicSupabaseEnvironment } from '../supabase/public-env';
import { assertUserAdmin, validateUserId } from './users-contract';

// INACTIVE: no actions/UI import this module. No password is accepted or dispatched.
// Requires coordinated legacy writers and business gates before activation.
export async function runInactiveRequirePasswordChange(id: string): Promise<{ ok: boolean }> {
  try {
    const access = await getCurrentDoorGoAccess(); // Verified auth.getUser + current permissions.
    assertUserAdmin(access, true);
    validateUserId(id);
    const authenticated = await createAuthenticatedSupabaseServerClient();
    const { data: users, error: lookupError } = await authenticated.rpc('dg_admin_list_users');
    if (lookupError || !Array.isArray(users)
      || !users.some(user => user && user.userId === id && user.active === true)) return { ok: false };
    const publicUrl = new URL(getPublicSupabaseEnvironment().url).href.replace(/\/$/, '');
    if (publicUrl !== new URL(process.env.SUPABASE_URL ?? '').href.replace(/\/$/, '')) return { ok: false };
    const trusted = createTrustedReadOnlySupabaseClient();
    const { data, error } = await trusted.rpc('dg_password_require_change', { p_user_id: id });
    // Never retry automatically after a lost response; another deliberate request is safe.
    const generation = typeof data === 'string' ? /^[1-9][0-9]*$/.test(data)
      : typeof data === 'number' && Number.isSafeInteger(data) && data > 0;
    return { ok: !error && generation };
  } catch { return { ok: false }; }
}
