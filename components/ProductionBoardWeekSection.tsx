import { ProductionBoardDay } from '@/components/ProductionBoardDay';
import { formatFriendlyDateRange } from '@/lib/production-board/date-utils';
import {
  classifyFlowOperationalStatus,
  weeklyFlowStatusLabel,
} from '@/lib/production-board/flow-presentation';
import type { ProductionBoardWeek } from '@/lib/production-board/types';

function formatHours(value: number): string {
  return value.toFixed(2);
}

export function ProductionBoardWeekSection({
  week,
}: {
  week: ProductionBoardWeek;
}) {
  const status = classifyFlowOperationalStatus({
    unresolved: week.unresolvedFlow,
    openingCarry: week.openingCarryIn,
    endingCarry: week.endingCarryOut,
  });
  const weeklyOverload = (week.overloadHours ?? 0) > 0;

  return (
    <section
      className={`rounded-2xl border bg-white p-3 shadow-sm ${
        status === 'building'
          ? 'border-rose-300'
          : status === 'reducing' ||
              status === 'unchanged' ||
              status === 'unresolved'
            ? 'border-amber-300'
            : 'border-emerald-300'
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
                status === 'building'
                  ? 'bg-rose-100 text-rose-700'
                  : status === 'reducing' ||
                      status === 'unchanged' ||
                      status === 'unresolved'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {weeklyFlowStatusLabel(status)}
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

        <div className="w-full xl:w-auto xl:min-w-[42rem]">
          <div className="grid grid-cols-4 gap-2 text-sm">
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
          <WeeklyMetric
            label="Opening carry"
            value={
              week.openingCarryKnown && week.openingCarryIn !== null
                ? `${formatHours(week.openingCarryIn)} hrs`
                : 'Unresolved'
            }
            emphasis={
              week.openingCarryKnown && week.openingCarryIn !== null
                ? 'normal'
                : 'warning'
            }
          />
          <WeeklyMetric
            label="Flow starts"
            value={
              week.plannedStartsKnown && week.plannedStarts !== null
                ? `${formatHours(week.plannedStarts)} hrs`
                : 'Unknown'
            }
            emphasis={
              week.plannedStartsKnown && week.plannedStarts !== null
                ? 'normal'
                : 'warning'
            }
          />
          <WeeklyMetric
            label="Flow capacity"
            value={
              week.flowCapacity === null
                ? 'Unknown'
                : `${formatHours(week.flowCapacity)} hrs`
            }
            emphasis={week.flowCapacity === null ? 'warning' : 'normal'}
          />
          <WeeklyMetric
            label="Ending carry"
            value={
              week.endingCarryOut === null
                ? 'Unresolved'
                : `${formatHours(week.endingCarryOut)} hrs`
            }
            emphasis={week.unresolvedFlow ? 'warning' : 'normal'}
          />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">
            Remaining/Over is the starts-only scheduled balance. Ending Carry is
            the full rolling-flow result.
          </p>
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

      {week.unresolvedFlow ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Rolling flow is unresolved because required values are unknown. No numeric
          carry is inferred.
        </p>
      ) : (
        <p className="mt-2 text-xs font-medium text-slate-600">
          {week.carriesIntoNextShopDay
            ? 'Carry flows into the next shop day.'
            : 'No carry flows into the next shop day.'}
        </p>
      )}

      {week.hasActualCarryReset ? (
        <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-medium text-sky-800">
          {week.checkpointCount} actual carry checkpoint
          {week.checkpointCount === 1 ? '' : 's'} reset rolling flow this week.
        </p>
      ) : null}

      {week.weekendBookingExceptionCount > 0 ? (
        <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold text-amber-900">
            Weekend booking exceptions — included in rolling flow
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {week.weekendExceptions.flatMap((exception) =>
              exception.cards.map((card) => (
                <div
                  key={card.bookingId}
                  className="rounded-md border border-amber-200 bg-white px-2.5 py-2 text-xs"
                >
                  <p className="font-semibold text-amber-900">
                    {formatWeekendDate(exception.date)} — scheduled on a weekend
                  </p>
                  <p className="mt-0.5 font-medium text-slate-900">
                    {card.title}
                  </p>
                  {card.customer && card.customer !== card.title ? (
                    <p className="text-slate-600">{card.customer}</p>
                  ) : null}
                  <p className="mt-0.5 text-slate-600">
                    {card.shopHoursKnown && card.shopHours !== null
                      ? `${formatHours(card.shopHours)} Shop Hours`
                      : 'Missing Shop Hours'}
                  </p>
                </div>
              )),
            )}
          </div>
        </div>
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

function formatWeekendDate(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
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
