import type { ProductionBoardCard } from '@/lib/production-board/types';

export function ProductionBookingCard({ card }: { card: ProductionBoardCard }) {
  const hoursLabel = card.shopHoursKnown
    ? `${card.shopHours?.toFixed(2) ?? '0.00'} hrs`
    : 'Shop hours missing';

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
    <article className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                card.type === 'doorgo_linked'
                  ? 'bg-sky-100 text-sky-700'
                  : 'bg-slate-200 text-slate-700'
              }`}
            >
              {card.typeLabel}
            </span>
          </div>

          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
            {customer ? <span>{customer}</span> : null}
            {salesperson ? <span>Salesperson: {salesperson}</span> : null}
            {card.jobId ? <span>Job: {card.jobId}</span> : null}
          </div>
        </div>

        <div className="shrink-0 text-right text-sm font-medium text-slate-700">
          <div>{hoursLabel}</div>
        </div>
      </div>

      {technicalDetails.length > 0 ? (
        <details className="mt-2 text-[11px] text-slate-500">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <div className="mt-1 space-y-1">
            {technicalDetails.map((detail) => (
              <div key={detail}>{detail}</div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
