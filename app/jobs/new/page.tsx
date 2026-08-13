import { redirect } from 'next/navigation';
import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { canUse } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { isLocalJobIntakeAvailable } from '@/lib/jobs/local-job-intake-repository';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';

export default async function NewJobPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!canUse(access, 'jobs')) redirect('/account');

  return (
    <AppShell navigation={buildProtectedAppNavigation(access)}>
        {isLocalJobIntakeAvailable() ? (
          <JobHeaderForm canEdit defaultSalesperson={access.state === 'active' ? access.profile.displayName : ''} initialJob={null} inAppShell/>
        ) : (
          <><ContextTopBar backHref="/jobs" backLabel="Jobs" title="New Draft Job"/><div className="app-workspace max-w-3xl"><section className="rounded-2xl border border-amber-200 bg-white p-6 dark:border-amber-900 dark:bg-slate-900">
            <p className="rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Local Job Intake is disabled. Set DOORGO_LOCAL_INTAKE_ENABLED=true in a non-production environment.</p>
          </section></div></>
        )}
    </AppShell>
  );
}
