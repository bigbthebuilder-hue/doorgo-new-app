import Link from 'next/link';
import { redirect } from 'next/navigation';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import { hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';

export default async function GlassCalculatorPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'jobs')) redirect('/account');
  return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-3xl font-semibold">Glass Calculator</h1><p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Local calculation workspace</p></div><Link className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 bg-white px-5 font-semibold dark:border-slate-600 dark:bg-slate-900" href="/jobs">Back to Jobs</Link></header>
      <StandaloneGlassCalculator/>
    </div>
  </main>;
}
