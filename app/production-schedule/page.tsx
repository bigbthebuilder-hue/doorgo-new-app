import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ProductionBoardView } from '@/components/ProductionBoardView';
import { hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import {
  addDaysToDateOnly,
  parseProductionBoardParams,
} from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import {
  canViewProductionSchedule,
  PRODUCTION_SCHEDULE_PRESENTATION,
} from '@/lib/production-schedule/view-access';

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
  const { startDate, weeks } = parseProductionBoardParams(params);
  const boardEndExclusive = addDaysToDateOnly(startDate, weeks * 7);
  const board = await loadProductionBoardReadOnly({
    boardStart: startDate,
    boardEndExclusive,
    weeks,
  });

  const headerActions = (
    <nav
      className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-sm font-medium text-sky-700"
      aria-label="Production schedule navigation"
    >
      <Link href="/production-board">Production Board</Link>
      <Link href="/production-recovery">Past Scheduled Bookings</Link>
      {hasAtLeastView(access, 'production_checkpoints') ? (
        <Link href="/production-checkpoints">Production Carry Checkpoint</Link>
      ) : null}
      <Link href="/account">Account</Link>
    </nav>
  );

  return (
    <ProductionBoardView
      board={board}
      presentation={PRODUCTION_SCHEDULE_PRESENTATION}
      headerActions={headerActions}
    />
  );
}
