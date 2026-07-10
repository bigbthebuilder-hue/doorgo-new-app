import type { ProductionBoardDay } from '@/lib/production-board/types';
import { ProductionBookingCard } from './ProductionBookingCard';

function formatHours(value: number): string {
  return value.toFixed(2);
}

function formatCompactDate(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function capacitySourceLabel(day: ProductionBoardDay): string | null {
  if (day.isClosed || day.capacitySource === 'closure') {
    return 'Closed';
  }

  if (day.capacitySource === 'override') {
    return 'Override';
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
  const needsReview = !day.capacityKnown || comparisonIncomplete;

  const resultLabel = day.isClosed
    ? 'No production'
    : comparisonIncomplete
      ? 'Comparison incomplete'
      : overloaded && day.overloadHours !== null
        ? `${formatHours(day.overloadHours)} hrs over`
        : day.remainingHours !== null
          ? `${formatHours(day.remainingHours)} hrs open`
          : 'Capacity unknown';

  return (
    <section
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
        overloaded
          ? 'border-rose-400 bg-rose-50/30'
          : day.isClosed
            ? 'border-slate-300 bg-slate-100/80'
            : needsReview
              ? 'border-amber-300'
              : 'border-emerald-300'
      }`}
    >
      <div className="border-b border-slate-200 bg-white/80 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h3 className="text-sm font-semibold text-slate-900">
            {formatCompactDate(day.date)}
          </h3>

          {sourceLabel ? (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                day.isClosed
                  ? 'bg-slate-200 text-slate-700'
                  : day.capacitySource === 'override'
                    ? 'bg-violet-100 text-violet-700'
                    : 'bg-amber-100 text-amber-800'
              }`}
            >
              {sourceLabel}
            </span>
          ) : overloaded ? (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">
              Over capacity
            </span>
          ) : null}
        </div>

        <p className="mt-1 text-[11px] font-medium text-slate-600">
          {formatHours(day.totalKnownShopHours)} planned
          {' • '}
          {day.capacityKnown && day.availableHours !== null
            ? `${formatHours(day.availableHours)} available`
            : 'capacity unknown'}
        </p>

        <p
          className={`mt-1 text-xs font-semibold ${
            overloaded
              ? 'text-rose-700'
              : day.isClosed
                ? 'text-slate-600'
                : needsReview
                  ? 'text-amber-800'
                  : 'text-emerald-700'
          }`}
        >
          {resultLabel}
        </p>

        <p className="mt-1 text-[11px] text-slate-500">
          {day.bookingCount} booking{day.bookingCount === 1 ? '' : 's'}
          {day.missingShopHoursCount > 0
            ? ` • ${day.missingShopHoursCount} missing Shop Hours`
            : ''}
        </p>

        {day.capacityNotes ? (
          <p className="mt-1 text-[10px] leading-snug text-slate-500">
            {day.capacityNotes}
          </p>
        ) : null}
      </div>

      {day.cards.length > 0 ? (
        <div className="grid gap-2 p-2">
          {day.cards.map((card) => (
            <ProductionBookingCard key={card.bookingId} card={card} />
          ))}
        </div>
      ) : (
        <p className="px-3 py-4 text-xs text-slate-500">
          No production bookings.
        </p>
      )}
    </section>
  );
}
