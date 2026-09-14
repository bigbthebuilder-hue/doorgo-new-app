import { redirect } from 'next/navigation';
import { JobHeaderForm } from '@/components/jobs/JobHeaderForm';
import { canUse } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { AppShell } from '@/components/app-shell/AppShell';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';

export default async function NewJobPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!canUse(access, 'jobs')) redirect('/account');

  return (
    <AppShell hasBottomBar hasTopBar navigation={buildProtectedAppNavigation(access)} scrollOwner="workspace">
          <JobHeaderForm canEdit defaultSalesperson={access.state === 'active' ? access.profile.displayName : ''} initialJob={null} inAppShell/>
    </AppShell>
  );
}
