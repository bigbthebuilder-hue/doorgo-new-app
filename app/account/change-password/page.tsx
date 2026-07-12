import { redirect } from 'next/navigation';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { PasswordForm } from './password-form';

export default async function ChangePasswordPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const access = await getCurrentDoorGoAccess();

  if (access.state === 'unauthenticated') {
    redirect('/login');
  }
  if (access.state !== 'active' || !access.profile.mustChangePassword) {
    redirect('/account');
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Choose your DoorGo password</h1>
        <p className="mt-2 text-sm text-slate-600">
          Replace your temporary password before using protected DoorGo modules.
          Use a passphrase of 12 to 256 characters.
        </p>
        {params?.error === 'signout_failed' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Sign-out could not be completed. Please try again.
          </p>
        ) : null}
        <PasswordForm />
        <form className="mt-4" action="/auth/logout" method="post">
          <input
            type="hidden"
            name="failureRedirect"
            value="/account/change-password?error=signout_failed"
          />
          <button className="text-sm text-sky-700" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
