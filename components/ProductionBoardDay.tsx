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

  return (
    <section
      data-production-date={interaction ? day.date : undefined}
      onDragEnter={interaction ? (event) => interaction.onDayDragEnter(day.date, event) : undefined}
      onDragOver={interaction ? (event) => interaction.onDayDragOver(day.date, event) : undefined}
      onDragLeave={interaction ? (event) => interaction.onDayDragLeave(day.date, event) : undefined}
      onDrop={interaction ? (event) => interaction.onDayDrop(day.date, event) : undefined}
      className={`overflow-hidden rounded-xl border bg-white shadow-sm ${
        operationalStatus === 'building'
          ? 'border-rose-400 bg-rose-50/30'
          : operationalStatus === 'reducing' ||
              operationalStatus === 'unchanged' ||
              operationalStatus === 'unresolved'
            ? 'border-amber-300 bg-amber-50/20'
            : 'border-emerald-300'
      } ${interaction?.hoveredDate === day.date ? 'relative -translate-y-0.5 border-sky-500 shadow-lg ring-2 ring-sky-300' : ''
      }`}
    >
      <div className="border-b border-slate-200 bg-white/80 px-3 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-1.5">
          <h3 className="text-sm font-semibold text-slate-900">
            {formatCompactDate(day.date)}
          </h3>

          <div className="flex flex-wrap justify-end gap-1">
            <span
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
            </span>
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
          {formatHours(day.totalKnownShopHours)} planned
          {' • '}
          {day.capacityKnown && day.availableHours !== null
            ? `${formatHours(day.availableHours)} available`
            : 'capacity unknown'}
        </p>

        <div className="mt-2 grid grid-cols-4 gap-1 text-center">
          <FlowMetric
            label="Carry in"
            value={day.openingCarryKnown ? day.openingCarryIn : null}
            unknownLabel="Unresolved"
          />
          <FlowMetric
            label="Starts"
            value={day.plannedStartsKnown ? day.plannedStarts : null}
            unknownLabel="Unknown"
          />
          <FlowMetric
            label="Capacity"
            value={day.capacityKnown ? day.availableHours : null}
            unknownLabel="Unknown"
          />
          <FlowMetric
            label="Carry out"
            value={day.endingCarryOut}
            unknownLabel="Unresolved"
          />
        </div>

        {day.hasActualCarryCheckpoint ? (
          <div className="mt-2 rounded-md border border-sky-200 bg-sky-50 px-2 py-2 text-[10px] text-sky-950">
            <p className="font-semibold">Actual carry checkpoint</p>
            <div className="mt-1 grid grid-cols-3 gap-1">
              <CheckpointMetric
                label="Calculated carry in"
                value={day.calculatedOpeningCarry}
              />
              <CheckpointMetric label="Actual carry in" value={day.actualOpeningCarry} />
              <CheckpointMetric
                label="Adjustment"
                value={day.adjustmentHours}
                signed
              />
            </div>
            <p className="mt-1 text-sky-800">
              Revision {day.checkpointRevisionNumber}
              {day.checkpointActorType ? ` • ${day.checkpointActorType}` : ''}
              {day.checkpointSourceSystem ? ` • ${day.checkpointSourceSystem}` : ''}
            </p>
            {day.checkpointRecordedAt || day.checkpointConfirmedAt ? (
              <p className="mt-0.5 text-sky-800">
                {day.checkpointRecordedAt
                  ? `Recorded ${formatCheckpointTime(day.checkpointRecordedAt)}`
                  : ''}
                {day.checkpointRecordedAt && day.checkpointConfirmedAt ? ' • ' : ''}
                {day.checkpointConfirmedAt
                  ? `Confirmed ${formatCheckpointTime(day.checkpointConfirmedAt)}`
                  : ''}
              </p>
            ) : null}
            {day.checkpointNote ? (
              <p className="mt-1 leading-snug text-sky-900">{day.checkpointNote}</p>
            ) : null}
          </div>
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

        <p
          className={`mt-1 text-xs font-semibold ${
            overloaded
              ? 'text-rose-700'
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
            <ProductionBookingCard
              key={card.bookingId}
              card={card}
              interaction={interaction}
            />
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

function CheckpointMetric({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number | null;
  signed?: boolean;
}) {
  return (
    <div className="rounded bg-white/80 px-1 py-1">
      <p className="text-[8px] uppercase tracking-wide text-sky-700">{label}</p>
      <p className="font-semibold">
        {value === null
          ? 'Unknown'
          : `${signed && value > 0 ? '+' : ''}${formatHours(value)} hrs`}
      </p>
    </div>
  );
}

function formatCheckpointTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Vancouver',
  }).format(date);
}

function FlowMetric({
  label,
  value,
  unknownLabel,
}: {
  label: string;
  value: number | null;
  unknownLabel: 'Unknown' | 'Unresolved';
}) {
  return (
    <div className="rounded-md bg-slate-100 px-1 py-1.5">
      <p className="text-[8px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-[10px] font-semibold text-slate-800">
        {value === null ? unknownLabel : formatHours(value)}
      </p>
    </div>
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
