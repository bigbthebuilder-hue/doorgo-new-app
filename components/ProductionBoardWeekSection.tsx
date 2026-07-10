import { ProductionBoardDay } from '@/components/ProductionBoardDay';
import { formatFriendlyDateRange } from '@/lib/production-board/date-utils';
import type { ProductionBoardWeek } from '@/lib/production-board/types';

function formatHours(value: number): string {
  return value.toFixed(2);
}

function weeklyStatus(week: ProductionBoardWeek): {
  label: string;
  tone: 'normal' | 'warning' | 'danger';
} {
  if (!week.comparisonComplete) {
    return {
      label: 'Weekly comparison incomplete',
      tone: 'warning',
    };
  }

  if ((week.overloadHours ?? 0) > 0) {
    return {
      label: `Week over by ${formatHours(week.overloadHours ?? 0)} hrs`,
      tone: 'danger',
    };
  }

  if (week.dailyOverloadCount > 0) {
    return {
      label: `${week.dailyOverloadCount} overloaded ${
        week.dailyOverloadCount === 1 ? 'day' : 'days'
      } to balance`,
      tone: 'warning',
    };
  }

  return {
    label: `${formatHours(week.remainingHours ?? 0)} hrs open`,
    tone: 'normal',
  };
}

export function ProductionBoardWeekSection({
  week,
}: {
  week: ProductionBoardWeek;
}) {
  const status = weeklyStatus(week);
  const weeklyOverload = (week.overloadHours ?? 0) > 0;

  return (
    <section
      className={`rounded-2xl border bg-white p-3 shadow-sm ${
        weeklyOverload
          ? 'border-rose-300'
          : week.dailyOverloadCount > 0
            ? 'border-amber-300'
            : 'border-slate-200'
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold text-slate-900">
              Week {week.weekIndex + 1}
            </h2>
            <span
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                status.tone === 'danger'
                  ? 'bg-rose-100 text-rose-700'
                  : status.tone === 'warning'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {status.label}
            </span>
          </div>

          <p className="mt-1 text-sm text-slate-600">
            {formatFriendlyDateRange(week.startDate, week.endDateExclusive)}
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {week.bookingCount} booking{week.bookingCount === 1 ? '' : 's'} •{' '}
            {week.closureCount} closure{week.closureCount === 1 ? '' : 's'} •{' '}
            {week.unknownCapacityDayCount} capacity day
            {week.unknownCapacityDayCount === 1 ? '' : 's'} unknown
          </p>

          {week.missingShopHoursCount > 0 ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              {week.missingShopHoursCount} booking
              {week.missingShopHoursCount === 1 ? '' : 's'} missing Shop Hours
            </p>
          ) : null}
        </div>

        <div className="grid w-full grid-cols-3 gap-2 text-sm xl:w-auto xl:min-w-[31rem]">
          <WeeklyMetric
            label="Planned"
            value={`${formatHours(week.totalKnownShopHours)} hrs`}
          />
          <WeeklyMetric
            label={week.capacityComplete ? 'Available' : 'Known available'}
            value={`${formatHours(week.totalAvailableHours)} hrs`}
            emphasis={week.capacityComplete ? 'normal' : 'warning'}
          />
          <WeeklyMetric
            label={weeklyOverload ? 'Over' : 'Remaining'}
            value={
              !week.comparisonComplete
                ? 'Incomplete'
                : weeklyOverload
                  ? `${formatHours(week.overloadHours ?? 0)} hrs`
                  : `${formatHours(week.remainingHours ?? 0)} hrs`
            }
            emphasis={
              weeklyOverload
                ? 'danger'
                : week.comparisonComplete
                  ? 'normal'
                  : 'warning'
            }
          />
        </div>
      </div>

      {week.dailyOverloadCount > 0 && !weeklyOverload ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This week has enough total capacity, but {week.dailyOverloadCount}{' '}
          {week.dailyOverloadCount === 1 ? 'day needs' : 'days need'} balancing.
        </p>
      ) : null}

      {!week.comparisonComplete ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Weekly remaining capacity is unavailable until all visible capacity and
          booking Shop Hours are known.
        </p>
      ) : null}

      <div className="mt-3 overflow-x-auto pb-1">
        {week.days.length > 0 ? (
          <div className="grid min-w-[1180px] grid-cols-5 items-start gap-2 2xl:min-w-0">
            {week.days.map((day) => (
              <ProductionBoardDay key={day.date} day={day} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            No production bookings or resolved capacity rows appear in this week.
          </p>
        )}
      </div>
    </section>
  );
}

function WeeklyMetric({
  label,
  value,
  emphasis = 'normal',
}: {
  label: string;
  value: string;
  emphasis?: 'normal' | 'warning' | 'danger';
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        emphasis === 'danger'
          ? 'border-rose-200 bg-rose-50'
          : emphasis === 'warning'
            ? 'border-amber-200 bg-amber-50'
            : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 font-semibold ${
          emphasis === 'danger'
            ? 'text-rose-700'
            : emphasis === 'warning'
              ? 'text-amber-800'
              : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
