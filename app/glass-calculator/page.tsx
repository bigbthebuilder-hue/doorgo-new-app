import { redirect } from 'next/navigation';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { hasAtLeastView } from '@/lib/auth/access';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';

export default async function GlassCalculatorPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'jobs')) redirect('/account');
  return <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar backHref="/jobs" backLabel="Jobs" title="Glass Calculator" secondary="Local calculation workspace"/>}>
    <div className="app-workspace max-w-5xl">
      <StandaloneGlassCalculator/>
    </div>
  </AppShell>;
}
