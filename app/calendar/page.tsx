import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell/AppShell';
import { CalendarWorkspace } from '@/components/CalendarWorkspace';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { canUse, hasAtLeastView } from '@/lib/auth/access';
import { getCurrentDateInTimeZone, getMondayForDate, parseProductionBoardParams } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import {initialCalendarRange} from '@/lib/calendar/continuous-range';

export default async function CalendarPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireDoorGoProtectedAccess();
  if (access.state !== 'active' || !hasAtLeastView(access, 'calendar')) redirect('/account');

  const today = getCurrentDateInTimeZone('America/Vancouver');
  const requested = parseProductionBoardParams(await searchParams, today);
  const {startDate,weeks,endDateExclusive}=initialCalendarRange(today);
  const canOpenJobs = hasAtLeastView(access, 'jobs');
  const board = await loadProductionBoardReadOnly({ boardStart: startDate, boardEndExclusive: endDateExclusive, includeNativeJobLinks: canOpenJobs, includeOperationalCalendarItems:true, weeks, today });

  return <AppShell navigation={buildProtectedAppNavigation(access)} scrollOwner="workspace">
    <CalendarWorkspace board={board} canAddBackorders={canUse(access,'jobs')} canInteract={canUse(access, 'calendar')} canManageProduction={canUse(access,'production')} canOpenJobs={canOpenJobs} currentMonday={getMondayForDate(today)} defaultSalesperson={access.profile.displayName} initialTargetMonday={requested.startDate} preferenceOwner={access.user.id} today={today}/>
  </AppShell>;
}
