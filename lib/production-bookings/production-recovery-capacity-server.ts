import 'server-only';

import { hasAtLeastView, type CurrentDoorGoAccess } from '@/lib/auth/access';
import { addDaysToDateOnly } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import type { TodayProductionSummary } from './production-recovery-page-contract';

const unavailable = (productionDate: string): TodayProductionSummary => ({
  productionDate,
  plannedHours: null,
  availableHours: null,
  remainingHours: null,
  overloadHours: null,
  capacityKnown: false,
  isClosed: false,
});

export async function loadAuthorizedTodayProductionSummary(
  access: CurrentDoorGoAccess,
  productionDate: string,
): Promise<TodayProductionSummary> {
  if (!hasAtLeastView(access, 'production')) return unavailable(productionDate);
  try {
    const board = await loadProductionBoardReadOnly({
      boardStart: productionDate,
      boardEndExclusive: addDaysToDateOnly(productionDate, 1),
      weeks: 1,
    });
    const day = board.days.find((value) => value.date === productionDate);
    if (!day) return { ...unavailable(productionDate), plannedHours: 0 };
    return {
      productionDate,
      plannedHours: day.missingShopHoursCount === 0 ? day.totalKnownShopHours : null,
      availableHours: day.availableHours,
      remainingHours: day.remainingHours,
      overloadHours: day.overloadHours,
      capacityKnown: day.capacityKnown,
      isClosed: day.isClosed,
    };
  } catch {
    return unavailable(productionDate);
  }
}
