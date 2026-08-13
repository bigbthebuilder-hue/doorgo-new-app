import { ProductionBoardView } from '@/components/ProductionBoardView';
import {
  getCurrentDateInTimeZone,
  getMondayForDate,
  parseProductionBoardParams,
} from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import { buildProtectedAppNavigation, buildPublicAppNavigation } from '@/lib/app-shell/navigation';
import { ProductionScheduleNavigation } from '@/components/ProductionScheduleNavigation';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const access = await getCurrentDoorGoAccess();
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
      navigation={access.state === 'active' ? buildProtectedAppNavigation(access) : buildPublicAppNavigation()}
      windowNavigation={<ProductionScheduleNavigation anchorMonday={startDate} currentMonday={getMondayForDate(today)} label="Production Board date window" pathname="/production-board" visibleWeekdayEndExclusive={board.visibleWeekdayEndExclusive}/>}
    />
  );
}
