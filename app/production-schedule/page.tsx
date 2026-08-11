import { redirect } from 'next/navigation';
import { ProductionBoardView } from '@/components/ProductionBoardView';
import { ProductionScheduleInteractiveBoard } from '@/components/ProductionScheduleInteractiveBoard';
import { ProductionScheduleNavigation } from '@/components/ProductionScheduleNavigation';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import {
  getCurrentDateInTimeZone,
  getMondayForDate,
  parseProductionBoardParams,
} from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import {
  canViewProductionSchedule,
  PRODUCTION_SCHEDULE_PRESENTATION,
} from '@/lib/production-schedule/view-access';
import { canRescheduleProductionBooking } from '@/lib/production-bookings/production-booking-reschedule-contract';
import { getProductionCompletionAuthorizationError } from '@/lib/production-bookings/production-booking-completion-contract';

export default async function ProductionSchedulePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireDoorGoProtectedAccess();

  if (!canViewProductionSchedule(access)) {
    redirect('/account');
  }

  const params = await searchParams;
  const today = getCurrentDateInTimeZone('America/Vancouver');
  const { startDate, weeks, endDateExclusive, visibleWeekdayEndExclusive } =
    parseProductionBoardParams(params, today);
  const board = await loadProductionBoardReadOnly({
    boardStart: startDate,
    boardEndExclusive: endDateExclusive,
    weeks,
    today,
  });

  const windowNavigation = (
    <ProductionScheduleNavigation
      key={startDate}
      anchorMonday={startDate}
      currentMonday={getMondayForDate(today)}
      visibleWeekdayEndExclusive={visibleWeekdayEndExclusive}
    />
  );

  const canMoveBookings = canRescheduleProductionBooking(access);
  const canChangeCompletion = getProductionCompletionAuthorizationError(access) === null;

  return canMoveBookings && canChangeCompletion ? (
    <ProductionScheduleInteractiveBoard
      board={board}
      presentation={PRODUCTION_SCHEDULE_PRESENTATION}
      navigation={buildProtectedAppNavigation(access)}
      windowNavigation={windowNavigation}
      today={today}
    />
  ) : (
    <ProductionBoardView
      board={board}
      presentation={PRODUCTION_SCHEDULE_PRESENTATION}
      navigation={buildProtectedAppNavigation(access)}
      windowNavigation={windowNavigation}
    />
  );
}
