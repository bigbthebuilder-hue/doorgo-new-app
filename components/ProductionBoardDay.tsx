import { formatFriendlyDateOnly } from '@/lib/production-board/date-utils';
import type { ProductionBoardDay } from '@/lib/production-board/types';
import { ProductionBookingCard } from './ProductionBookingCard';

export function ProductionBoardDay({ day }: { day: ProductionBoardDay }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-1 border-b border-slate-200 pb-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {formatFriendlyDateOnly(day.date)}
          </h2>
          <p className="text-sm text-slate-600">
            {day.bookingCount} booking{day.bookingCount === 1 ? '' : 's'} •{' '}
            {day.totalKnownShopHours.toFixed(2)} known hours
          </p>
        </div>
        {day.missingShopHoursCount > 0 ? (
          <p className="text-sm font-medium text-amber-700">
            {day.missingShopHoursCount} booking{day.missingShopHoursCount === 1 ? '' : 's'} missing shop hours
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {day.cards.map((card) => (
          <ProductionBookingCard key={card.bookingId} card={card} />
        ))}
      </div>
    </section>
  );
}
