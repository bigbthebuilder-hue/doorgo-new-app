import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ProductionBoardWeekSection } from '@/components/ProductionBoardWeekSection';
import { ProductionBoardSummary, type ProductionBoardPresentation } from '@/components/ProductionBoardSummary';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import { formatFriendlyDateRange } from '@/lib/production-board/date-utils';
import type { ProductionBoardViewModel } from '@/lib/production-board/types';
import type { ProductionBoardInteraction } from './production-board-interaction';

export function ProductionBoardView({
  board,
  presentation,
  navigation,
  windowNavigation,
  interaction,
}: {
  board: ProductionBoardViewModel;
  presentation: ProductionBoardPresentation;
  navigation: AppNavigationItem[];
  windowNavigation?: React.ReactNode;
  interaction?: ProductionBoardInteraction;
}) {
  const hasWeekendExceptions = board.weekGroups.some((week) => week.weekendExceptions.length > 0);
  const empty = !board.days.length && !hasWeekendExceptions;

  return (
    <AppShell
      navigation={navigation}
      topBar={<ContextTopBar
        title={presentation.title}
        status={<span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">{presentation.statusLabel}</span>}
        secondary={<>{formatFriendlyDateRange(board.startDate, board.visibleWeekdayEndExclusive)} · {board.weeks} week{board.weeks === 1 ? '' : 's'} · date-only view</>}
      />}
    >
      <div className="app-workspace">
        <ProductionBoardSummary board={board}/>
        {windowNavigation}
        {empty ? (
          <section className="app-workspace-panel rounded-lg border-dashed p-6 text-center">
            <h2 className="text-base font-semibold text-slate-900">No Board data in this window</h2>
            <p className="mt-1 text-sm text-slate-600">There are no production bookings or resolved capacity rows for the selected date range.</p>
          </section>
        ) : (
          <>
            {board.summary.totalBookings === 0 ? (
              <section className="app-workspace-panel rounded-lg px-3 py-2 text-sm text-slate-600">No production bookings are scheduled in this window. Resolved capacity is shown below.</section>
            ) : null}
            <div className="production-week-list grid gap-2">
              {board.weekGroups.map((week) => <ProductionBoardWeekSection key={week.startDate} week={week} interaction={interaction}/>) }
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
