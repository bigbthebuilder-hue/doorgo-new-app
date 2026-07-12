'use client';

import { useActionState } from 'react';
import { INITIAL_LOGIN_FORM_STATE } from '@/lib/auth/login';
import { loginAction } from './actions';

export function LoginForm() {
  const [state, formAction, pending] = useActionState(
    loginAction,
    INITIAL_LOGIN_FORM_STATE,
  );

  return (
    <form className="mt-6 grid gap-4" action={formAction}>
      <label className="grid gap-1 text-sm font-medium">
        Email
        <input
          className="rounded-lg border border-slate-300 px-3 py-2"
          type="email"
          name="email"
          required
          autoComplete="email"
        />
      </label>
      <label className="grid gap-1 text-sm font-medium">
        Password
        <input
          key={state.passwordResetKey}
          className="rounded-lg border border-slate-300 px-3 py-2"
          type="password"
          name="password"
          required
          autoComplete="current-password"
        />
      </label>
      <button
        className="rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-60"
        type="submit"
        disabled={pending}
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
      {state.message ? (
        <p className="text-sm text-rose-700" aria-live="polite">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
