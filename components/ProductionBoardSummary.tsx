import { formatFriendlyDateRange } from '@/lib/production-board/date-utils';
import type { ProductionBoardViewModel } from '@/lib/production-board/types';

function formatHours(value: number): string {
  return value.toFixed(2);
}

export function ProductionBoardSummary({
  board,
}: {
  board: ProductionBoardViewModel;
}) {
  const { summary } = board;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900">Production Board</h1>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
              Read only
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {formatFriendlyDateRange(board.startDate, board.endDateExclusive)}
          </p>
          <p className="text-sm text-slate-500">
            {board.weeks} week{board.weeks === 1 ? '' : 's'} • date-only view
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <SummaryCard label="Bookings" value={summary.totalBookings.toString()} />
        <SummaryCard
          label="Known shop hours"
          value={formatHours(summary.totalKnownShopHours)}
        />
        <SummaryCard label="Scheduled days" value={summary.scheduledDays.toString()} />
        <SummaryCard label="DoorGo-linked" value={summary.doorGoLinkedCount.toString()} />
        <SummaryCard label="BizTrack-only" value={summary.bizTrackOnlyCount.toString()} />
        {summary.missingShopHoursCount > 0 ? (
          <SummaryCard
            label="Missing shop hours"
            value={summary.missingShopHoursCount.toString()}
          />
        ) : null}
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[8.25rem] flex-1 rounded-lg border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-base font-semibold text-slate-900">{value}</p>
    </div>
  );
}
