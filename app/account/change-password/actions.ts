'use server';

import { redirect } from 'next/navigation';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import {
  executeInitialPasswordSetup,
  validateNewPasswordForm,
  type PasswordSetupState,
} from '@/lib/auth/password-setup';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

export async function changeInitialPasswordAction(
  previousState: PasswordSetupState,
  formData: FormData,
): Promise<PasswordSetupState> {
  const resetKey = previousState.resetKey + 1;
  const access = await getCurrentDoorGoAccess();
  if (access.state === 'unauthenticated') {
    redirect('/login');
  }
  if (access.state !== 'active' || !access.profile.mustChangePassword) {
    return {
      status: 'operational_error',
      message: 'Password setup is not available for this account.',
      resetKey,
    };
  }

  const validation = validateNewPasswordForm(formData);
  if (!validation.valid) {
    return {
      status: 'validation_error',
      message: validation.message,
      resetKey,
    };
  }

  try {
    const supabase = await createAuthenticatedSupabaseServerClient();
    const result = await executeInitialPasswordSetup(validation.password, {
      async updatePassword(password) {
        const { error } = await supabase.auth.updateUser({ password });
        return { error };
      },
      async completeProfileSetup() {
        const { error } = await supabase.rpc(
          'complete_dg_initial_password_setup',
        );
        return { error };
      },
    });

    if (result === 'password_update_failed') {
      return {
        status: 'operational_error',
        message: 'Password setup could not be completed. Please try again.',
        resetKey,
      };
    }
    if (result === 'profile_completion_failed') {
      return {
        status: 'partial_success',
        message:
          'Your password was changed, but setup could not be finalized. Sign in with your new password and try again.',
        resetKey,
      };
    }
  } catch {
    return {
      status: 'operational_error',
      message: 'Password setup could not be completed. Please try again.',
      resetKey,
    };
  }

  redirect('/account');
}
