import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { ManagerTabbedWorkspace } from '@/components/manager/ManagerTabbedWorkspace';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { canUse } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { adminWorkspaceAccess } from '@/lib/admin/users-contract';
import { loadAdminUsers } from '@/lib/admin/users-actions';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import type { ManagerCapacityConfiguration } from '@/lib/manager/capacity-configuration';
import type { ManagerCapacityExceptions } from '@/lib/manager/capacity-exceptions';
import { getCurrentDateInTimeZone } from '@/lib/production-board/date-utils';

export default async function ManagerPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireDoorGoProtectedAccess();
  const tabs = adminWorkspaceAccess(access);
  if (!tabs.settings && !tabs.users) redirect('/account');
  const raw = (await searchParams)?.year;
  const currentYear = Number(getCurrentDateInTimeZone('America/Vancouver').slice(0, 4));
  const requested = Number(Array.isArray(raw) ? raw[0] : raw);
  const year = Number.isInteger(requested) && requested >= 2020 && requested <= 2100 ? requested : currentYear;
  let configuration: ManagerCapacityConfiguration | null = null;
  let exceptions: ManagerCapacityExceptions | null = null;
  if (tabs.settings) {
    const client = await createAuthenticatedSupabaseServerClient();
    const [configResult, exceptionsResult] = await Promise.all([
      client.rpc('load_manager_capacity_configuration'), client.rpc('load_manager_capacity_exceptions', { p_year: year }),
    ]);
    if (configResult.error) throw new Error(`Failed to load Admin configuration: ${configResult.error.message}`);
    if (exceptionsResult.error) throw new Error(`Failed to load Admin capacity exceptions: ${exceptionsResult.error.message}`);
    configuration = configResult.data as ManagerCapacityConfiguration;
    exceptions = exceptionsResult.data as ManagerCapacityExceptions;
  }
  const directory = tabs.users ? await loadAdminUsers() : null;
  return <AppShell navigation={buildProtectedAppNavigation(access)} scrollOwner="workspace"><ManagerTabbedWorkspace
    key={`${tabs.users}-${tabs.settings}-${canUse(access, 'users')}`}
    canEdit={canUse(access, 'settings')} configuration={configuration} exceptions={exceptions}
    usersAccess={tabs.users ? { canEdit: canUse(access, 'users'), callerId: access.user!.id,
      initialUsers: directory?.ok ? directory.users : [], loadError: directory && !directory.ok ? directory.message : undefined,
      defaultLocation: access.profile?.companyLocation ?? null } : undefined}
  /></AppShell>;
}
