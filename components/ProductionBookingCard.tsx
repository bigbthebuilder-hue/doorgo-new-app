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
  const completionBlockReason = interaction?.getCompletionBlockReason(card) ?? null;
  const canChangeCompletion = Boolean(interaction && completionBlockReason === null);

  return (
    <article
      draggable={canDrag || undefined}
      tabIndex={interaction ? 0 : undefined}
      aria-busy={pending || undefined}
      onDragStart={canDrag ? (event) => interaction?.onCardDragStart(card, event) : undefined}
      onDragEnd={canDrag ? () => interaction?.onCardDragEnd(card) : undefined}
      onClickCapture={interaction ? (event) => interaction.onCardClickCapture(card, event) : undefined}
      className={`production-booking-card rounded-md border border-l-4 border-slate-200 border-l-slate-400 p-1.5 ${completed ? 'bg-slate-200 text-slate-700' : 'bg-slate-50'} ${canDrag ? 'cursor-grab transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-md active:cursor-grabbing' : ''
      } ${pending ? 'pointer-events-none opacity-65 ring-2 ring-sky-300' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[13px] font-semibold leading-snug text-slate-900">
            {title}
          </h4>

          <div className="mt-0.5 flex flex-wrap items-center gap-1">
            <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
              completed ? 'bg-slate-700 text-white' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {completed ? 'Completed' : 'Ready'}
            </span>
            <span
              className={`text-[11px] font-semibold ${
                card.shopHoursKnown ? 'text-slate-700' : 'text-amber-700'
              }`}
            >
              {hoursLabel}
            </span>
          </div>

          <p className="mt-0.5 text-[10px] leading-tight text-slate-600">
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
        <div className="mt-1.5 border-t border-slate-200 pt-1.5">
          <div className="flex flex-wrap gap-1.5">
            {!completed ? (
              <button
                type="button"
                disabled={!canMove || pending}
                onDragStart={(event) => event.preventDefault()}
                onClick={(event) => interaction.onMoveRequest(card, event.currentTarget)}
                className="min-h-8 rounded-md border border-sky-300 bg-white px-2 py-1 text-[11px] font-semibold text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {pending ? 'Move pending' : 'Move'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canChangeCompletion || pending}
              aria-label={`${completed ? 'Reopen' : 'Complete'} ${title}`}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => interaction.onCompletionRequest(card, event.currentTarget)}
              className={`min-h-8 rounded-md border px-2 py-1 text-[11px] font-semibold disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 ${
                completed
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900'
              }`}
            >
              {pending ? 'Action pending' : completed ? 'Reopen' : 'Complete'}
            </button>
          </div>
          {!completed && blockReason ? (
            <p className="mt-1 text-[10px] leading-snug text-slate-500">{blockReason}</p>
          ) : !completed ? (
            <p className="mt-1 hidden text-[10px] text-slate-500 [@media(hover:hover)_and_(pointer:fine)]:block">
              Drag this card to a visible date, or choose Move.
            </p>
          ) : null}
          {completionBlockReason && completionBlockReason !== blockReason ? (
            <p className="mt-1 text-[10px] leading-snug text-slate-500">{completionBlockReason}</p>
          ) : null}
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
