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
  const movePending = pending && interaction?.pendingAction === 'move';
  const completionPending = pending && interaction?.pendingAction === 'completion';
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
      className={`production-booking-card border-b border-l-2 border-slate-200 border-l-slate-400 px-1.5 py-1 ${completed ? 'bg-slate-200 text-slate-700' : 'bg-white'} ${canDrag ? 'cursor-grab transition hover:bg-sky-50 active:cursor-grabbing' : ''
      } ${pending ? 'pointer-events-none opacity-65 ring-2 ring-sky-300' : ''
      }`}
    >
      <div className="flex items-center justify-between gap-1.5">
        <div className="min-w-0">
          <h4 className="truncate text-xs font-semibold leading-tight text-slate-900">
            {title}
          </h4>

          <div className="flex flex-wrap items-center gap-1">
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

          <p className="text-[10px] leading-tight text-slate-600">
            {[salesperson, card.jobId ? `Job ${card.jobId}` : null]
              .filter(Boolean)
              .join(' • ')}
          </p>

          {customer && customer !== title ? <span className="sr-only">Customer: {customer}</span> : null}
        </div>
        {interaction ? (
          <div className="flex shrink-0 gap-1">
            {!completed ? (
              <button
                type="button"
                disabled={!canMove || pending}
                onDragStart={(event) => event.preventDefault()}
                onClick={(event) => interaction.onMoveRequest(card, event.currentTarget)}
                className="min-h-7 rounded border border-sky-300 bg-white px-1.5 text-[10px] font-semibold text-sky-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
              >
                {movePending ? 'Moving…' : 'Move'}
              </button>
            ) : null}
            <button
              type="button"
              disabled={!canChangeCompletion || pending}
              aria-label={`${completed ? 'Reopen' : 'Complete'} ${title}`}
              onDragStart={(event) => event.preventDefault()}
              onClick={(event) => interaction.onCompletionRequest(card, event.currentTarget)}
              className={`min-h-7 rounded border px-1.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 ${
                completed
                  ? 'border-amber-300 bg-amber-50 text-amber-900'
                  : 'border-emerald-300 bg-emerald-50 text-emerald-900'
              }`}
            >
              {completionPending ? completed ? 'Reopening…' : 'Completing…' : completed ? 'Reopen' : 'Complete'}
            </button>
          </div>
        ) : null}
      </div>
      {interaction && blockReason ? <p className="text-[10px] leading-tight text-slate-500">{blockReason}</p> : null}
      {interaction && completionBlockReason && completionBlockReason !== blockReason ? <p className="text-[10px] leading-tight text-slate-500">{completionBlockReason}</p> : null}

      {interaction && technicalDetails.length > 0 ? (
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
