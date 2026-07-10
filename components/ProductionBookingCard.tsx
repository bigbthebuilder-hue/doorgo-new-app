import type { ProductionBoardCard } from '@/lib/production-board/types';

export function ProductionBookingCard({ card }: { card: ProductionBoardCard }) {
  const hoursLabel = card.shopHoursKnown
    ? `${card.shopHours?.toFixed(2) ?? '0.00'} hrs`
    : 'Hours missing';

  const title = card.title?.trim() || 'Untitled production booking';
  const customer = card.customer?.trim();
  const salesperson = card.salesperson?.trim();
  const technicalDetails = [
    card.calendarId ? `Calendar ID: ${card.calendarId}` : null,
    card.calendarEventId ? `Event ID: ${card.calendarEventId}` : null,
    card.source ? `Source: ${card.source}` : null,
    card.sourceSystem ? `Source system: ${card.sourceSystem}` : null,
  ].filter(Boolean);

  return (
    <article
      className={`rounded-lg border border-slate-200 bg-slate-50 p-2 ${
        card.type === 'doorgo_linked'
          ? 'border-l-4 border-l-sky-400'
          : 'border-l-4 border-l-slate-400'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold leading-snug text-slate-900">
            {title}
          </h4>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                card.type === 'doorgo_linked'
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {card.typeLabel}
            </span>

            <span
              className={`text-[11px] font-semibold ${
                card.shopHoursKnown ? 'text-slate-700' : 'text-amber-700'
              }`}
            >
              {hoursLabel}
            </span>
          </div>

          <p className="mt-1 text-[11px] leading-snug text-slate-600">
            {[salesperson, card.jobId ? `Job ${card.jobId}` : null]
              .filter(Boolean)
              .join(' • ')}
          </p>

          {customer && customer !== title ? (
            <p className="mt-0.5 text-[10px] leading-snug text-slate-500">
              {customer}
            </p>
          ) : null}
        </div>
      </div>

      {technicalDetails.length > 0 ? (
        <details className="mt-1.5 text-[10px] text-slate-500">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <div className="mt-1 space-y-1 break-all">
            {technicalDetails.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
