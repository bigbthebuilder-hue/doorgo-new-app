import type { ProductionBoardCard } from '@/lib/production-board/types';
import type { ProductionBoardInteraction } from './production-board-interaction';

export function ProductionBookingCard({
  card,
  interaction,
}: {
  card: ProductionBoardCard;
  interaction?: ProductionBoardInteraction;
}) {
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
  const blockReason = interaction?.getMoveBlockReason(card) ?? null;
  const canMove = Boolean(interaction && blockReason === null);
  const canDrag = Boolean(interaction && canMove && interaction.canDragCard(card));
  const pending = interaction?.pendingBookingId === card.bookingId;
  const completed = card.completedAt !== null;

  return (
    <article
      draggable={canDrag || undefined}
      tabIndex={interaction ? 0 : undefined}
      aria-busy={pending || undefined}
      onDragStart={canDrag ? (event) => interaction?.onCardDragStart(card, event) : undefined}
      onDragEnd={canDrag ? () => interaction?.onCardDragEnd(card) : undefined}
      onClickCapture={interaction ? (event) => interaction.onCardClickCapture(card, event) : undefined}
      className={`rounded-lg border border-slate-200 p-2 ${completed ? 'bg-slate-200 text-slate-700' : 'bg-slate-50'} ${
        card.type === 'doorgo_linked'
          ? 'border-l-4 border-l-sky-400'
          : 'border-l-4 border-l-slate-400'
      } ${canDrag ? 'cursor-grab transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md active:cursor-grabbing' : ''
      } ${pending ? 'pointer-events-none opacity-65 ring-2 ring-sky-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold leading-snug text-slate-900">
            {title}
          </h4>

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {completed ? (
              <span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                Completed
              </span>
            ) : null}
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

      {interaction ? (
        <div className="mt-2 border-t border-slate-200 pt-2">
          <button
            type="button"
            disabled={!canMove || pending}
            onDragStart={(event) => event.preventDefault()}
            onClick={(event) => interaction.onMoveRequest(card, event.currentTarget)}
            className="min-h-10 rounded-md border border-sky-300 bg-white px-3 py-2 text-xs font-semibold text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
          >
            {pending ? 'Move pending' : 'Move'}
          </button>
          {blockReason ? (
            <p className="mt-1 text-[10px] leading-snug text-slate-500">{blockReason}</p>
          ) : (
            <p className="mt-1 hidden text-[10px] text-slate-500 [@media(hover:hover)_and_(pointer:fine)]:block">
              Drag this card to a visible date, or choose Move.
            </p>
          )}
        </div>
      ) : null}

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
