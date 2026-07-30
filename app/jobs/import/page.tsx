import { redirect } from 'next/navigation';
import { LegacyJobImportReview } from '@/components/jobs/LegacyJobImportReview';
import { canUse } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';

export default async function ImportLegacyJobPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!canUse(access, 'jobs')) redirect('/account');
  return <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 dark:bg-slate-950 dark:text-slate-100 sm:py-10"><div className="mx-auto max-w-6xl"><LegacyJobImportReview defaultSalesperson={access.state === 'active' ? access.profile.displayName : ''}/></div></main>;
}
