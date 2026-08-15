import { notFound, redirect } from 'next/navigation';
import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { JobIntakeFailure } from '@/lib/jobs/job-intake-types';
import { findJobWithAccess } from '@/lib/jobs/job-intake-service';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';

export default async function EditJobPage({
  params,
}: {
  params: Promise<{ internalJobId: string }>;
}) {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'jobs')) redirect('/account');
  const { internalJobId } = await params;

  let job;
  try {
    job = await findJobWithAccess(access, internalJobId);
  } catch (error) {
    const message = error instanceof JobIntakeFailure
      ? error.message
      : 'Local Job Intake is temporarily unavailable.';
    return (
      <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar title="Open Job"/>}><div className="app-workspace max-w-3xl"><div className="app-workspace-panel rounded-xl p-6"><p className="rounded-xl bg-amber-50 p-4 text-amber-900">{message}</p></div></div></AppShell>
    );
  }
  if (!job) notFound();

  return (
    <AppShell hasBottomBar hasTopBar navigation={buildProtectedAppNavigation(access)} scrollOwner="workspace">
      <JobHeaderForm canEdit={getPermissionAccess(access, 'jobs') === 'use'} defaultSalesperson="" initialJob={job} inAppShell/>
    </AppShell>
  );
}
