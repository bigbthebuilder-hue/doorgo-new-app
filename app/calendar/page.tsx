import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { CalendarWorkspace } from '@/components/CalendarWorkspace';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { canUse, hasAtLeastView } from '@/lib/auth/access';
import { getCurrentDateInTimeZone, getMondayForDate, parseProductionBoardParams } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';

export default async function CalendarPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireDoorGoProtectedAccess();
  if (access.state !== 'active' || !hasAtLeastView(access, 'calendar')) redirect('/account');

  const today = getCurrentDateInTimeZone('America/Vancouver');
  const { startDate, weeks, endDateExclusive } = parseProductionBoardParams(await searchParams, today);
  const canOpenJobs = hasAtLeastView(access, 'jobs');
  const board = await loadProductionBoardReadOnly({ boardStart: startDate, boardEndExclusive: endDateExclusive, includeNativeJobLinks: canOpenJobs, weeks, today });

  return <AppShell navigation={buildProtectedAppNavigation(access)} scrollOwner="workspace">
    <CalendarWorkspace board={board} canInteract={canUse(access, 'calendar') && canUse(access, 'production')} canOpenJobs={canOpenJobs} currentMonday={getMondayForDate(today)} preferenceOwner={access.user.id} today={today}/>
  </AppShell>;
}
