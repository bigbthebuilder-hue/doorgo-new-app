'use server';

import { redirect } from 'next/navigation';
import {
  executePasswordLogin,
  getFailedLoginState,
  readLoginCredentials,
  type LoginFormState,
} from '@/lib/auth/login';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { protectedLandingDestination } from '@/lib/app-shell/navigation';

export async function loginAction(
  previousState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const credentials = readLoginCredentials(formData);
  if (!credentials) {
    return getFailedLoginState(previousState);
  }

  try {
    const supabase = await createAuthenticatedSupabaseServerClient();
    const authenticated = await executePasswordLogin(credentials, {
      async signInWithPassword(values) {
        const { error } = await supabase.auth.signInWithPassword(values);
        return { error };
      },
      async verifyUser() {
        const { data, error } = await supabase.auth.getUser();
        return { user: data.user, error };
      },
      async signOutLocal() {
        await supabase.auth.signOut({ scope: 'local' });
      },
    });
    if (!authenticated) {
      return getFailedLoginState(previousState);
    }
  } catch {
    return getFailedLoginState(previousState);
  }

  redirect(protectedLandingDestination(await getCurrentDoorGoAccess()));
}
