import { notFound, redirect } from 'next/navigation';
import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { JobIntakeFailure } from '@/lib/jobs/job-intake-types';
import { findJobWithAccess } from '@/lib/jobs/job-intake-service';

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
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 dark:border-amber-900 dark:bg-slate-900"><h1 className="text-2xl font-semibold">Open Draft Job</h1><p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p></div>
      </main>
    );
  }
  if (!job) notFound();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <JobHeaderForm canEdit={getPermissionAccess(access, 'jobs') === 'use'} defaultSalesperson="" initialJob={job}/>
      </div>
    </main>
  );
}
