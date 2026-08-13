import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { JobsWorkspace } from '@/components/jobs/JobsWorkspace';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { JobIntakeFailure } from '@/lib/jobs/job-intake-types';
import { listJobsWithAccess } from '@/lib/jobs/job-intake-service';

export default async function JobsPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'jobs')) redirect('/account');

  let jobs;
  try {
    jobs = await listJobsWithAccess(access);
  } catch (error) {
    const message = error instanceof JobIntakeFailure
      ? error.message
      : 'Hosted Job Intake is temporarily unavailable.';
    return (
      <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar title="Jobs" secondary="DoorGo jobs" />}>
        <div className="app-workspace app-workspace-fluid">
          <div className="app-workspace-panel rounded-lg border-amber-200 p-4">
            <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">{message}</p>
            <Link className="app-button app-button-secondary mt-4" href="/account">Back to account</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  const canCreate = getPermissionAccess(access, 'jobs') === 'use';
  return <JobsWorkspace canCreate={canCreate} jobs={jobs} navigation={buildProtectedAppNavigation(access)}/>;
}
