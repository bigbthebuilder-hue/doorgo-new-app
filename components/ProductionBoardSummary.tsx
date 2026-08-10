import type { ProductionBoardViewModel } from '@/lib/production-board/types';

export type ProductionBoardPresentation = {
  title: string;
  statusLabel: string;
};

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
    <section>
      <div className="flex flex-wrap gap-1.5">
        <SummaryCard label="Bookings" value={summary.totalBookings.toString()} />
        <SummaryCard label="Known shop hours" value={formatHours(summary.totalKnownShopHours)} />
        <SummaryCard label="Scheduled days" value={summary.scheduledDays.toString()} />
        <SummaryCard label="DoorGo-linked" value={summary.doorGoLinkedCount.toString()} />
        <SummaryCard label="BizTrack-only" value={summary.bizTrackOnlyCount.toString()} />
        {summary.missingShopHoursCount > 0 ? <SummaryCard label="Missing shop hours" value={summary.missingShopHoursCount.toString()} /> : null}
      </div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[7rem] flex-1 border-l border-slate-200 bg-white px-2.5 py-1.5 first:border-l-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
