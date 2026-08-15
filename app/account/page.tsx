import {
  DOORGO_PERMISSION_KEYS,
  getPermissionAccess,
} from '@/lib/auth/access';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { Workspace, WorkspaceSurface } from '@/components/app-shell/Workspace';
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
    <AppShell
      navigation={buildProtectedAppNavigation(access)}
      scrollOwner="main"
      topBar={<ContextTopBar density="compact" title="Account" secondary={access.profile?.displayName || access.user?.email || 'DoorGo account'} actions={<form action="/auth/logout" method="post"><button className="app-button app-button-secondary">Sign out</button></form>}/>}
    >
      <Workspace className="account-workspace" width="fluid">
        <WorkspaceSurface className="account-workspace-surface">

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
            <h2 className="account-section-heading">Account details</h2>
            <dl className="account-details-grid">
              <div><dt>Display name</dt><dd>{access.profile.displayName}</dd></div>
              <div><dt>Account state</dt><dd>{access.profile.active ? 'Active' : 'Inactive'}</dd></div>
              <div><dt>Manager</dt><dd>{access.profile.isManager ? 'Yes' : 'No'}</dd></div>
              <div><dt>Company/location</dt><dd>{access.profile.companyLocation ?? 'Not set'}</dd></div>
              <div><dt>Password</dt><dd>{access.profile.mustChangePassword ? 'Password setup required' : 'Password setup complete'}</dd></div>
            </dl>

            <h2 className="account-section-heading account-permissions-heading">Module permissions</h2>
            <table className="account-permissions-table">
              <thead><tr><th>Module</th><th>Access</th></tr></thead>
              <tbody>{DOORGO_PERMISSION_KEYS.map((key) => (
                <tr key={key}><td className="capitalize">{key === 'production_checkpoints' ? 'Production checkpoints' : key}</td><td>{getPermissionAccess(access, key)}</td></tr>
              ))}</tbody>
            </table>
          </>
        )}

        </WorkspaceSurface>
      </Workspace>
    </AppShell>
  );
}
