import 'server-only';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  resolveCurrentDoorGoAccess,
  type CurrentDoorGoAccess,
} from './access';

export async function getCurrentAuthenticatedUser() {
  const supabase = await createAuthenticatedSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

export async function getCurrentDoorGoAccess(): Promise<CurrentDoorGoAccess> {
  const supabase = await createAuthenticatedSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return resolveCurrentDoorGoAccess({ user: null, profile: null });
  }

  const { data: profile, error: profileError } = await supabase
    .from('dg_user_profiles')
    .select(
      'user_id, display_name, active, is_manager, company_location, must_change_password',
    )
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error('Current DoorGo profile could not be loaded.');
  }

  if (!profile) {
    return resolveCurrentDoorGoAccess({
      user: { id: userData.user.id, email: userData.user.email },
      profile: null,
    });
  }

  const { data: permissionRows, error: permissionError } = await supabase
    .from('dg_user_permissions')
    .select('permission_key, access_level')
    .eq('user_id', userData.user.id);

  if (permissionError) {
    throw new Error('Current DoorGo permissions could not be loaded.');
  }

  return resolveCurrentDoorGoAccess({
    user: { id: userData.user.id, email: userData.user.email },
    profile,
    permissionRows: permissionRows ?? [],
  });
}
