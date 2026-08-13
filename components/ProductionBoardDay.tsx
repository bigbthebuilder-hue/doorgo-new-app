'use client';

import { useState } from 'react';
import type { ProductionBoardDay } from '@/lib/production-board/types';
import {
  classifyFlowOperationalStatus,
  dailyFlowStatusLabel,
  startsOnlyBalanceLabel,
} from '@/lib/production-board/flow-presentation';
import { ProductionBookingCard } from './ProductionBookingCard';
import type { ProductionBoardInteraction } from './production-board-interaction';

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

export function ProductionBoardDay({
  day,
  interaction,
}: {
  day: ProductionBoardDay;
  interaction?: ProductionBoardInteraction;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleCardLimit = interaction ? 4 : 6;
  const hiddenCardCount = Math.max(0, day.cards.length - visibleCardLimit);
  const visibleCards = expanded ? day.cards : day.cards.slice(0, visibleCardLimit);
  const bookingListId = `production-bookings-${day.date}`;
  const sourceLabel = capacitySourceLabel(day);
  const comparisonIncomplete = day.missingShopHoursCount > 0;
  const overloaded = (day.overloadHours ?? 0) > 0;
  const needsReview = !day.capacityKnown || comparisonIncomplete;
  const operationalStatus = classifyFlowOperationalStatus({
    unresolved: day.flowStatus === 'unresolved',
    openingCarry: day.openingCarryIn,
    endingCarry: day.endingCarryOut,
  });
  const resultLabel = startsOnlyBalanceLabel({
    comparisonComplete: day.capacityKnown && !comparisonIncomplete,
    remainingHours: day.remainingHours,
    overloadHours: day.overloadHours,
  });
  const calendarStateClasses = day.dateState === 'past'
    ? 'bg-slate-200/80'
    : day.dateState === 'today'
      ? 'bg-sky-50 ring-2 ring-sky-400'
      : 'bg-white';
  const headerStateClasses = day.dateState === 'past'
    ? 'bg-slate-100'
    : day.dateState === 'today'
      ? 'bg-sky-100/80'
      : 'bg-white/80';

  return (
    <section
      data-day-state={day.dateState}
      data-production-date={interaction ? day.date : undefined}
      onDragEnter={interaction ? (event) => interaction.onDayDragEnter(day.date, event) : undefined}
      onDragOver={interaction ? (event) => interaction.onDayDragOver(day.date, event) : undefined}
      onDragLeave={interaction ? (event) => interaction.onDayDragLeave(day.date, event) : undefined}
      onDrop={interaction ? (event) => interaction.onDayDrop(day.date, event) : undefined}
      className={`overflow-hidden rounded-md border ${calendarStateClasses} ${
        operationalStatus === 'building'
          ? 'border-rose-400 bg-rose-50/30'
          : operationalStatus === 'reducing' ||
              operationalStatus === 'unchanged' ||
              operationalStatus === 'unresolved'
            ? 'border-amber-300 bg-amber-50/20'
            : 'border-emerald-300'
      } ${day.isClosed ? 'outline outline-1 outline-slate-500' : ''
      } ${interaction?.hoveredDate === day.date ? 'relative -translate-y-0.5 border-sky-600 shadow-xl ring-4 ring-sky-400' : ''
      }`}
    >
      <div className={`border-b border-slate-300 px-1.5 py-1 ${headerStateClasses}`}>
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h3 className="text-sm font-semibold text-slate-900">
            {formatCompactDate(day.date)}
          </h3>

          <div className="flex flex-wrap justify-end gap-1">
            {day.dateState !== 'future' ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                day.dateState === 'today'
                  ? 'bg-sky-700 text-white'
                  : 'bg-slate-700 text-white'
              }`}>
                {day.dateState === 'today' ? 'Today' : 'Past'}
              </span>
            ) : null}
            {operationalStatus !== 'clear' ? <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                operationalStatus === 'building'
                  ? 'bg-rose-100 text-rose-700'
                  : operationalStatus === 'reducing' ||
                      operationalStatus === 'unchanged' ||
                      operationalStatus === 'unresolved'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-emerald-700'
              }`}
            >
              {dailyFlowStatusLabel(operationalStatus)}
            </span> : null}
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
          ) : null}
          </div>
        </div>

        <p className="mt-1 text-[11px] font-medium text-slate-600">
          {formatHours(day.totalKnownShopHours)} /{' '}
          {day.capacityKnown && day.availableHours !== null
            ? `${formatHours(day.availableHours)} hrs${overloaded ? ` · ${formatHours(day.overloadHours ?? 0)} over` : day.remainingHours !== null ? ` · ${formatHours(day.remainingHours)} free` : ''}`
            : 'capacity unknown'}
        </p>

        {(day.openingCarryIn ?? 0) !== 0 || (day.endingCarryOut ?? 0) !== 0 ? <p className="mt-0.5 text-[10px] text-slate-500">Carry {day.openingCarryKnown ? formatHours(day.openingCarryIn ?? 0) : 'unresolved'} in · {day.endingCarryOut === null ? 'unresolved' : formatHours(day.endingCarryOut)} out</p> : null}

        {day.hasActualCarryCheckpoint ? (
          <p className="mt-1 rounded bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-900">
            ✓ Carry checkpoint recorded · {day.actualOpeningCarry === null ? 'actual carry unknown' : `${formatHours(day.actualOpeningCarry)} hrs actual`}
            {day.adjustmentHours ? ` · ${day.adjustmentHours > 0 ? '+' : ''}${formatHours(day.adjustmentHours)} hrs adjustment` : ''}
          </p>
        ) : null}

        {day.weekendBookingException ? (
          <p className="mt-2 rounded-md bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
            Weekend booking exception
          </p>
        ) : null}

        {day.flowStatus === 'unresolved' ? (
          <p className="mt-1 text-[10px] font-medium text-amber-800">
            Rolling flow unresolved: {flowReasonLabel(day.flowUnresolvedReason)}
          </p>
        ) : null}

        {overloaded || needsReview ? <p
          className={`mt-1 text-xs font-semibold ${
            overloaded
              ? 'text-rose-700'
              : needsReview
                  ? 'text-amber-800'
                  : 'text-emerald-700'
          }`}
        >
          {resultLabel}
        </p> : null}

        <p className="mt-0.5 text-[10px] text-slate-500">
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
        <div className="p-1" id={bookingListId}>
          {visibleCards.map((card) => (
            <ProductionBookingCard
              key={card.bookingId}
              card={card}
              interaction={interaction}
            />
          ))}
          {hiddenCardCount > 0 ? <button aria-controls={bookingListId} aria-expanded={expanded} className="min-h-8 rounded border border-dashed border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-sky-800" onClick={() => setExpanded((current) => !current)} type="button">{expanded ? 'Show fewer' : `+ ${hiddenCardCount} more`}</button> : null}
        </div>
      ) : (
        <p className="px-2 py-2 text-xs text-slate-500">
          No production bookings.
        </p>
      )}
    </section>
  );
}

function flowReasonLabel(
  reason: ProductionBoardDay['flowUnresolvedReason'],
): string {
  switch (reason) {
    case 'before_baseline':
      return 'pre-baseline carry is unknown';
    case 'missing_shop_hours':
      return 'booking Shop Hours are missing';
    case 'unknown_capacity':
      return 'capacity is unknown';
    default:
      return 'upstream carry is unresolved';
  }
}
