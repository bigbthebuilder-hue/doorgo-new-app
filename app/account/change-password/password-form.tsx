'use client';

import { useActionState } from 'react';
import { INITIAL_PASSWORD_SETUP_STATE } from '@/lib/auth/password-setup';
import { changeInitialPasswordAction } from './actions';

export function PasswordForm() {
  const [state, formAction, pending] = useActionState(
    changeInitialPasswordAction,
    INITIAL_PASSWORD_SETUP_STATE,
  );

  return (
    <form key={state.resetKey} className="mt-6 grid gap-4" action={formAction}>
      <label className="grid gap-1 text-sm font-medium">
        New password
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          type="password"
          name="newPassword"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Confirm new password
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          type="password"
          name="confirmPassword"
          required
          minLength={12}
          maxLength={256}
          autoComplete="new-password"
        />
      </label>
      <button
        className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Saving…' : 'Save password'}
      </button>
      {state.message ? (
        <p className="text-sm text-amber-800" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
