import {
  DOORGO_PERMISSION_KEYS,
  getPermissionAccess,
} from '@/lib/auth/access';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';

export default async function AccountPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const access = await requireDoorGoProtectedAccess();

  return (
    <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar title="Account" secondary={access.profile?.displayName || access.user?.email || 'DoorGo account'} actions={<form action="/auth/logout" method="post"><button className="app-button app-button-secondary">Sign out</button></form>}/>}>
      <div className="app-workspace max-w-2xl">
        <section className="app-workspace-panel rounded-xl p-6">

        {params?.error === 'signout_failed' ? (
          <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Sign-out could not be completed. Please try again.
          </p>
        ) : null}

        {access.profile === null ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your authenticated account does not have a DoorGo profile yet.
          </p>
        ) : (
          <>
            <dl className="mt-6 grid gap-3 rounded-xl bg-slate-50 p-4 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Display name</dt><dd className="font-medium">{access.profile.displayName}</dd></div>
              <div><dt className="text-slate-500">Account state</dt><dd className="font-medium">{access.profile.active ? 'Active' : 'Inactive'}</dd></div>
              <div><dt className="text-slate-500">Manager</dt><dd className="font-medium">{access.profile.isManager ? 'Yes' : 'No'}</dd></div>
              <div><dt className="text-slate-500">Company/location</dt><dd className="font-medium">{access.profile.companyLocation ?? 'Not set'}</dd></div>
              <div><dt className="text-slate-500">Password</dt><dd className="font-medium">{access.profile.mustChangePassword ? 'Password setup required' : 'Password setup complete'}</dd></div>
            </dl>

            <h2 className="mt-6 text-lg font-semibold">Module permissions</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DOORGO_PERMISSION_KEYS.map((key) => (
                <div key={key} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <span className="capitalize">{key === 'production_checkpoints' ? 'Production checkpoints' : key}</span>
                  <span className="font-semibold uppercase text-slate-600">{getPermissionAccess(access, key)}</span>
                </div>
              ))}
            </div>
          </>
        )}

        </section>
      </div>
    </AppShell>
  );
}
