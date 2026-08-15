import { redirect } from 'next/navigation';
import { LegacyJobImportReview } from '@/components/jobs/LegacyJobImportReview';
import { canUse } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';

export default async function ImportLegacyJobPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!canUse(access, 'jobs')) redirect('/account');
  return <LegacyJobImportReview defaultSalesperson={access.state === 'active' ? access.profile.displayName : ''} inAppShell navigation={buildProtectedAppNavigation(access)}/>;
}
