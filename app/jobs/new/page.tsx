import Link from 'next/link';
import { redirect } from 'next/navigation';
import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { canUse } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { isLocalJobIntakeAvailable } from '@/lib/jobs/local-job-intake-repository';

export default async function NewJobPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!canUse(access, 'jobs')) redirect('/account');

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:py-10">
      <div className="mx-auto max-w-6xl">
        {isLocalJobIntakeAvailable() ? (
          <JobHeaderForm canEdit defaultSalesperson={access.state === 'active' ? access.profile.displayName : ''} initialJob={null}/>
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-white p-6 dark:border-amber-900 dark:bg-slate-900">
            <h1 className="text-2xl font-semibold">New Draft Job</h1>
            <p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">Local Job Intake is disabled. Set DOORGO_LOCAL_INTAKE_ENABLED=true in a non-production environment.</p>
            <Link className="mt-5 inline-flex min-h-12 items-center rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-600" href="/jobs">Back to Jobs</Link>
          </section>
        )}
      </div>
    </main>
  );
}
