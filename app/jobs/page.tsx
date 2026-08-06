import Link from 'next/link';
import { redirect } from 'next/navigation';
import { JobsList } from '@/components/jobs/JobsList';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
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
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        <div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 shadow-sm dark:border-amber-900 dark:bg-slate-900">
          <h1 className="text-2xl font-semibold">Jobs</h1>
          <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p>
          <Link className="mt-5 inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-600" href="/account">Back to account</Link>
        </div>
      </main>
    );
  }

  const canCreate = getPermissionAccess(access, 'jobs') === 'use';
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-3xl font-semibold">Jobs</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Native DoorGo jobs · hosted persistence</p></div>
          <nav className="flex flex-wrap gap-3" aria-label="Jobs navigation">
            <Link className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-5 font-semibold dark:border-slate-600 dark:bg-slate-900" href="/account">Account</Link>
            <Link className="inline-flex min-h-12 items-center rounded-xl border border-slate-300 bg-white px-5 font-semibold dark:border-slate-600 dark:bg-slate-900" href="/glass-calculator">Glass Calculator</Link>
            {canCreate ? <><Link className="inline-flex min-h-12 items-center rounded-xl border border-sky-700 bg-white px-5 font-semibold text-sky-800 dark:bg-slate-900 dark:text-sky-200" href="/jobs/import">Import Legacy Job</Link><Link className="inline-flex min-h-12 items-center rounded-xl bg-sky-700 px-5 font-semibold text-white" href="/jobs/new">New Draft Job</Link></> : null}
          </nav>
        </header>
        <JobsList jobs={jobs}/>
      </div>
    </main>
  );
}
