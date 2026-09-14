import { ProductionBoardView } from '@/components/ProductionBoardView';
import {
  getCurrentDateInTimeZone,
  getMondayForDate,
  parseProductionBoardParams,
} from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { ProductionScheduleNavigation } from '@/components/ProductionScheduleNavigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { hasAtLeastView } from '@/lib/auth/access';
import { redirect } from 'next/navigation';

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'production')) redirect('/account');
  const params = await searchParams;
  const today = getCurrentDateInTimeZone('America/Vancouver');
  const { startDate, weeks, endDateExclusive } = parseProductionBoardParams(params, today);

  const board = await loadProductionBoardReadOnly({
    boardStart: startDate,
    boardEndExclusive: endDateExclusive,
    weeks,
    today,
  });

  return (
    <ProductionBoardView
      board={board}
      presentation={{ title: 'Production Board', statusLabel: 'Read only' }}
      navigation={buildProtectedAppNavigation(access)}
      windowNavigation={<ProductionScheduleNavigation anchorMonday={startDate} currentMonday={getMondayForDate(today)} label="Production Board date window" pathname="/production-board" visibleWeekdayEndExclusive={board.visibleWeekdayEndExclusive}/>}
    />
  );
}
