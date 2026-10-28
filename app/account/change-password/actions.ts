'use server';

import { redirect } from 'next/navigation';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { runEmployeePasswordSetup } from '@/lib/auth/employee-password-server';
import type { PasswordSetupState } from '@/lib/auth/password-setup';

export async function changeInitialPasswordAction(
  previousState: PasswordSetupState,
  formData: FormData,
): Promise<PasswordSetupState> {
  const resetKey = previousState.resetKey + 1;
  const access = await getCurrentDoorGoAccess();
  if (access.state === 'unauthenticated') redirect('/login');
  if (access.state !== 'active') {
    return { status: 'operational_error', message: 'Password setup is not available for this account.', resetKey };
  }
  // The adapter verifies identity, validates input and reserves before Auth.
  // A durable receipt permits recovery after the profile requirement was cleared.
  const result = await runEmployeePasswordSetup(formData);
  if (result.status === 'operation_complete') redirect('/account');
  if (result.status === 'validation_error') {
    return { status: 'validation_error', message: result.message ?? 'Enter a valid new password.', resetKey };
  }
  const message = result.status === 'auth_rejected'
    ? 'The new password was rejected. Choose a different password.'
    : result.status === 'not_allowed'
      ? 'Password setup is not available for this account.'
      : result.status === 'unavailable'
        ? 'Password setup is unavailable. Contact your administrator.'
        : 'Password setup could not be confirmed. Contact your administrator for recovery before retrying.';
  return { status: 'operational_error', message, resetKey };
}
