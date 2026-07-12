export const INVALID_CREDENTIALS_MESSAGE = 'Email or password is incorrect.';

export type LoginFormState = {
  status: 'idle' | 'error';
  message: string | null;
  passwordResetKey: number;
};

export const INITIAL_LOGIN_FORM_STATE: LoginFormState = {
  status: 'idle',
  message: null,
  passwordResetKey: 0,
};

export function getFailedLoginState(
  previousState: LoginFormState,
): LoginFormState {
  return {
    status: 'error',
    message: INVALID_CREDENTIALS_MESSAGE,
    passwordResetKey: previousState.passwordResetKey + 1,
  };
}

export function readLoginCredentials(formData: FormData): {
  email: string;
  password: string;
} | null {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }

  const normalizedEmail = email.trim();
  if (!normalizedEmail || !password) {
    return null;
  }

  return { email: normalizedEmail, password };
}

export async function executePasswordLogin(
  credentials: { email: string; password: string },
  operations: {
    signInWithPassword: (values: { email: string; password: string }) => Promise<{ error: unknown }>;
    verifyUser: () => Promise<{ user: unknown; error: unknown }>;
    signOutLocal: () => Promise<void>;
  },
): Promise<boolean> {
  const signIn = await operations.signInWithPassword(credentials);
  if (signIn.error) {
    return false;
  }

  const verification = await operations.verifyUser();
  if (verification.error || !verification.user) {
    await operations.signOutLocal();
    return false;
  }

  return true;
}
