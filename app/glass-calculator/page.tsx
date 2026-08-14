import { redirect } from 'next/navigation';
import { StandaloneGlassCalculator } from '@/components/jobs/StandaloneGlassCalculator';
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { hasAtLeastView } from '@/lib/auth/access';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';

export default async function GlassCalculatorPage() {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'jobs')) redirect('/account');
  return <AppShell
    navigation={buildProtectedAppNavigation(access)}
    topBar={<ContextTopBar density="compact" title="Glass Calculator" secondary="Local calculation workspace"/>}
    bottomBar={<ContextBottomBar label="Glass Calculator actions" status="Local calculation · no save required" actions={<div id="glass-calculator-bottom-actions"/>}/>}
  >
    <div className="app-workspace app-workspace-fluid">
      <StandaloneGlassCalculator/>
    </div>
  </AppShell>;
}
