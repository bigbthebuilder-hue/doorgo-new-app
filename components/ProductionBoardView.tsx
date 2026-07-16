import type { ReactNode } from 'react';
import { ProductionBoardWeekSection } from '@/components/ProductionBoardWeekSection';
import {
  ProductionBoardSummary,
  type ProductionBoardPresentation,
} from '@/components/ProductionBoardSummary';
import type { ProductionBoardViewModel } from '@/lib/production-board/types';
import type { ProductionBoardInteraction } from './production-board-interaction';

export function ProductionBoardView({
  board,
  presentation,
  headerActions,
  windowNavigation,
  interaction,
}: {
  board: ProductionBoardViewModel;
  presentation: ProductionBoardPresentation;
  headerActions?: ReactNode;
  windowNavigation?: ReactNode;
  interaction?: ProductionBoardInteraction;
}) {
  const hasWeekendExceptions = board.weekGroups.some(
    (week) => week.weekendExceptions.length > 0,
  );

  if (!board.days.length && !hasWeekendExceptions) {
    return (
      <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-4">
        <div className="mx-auto flex w-full max-w-[1780px] flex-col gap-4">
          {windowNavigation}
          <ProductionBoardSummary
            board={board}
            presentation={presentation}
            headerActions={headerActions}
          />
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">No Board data in this window</h2>
            <p className="mt-2 text-sm text-slate-600">
              There are no production bookings or resolved capacity rows for the selected date range.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-2 py-4 text-slate-900 sm:px-3 lg:px-4">
      <div className="mx-auto flex w-full max-w-[1780px] flex-col gap-3">
        {windowNavigation}
        <ProductionBoardSummary
          board={board}
          presentation={presentation}
          headerActions={headerActions}
        />
        {board.summary.totalBookings === 0 ? (
          <section className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            No production bookings are scheduled in this window. Resolved capacity is shown below.
          </section>
        ) : null}
        <div className="grid gap-4">
          {board.weekGroups.map((week) => (
            <ProductionBoardWeekSection
              key={week.startDate}
              week={week}
              interaction={interaction}
            />
          ))}
        </div>
      </div>
    </main>
  );
}
