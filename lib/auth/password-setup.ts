export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_LENGTH = 256;

export type PasswordSetupState = {
  status:
    | 'idle'
    | 'validation_error'
    | 'operational_error'
    | 'partial_success';
  message: string | null;
  resetKey: number;
};

export const INITIAL_PASSWORD_SETUP_STATE: PasswordSetupState = {
  status: 'idle',
  message: null,
  resetKey: 0,
};

export type PasswordValidationResult =
  | { valid: true; password: string }
  | { valid: false; message: string };

export function validateNewPasswordForm(formData: FormData): PasswordValidationResult {
  const password = formData.get('newPassword');
  const confirmation = formData.get('confirmPassword');

  if (typeof password !== 'string' || typeof confirmation !== 'string') {
    return { valid: false, message: 'Enter and confirm your new password.' };
  }
  if (!password || !confirmation) {
    return { valid: false, message: 'Enter and confirm your new password.' };
  }
  if (password !== confirmation) {
    return { valid: false, message: 'The passwords do not match.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Use no more than ${MAX_PASSWORD_LENGTH} characters.`,
    };
  }

  return { valid: true, password };
}

export async function executeInitialPasswordSetup(
  password: string,
  operations: {
    updatePassword: (password: string) => Promise<{ error: unknown }>;
    completeProfileSetup: () => Promise<{ error: unknown }>;
  },
): Promise<'success' | 'password_update_failed' | 'profile_completion_failed'> {
  let passwordUpdate: { error: unknown };
  try {
    passwordUpdate = await operations.updatePassword(password);
  } catch {
    return 'password_update_failed';
  }
  if (passwordUpdate.error) {
    return 'password_update_failed';
  }

  let profileCompletion: { error: unknown };
  try {
    profileCompletion = await operations.completeProfileSetup();
  } catch {
    return 'profile_completion_failed';
  }
  if (profileCompletion.error) {
    return 'profile_completion_failed';
  }

  return 'success';
}
