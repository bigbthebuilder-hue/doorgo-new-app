import 'server-only';
import { hasAtLeastView, type CurrentDoorGoAccess } from '@/lib/auth/access';
import { addDaysToDateOnly } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';

export async function loadAuthorizedTodayCalculatedCarry(access: CurrentDoorGoAccess, productionDate: string): Promise<{ calculatedCarryHours: number | null }> {
  if (!hasAtLeastView(access, 'production_checkpoints')) return { calculatedCarryHours: null };
  try {
    const board = await loadProductionBoardReadOnly({ boardStart: productionDate, boardEndExclusive: addDaysToDateOnly(productionDate, 1), weeks: 1 });
    return { calculatedCarryHours: board.days.find((day) => day.date === productionDate)?.calculatedOpeningCarry ?? null };
  } catch {
    return { calculatedCarryHours: null };
  }
}
