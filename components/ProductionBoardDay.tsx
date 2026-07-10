import { formatFriendlyDateOnly } from '@/lib/production-board/date-utils';
import type { ProductionBoardDay } from '@/lib/production-board/types';
import { ProductionBookingCard } from './ProductionBookingCard';

function formatHours(value: number): string {
  return value.toFixed(2);
}

function capacitySourceLabel(day: ProductionBoardDay): string | null {
  if (day.isClosed || day.capacitySource === 'closure') {
    return 'Closed';
  }

  if (day.capacitySource === 'override') {
    return 'Capacity override';
  }

  if (!day.capacityKnown || day.capacitySource === 'unknown') {
    return 'Capacity unknown';
  }

  return null;
}

export function ProductionBoardDay({ day }: { day: ProductionBoardDay }) {
  const sourceLabel = capacitySourceLabel(day);
  const comparisonIncomplete = day.missingShopHoursCount > 0;
  const overloaded = (day.overloadHours ?? 0) > 0;

  return (
    <section
      className={`rounded-xl border bg-white p-3 shadow-sm sm:p-4 ${
        overloaded
          ? 'border-rose-300'
          : day.isClosed
            ? 'border-slate-300 bg-slate-50'
            : 'border-slate-200'
      }`}
    >
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold text-slate-900">
              {formatFriendlyDateOnly(day.date)}
            </h2>
            {sourceLabel ? (
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  day.isClosed
                    ? 'bg-slate-200 text-slate-700'
                    : day.capacitySource === 'override'
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-amber-100 text-amber-800'
                }`}
              >
                {sourceLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {day.bookingCount} booking{day.bookingCount === 1 ? '' : 's'} •{' '}
            {formatHours(day.totalKnownShopHours)} known hours
          </p>
          {day.capacityNotes ? (
            <p className="mt-1 text-xs text-slate-500">{day.capacityNotes}</p>
          ) : null}
          {day.missingShopHoursCount > 0 ? (
            <p className="mt-1 text-sm font-medium text-amber-700">
              {day.missingShopHoursCount} booking
              {day.missingShopHoursCount === 1 ? '' : 's'} missing shop hours
            </p>
          ) : null}
        </div>

        <div className="grid min-w-full grid-cols-2 gap-2 text-sm sm:min-w-[25rem] sm:grid-cols-3 lg:min-w-[31rem]">
          <CapacityMetric label="Planned" value={`${formatHours(day.totalKnownShopHours)} hrs`} />
          <CapacityMetric
            label="Available"
            value={
              day.capacityKnown && day.availableHours !== null
                ? `${formatHours(day.availableHours)} hrs`
                : 'Unknown'
            }
          />
          <CapacityMetric
            label={overloaded ? 'Over' : 'Remaining'}
            value={
              comparisonIncomplete
                ? 'Incomplete'
                : overloaded && day.overloadHours !== null
                  ? `${formatHours(day.overloadHours)} hrs`
                  : day.remainingHours !== null
                    ? `${formatHours(day.remainingHours)} hrs`
                    : 'Unknown'
            }
            emphasis={overloaded ? 'danger' : 'normal'}
          />
        </div>
      </div>

      {comparisonIncomplete && day.capacityKnown ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Capacity comparison is incomplete until all booking Shop Hours are known.
        </p>
      ) : null}

      {day.cards.length > 0 ? (
        <div className="mt-3 grid gap-2">
          {day.cards.map((card) => (
            <ProductionBookingCard key={card.bookingId} card={card} />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No production bookings scheduled.</p>
      )}
    </section>
  );
}

function CapacityMetric({
  label,
  value,
  emphasis = 'normal',
}: {
  label: string;
  value: string;
  emphasis?: 'normal' | 'danger';
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        emphasis === 'danger'
          ? 'border-rose-200 bg-rose-50'
          : 'border-slate-200 bg-slate-50'
      }`}
    >
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-0.5 font-semibold ${
          emphasis === 'danger' ? 'text-rose-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
