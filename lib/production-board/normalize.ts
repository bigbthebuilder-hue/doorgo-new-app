import type { DailyCapacity } from './capacity-types';
import type { ConfirmedFlowCheckpoint } from '../production-flow/checkpoint-types';
import {
  PRODUCTION_FLOW_BASELINE_DATE,
  PRODUCTION_FLOW_BASELINE_OPENING_CARRY,
} from './flow-constants';
import type {
  DoorGoJobRow,
  ProductionBoardCard,
  ProductionBoardDay,
  ProductionBoardSummary,
  ProductionBoardViewModel,
  ProductionBoardWeek,
  ProductionBookingRow,
  ProductionFlowUnresolvedReason,
} from './types';

function addDaysToDateOnly(dateText: string, days: number): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function toHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeProductionBoard(
  bookings: ProductionBookingRow[],
  jobs: DoorGoJobRow[],
  capacityRows: DailyCapacity[],
  params: {
    startDate: string;
    endDateExclusive: string;
    weeks: number;
    calculationStartDate?: string;
    checkpoints?: ConfirmedFlowCheckpoint[];
  },
): ProductionBoardViewModel {
  const jobsById = new Map(jobs.map((job) => [job.job_id, job]));

  const cards: ProductionBoardCard[] = bookings.map((row) => {
    const linkedJob = row.job_id ? jobsById.get(row.job_id) ?? null : null;
    const isDoorGoLinked = Boolean(row.job_id);
    const shopHours = toHours(row.shop_hours);

    return {
      bookingId: row.booking_id,
      type: isDoorGoLinked ? 'doorgo_linked' : 'biztrack_only',
      typeLabel: isDoorGoLinked ? 'DoorGo-linked' : 'BizTrack-only',
      productionDate: row.production_date,
      title:
        row.title ||
        linkedJob?.customer ||
        row.job_id ||
        'Untitled production booking',
      customer: linkedJob?.customer ?? null,
      jobId: row.job_id,
      calendarId: row.calendar_id,
      calendarEventId: row.calendar_event_id,
      shopHours,
      shopHoursKnown: shopHours !== null,
      salesperson: row.salesperson || linkedJob?.salesperson || null,
      source: row.source,
      sourceSystem: row.source_system,
      bookingKind: row.booking_kind,
      locked: row.locked === true,
      completedAt: row.completed_at ?? null,
    };
  });

  const cardsByDate = new Map<string, ProductionBoardCard[]>();

  for (const card of cards) {
    const existing = cardsByDate.get(card.productionDate) ?? [];
    existing.push(card);
    cardsByDate.set(card.productionDate, existing);
  }

  const capacityByDate = new Map(
    capacityRows.map((capacity) => [capacity.productionDate, capacity]),
  );

  const visibleDates = Array.from(
    new Set([...cardsByDate.keys(), ...capacityByDate.keys()]),
  )
    .filter((date) => date >= params.startDate && date < params.endDateExclusive)
    .filter((date) => {
      const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    })
    .sort((a, b) => a.localeCompare(b));

  const calculationStartDate = params.calculationStartDate ?? params.startDate;
  const checkpointsByDate = new Map<string, ConfirmedFlowCheckpoint>();

  for (const checkpoint of params.checkpoints ?? []) {
    if (checkpointsByDate.has(checkpoint.productionDate)) {
      throw new Error(
        `Multiple confirmed production flow checkpoints found for ${checkpoint.productionDate}`,
      );
    }

    checkpointsByDate.set(checkpoint.productionDate, checkpoint);
  }
  const flowByDate = new Map<
    string,
    Pick<
      ProductionBoardDay,
      | 'plannedStarts'
      | 'plannedStartsKnown'
      | 'openingCarryIn'
      | 'openingCarryKnown'
      | 'calculatedOpeningCarry'
      | 'actualOpeningCarry'
      | 'authoritativeOpeningCarry'
      | 'adjustmentHours'
      | 'hasActualCarryCheckpoint'
      | 'checkpointId'
      | 'checkpointProductionDate'
      | 'checkpointRevisionNumber'
      | 'checkpointRecordedAt'
      | 'checkpointRecordedByUserId'
      | 'checkpointConfirmedAt'
      | 'checkpointConfirmedByUserId'
      | 'checkpointActorType'
      | 'checkpointSourceSystem'
      | 'checkpointNote'
      | 'checkpointCalculationVersion'
      | 'flowLoad'
      | 'endingCarryOut'
      | 'openFlowCapacity'
      | 'flowStatus'
      | 'flowUnresolvedReason'
      | 'weekendBookingException'
    >
  >();
  let carry: number | null =
    calculationStartDate === PRODUCTION_FLOW_BASELINE_DATE
      ? PRODUCTION_FLOW_BASELINE_OPENING_CARRY
      : null;
  let unresolvedReason: ProductionFlowUnresolvedReason | null =
    carry === null ? 'before_baseline' : null;
  let checkpointAuthorityEstablished = false;

  for (
    let date = calculationStartDate;
    date < params.endDateExclusive;
    date = addDaysToDateOnly(date, 1)
  ) {
    if (
      date === PRODUCTION_FLOW_BASELINE_DATE &&
      !checkpointAuthorityEstablished
    ) {
      carry = PRODUCTION_FLOW_BASELINE_OPENING_CARRY;
      unresolvedReason = null;
    }

    const dateCards = cardsByDate.get(date) ?? [];
    const checkpoint = checkpointsByDate.get(date) ?? null;
    const plannedStartsKnown = dateCards.every((card) => card.shopHoursKnown);
    const plannedStarts = plannedStartsKnown
      ? dateCards.reduce((sum, card) => sum + (card.shopHours ?? 0), 0)
      : null;
    let calculatedOpeningCarry = carry;
    if (
      checkpoint &&
      date === calculationStartDate &&
      calculatedOpeningCarry === null
    ) {
      calculatedOpeningCarry = checkpoint.calculatedOpeningCarrySnapshot;
    }
    const actualOpeningCarry = checkpoint?.openingCarryHours ?? null;
    const authoritativeOpeningCarry =
      actualOpeningCarry ?? calculatedOpeningCarry;
    const openingCarryIn = authoritativeOpeningCarry;
    const openingCarryKnown = openingCarryIn !== null;
    if (checkpoint) {
      unresolvedReason = null;
      checkpointAuthorityEstablished = true;
    }
    const flowLoad =
      openingCarryKnown && plannedStartsKnown
        ? openingCarryIn + (plannedStarts ?? 0)
        : null;
    const capacity = capacityByDate.get(date) ?? null;
    const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isClosure = capacity?.isClosed || capacity?.source === 'closure';
    const implicitWeekendCapacity = isWeekend && capacity === null;
    const availableCapacity =
      isClosure || implicitWeekendCapacity
        ? 0
        : capacity?.availableHours ?? null;
    const capacityKnown =
      Boolean(isClosure) ||
      implicitWeekendCapacity ||
      (capacity !== null &&
        capacity.source !== 'unknown' &&
        availableCapacity !== null);
    let endingCarryOut: number | null = null;
    let openFlowCapacity: number | null = null;
    let dayReason: ProductionFlowUnresolvedReason | null = null;

    if (!plannedStartsKnown) {
      dayReason = 'missing_shop_hours';
    } else if (!openingCarryKnown) {
      dayReason = unresolvedReason === 'before_baseline' ? 'before_baseline' : 'upstream_unresolved';
    } else if (
      capacityKnown &&
      availableCapacity !== null &&
      flowLoad !== null
    ) {
      endingCarryOut = Math.max(0, flowLoad - availableCapacity);
      openFlowCapacity = Math.max(0, availableCapacity - flowLoad);
    } else if (flowLoad === 0) {
      endingCarryOut = 0;
      dayReason = null;
    } else {
      dayReason = 'unknown_capacity';
    }

    carry = endingCarryOut;
    unresolvedReason = dayReason;
    flowByDate.set(date, {
      plannedStarts,
      plannedStartsKnown,
      openingCarryIn,
      openingCarryKnown,
      calculatedOpeningCarry,
      actualOpeningCarry,
      authoritativeOpeningCarry,
      adjustmentHours: checkpoint
        ? checkpoint.adjustmentHoursSnapshot ??
          (calculatedOpeningCarry === null
            ? null
            : checkpoint.openingCarryHours - calculatedOpeningCarry)
        : null,
      hasActualCarryCheckpoint: checkpoint !== null,
      checkpointId: checkpoint?.checkpointId ?? null,
      checkpointProductionDate: checkpoint?.productionDate ?? null,
      checkpointRevisionNumber: checkpoint?.revisionNumber ?? null,
      checkpointRecordedAt: checkpoint?.recordedAt ?? null,
      checkpointRecordedByUserId: checkpoint?.recordedByUserId ?? null,
      checkpointConfirmedAt: checkpoint?.confirmedAt ?? null,
      checkpointConfirmedByUserId: checkpoint?.confirmedByUserId ?? null,
      checkpointActorType: checkpoint?.actorType ?? null,
      checkpointSourceSystem: checkpoint?.sourceSystem ?? null,
      checkpointNote: checkpoint?.note ?? null,
      checkpointCalculationVersion: checkpoint?.calculationVersion ?? null,
      flowLoad,
      endingCarryOut,
      openFlowCapacity,
      flowStatus: endingCarryOut === null ? 'unresolved' : 'resolved',
      flowUnresolvedReason: dayReason,
      weekendBookingException:
        dateCards.length > 0 && isWeekend,
    });
  }

  const days: ProductionBoardDay[] = visibleDates.map((date) => {
    const sortedCards = (cardsByDate.get(date) ?? []).sort((a, b) =>
      a.title.localeCompare(b.title),
    );
    const missingShopHoursCount = sortedCards.filter(
      (card) => !card.shopHoursKnown,
    ).length;
    const totalKnownShopHours = sortedCards.reduce(
      (sum, card) => sum + (card.shopHoursKnown ? card.shopHours ?? 0 : 0),
      0,
    );

    const capacity = capacityByDate.get(date) ?? null;
    const isClosed = Boolean(capacity?.isClosed || capacity?.source === 'closure');
    const isExplicitlyClosed = capacity?.isClosed === true;
    const availableHours = isClosed ? 0 : capacity?.availableHours ?? null;
    const capacityKnown =
      isClosed ||
      (capacity !== null &&
        capacity.source !== 'unknown' &&
        availableHours !== null);
    const comparisonComplete = capacityKnown && missingShopHoursCount === 0;
    const remainingHours = comparisonComplete && availableHours !== null
      ? Math.max(0, availableHours - totalKnownShopHours)
      : null;
    const overloadHours = comparisonComplete && availableHours !== null
      ? Math.max(0, totalKnownShopHours - availableHours)
      : null;

    return {
      date,
      totalKnownShopHours,
      bookingCount: sortedCards.length,
      missingShopHoursCount,
      availableHours,
      staffCapacityHours: capacity?.staffCapacityHours ?? null,
      deductionHours: capacity?.deductionHours ?? null,
      capacitySource: capacity?.source ?? 'unknown',
      capacityKnown,
      isClosed,
      isExplicitlyClosed,
      capacityNotes: capacity?.notes ?? null,
      remainingHours,
      overloadHours,
      ...(flowByDate.get(date) ?? {
        plannedStarts: null,
        plannedStartsKnown: false,
        openingCarryIn: null,
        openingCarryKnown: false,
        calculatedOpeningCarry: null,
        actualOpeningCarry: null,
        authoritativeOpeningCarry: null,
        adjustmentHours: null,
        hasActualCarryCheckpoint: false,
        checkpointId: null,
        checkpointProductionDate: null,
        checkpointRevisionNumber: null,
        checkpointRecordedAt: null,
        checkpointRecordedByUserId: null,
        checkpointConfirmedAt: null,
        checkpointConfirmedByUserId: null,
        checkpointActorType: null,
        checkpointSourceSystem: null,
        checkpointNote: null,
        checkpointCalculationVersion: null,
        flowLoad: null,
        endingCarryOut: null,
        openFlowCapacity: null,
        flowStatus: 'unresolved' as const,
        flowUnresolvedReason: 'upstream_unresolved' as const,
        weekendBookingException: false,
      }),
      cards: sortedCards,
    };
  });

  const weekGroups: ProductionBoardWeek[] = Array.from(
    { length: params.weeks },
    (_, weekIndex) => {
      const startDate = addDaysToDateOnly(params.startDate, weekIndex * 7);
      const endDateExclusive = addDaysToDateOnly(startDate, 7);
      const weekDays = days.filter(
        (day) => day.date >= startDate && day.date < endDateExclusive,
      );
      const bookingCount = weekDays.reduce(
        (sum, day) => sum + day.bookingCount,
        0,
      );
      const totalKnownShopHours = weekDays.reduce(
        (sum, day) => sum + day.totalKnownShopHours,
        0,
      );
      const missingShopHoursCount = weekDays.reduce(
        (sum, day) => sum + day.missingShopHoursCount,
        0,
      );
      const totalAvailableHours = weekDays.reduce(
        (sum, day) =>
          sum +
          (day.capacityKnown && day.availableHours !== null
            ? day.availableHours
            : 0),
        0,
      );
      const unknownCapacityDayCount = weekDays.filter(
        (day) => !day.capacityKnown,
      ).length;
      const closureCount = weekDays.filter((day) => day.isClosed).length;
      const dailyOverloadCount = weekDays.filter(
        (day) => (day.overloadHours ?? 0) > 0,
      ).length;
      const capacityComplete =
        weekDays.length > 0 && unknownCapacityDayCount === 0;
      const comparisonComplete =
        capacityComplete && missingShopHoursCount === 0;
      const remainingHours = comparisonComplete
        ? Math.max(0, totalAvailableHours - totalKnownShopHours)
        : null;
      const overloadHours = comparisonComplete
        ? Math.max(0, totalKnownShopHours - totalAvailableHours)
        : null;
      const firstDayFlow = flowByDate.get(startDate) ?? null;
      const effectiveEndExclusive =
        endDateExclusive < params.endDateExclusive
          ? endDateExclusive
          : params.endDateExclusive;
      const lastDate = addDaysToDateOnly(effectiveEndExclusive, -1);
      const lastDayFlow = flowByDate.get(lastDate) ?? null;
      const allWeekDates = Array.from({ length: 7 }, (_, index) =>
        addDaysToDateOnly(startDate, index),
      ).filter((date) => date < params.endDateExclusive);
      const weekFlows = allWeekDates.map((date) => flowByDate.get(date)).filter(Boolean);
      const plannedStartsKnown = weekFlows.every((flow) => flow?.plannedStartsKnown);
      const plannedStarts = plannedStartsKnown
        ? weekFlows.reduce((sum, flow) => sum + (flow?.plannedStarts ?? 0), 0)
        : null;
      const flowCapacityKnown = allWeekDates.every((date) => {
        const capacity = capacityByDate.get(date) ?? null;
        const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        return (
          capacity?.isClosed === true ||
          capacity?.source === 'closure' ||
          (isWeekend && capacity === null) ||
          (capacity !== null &&
            capacity.source !== 'unknown' &&
            capacity.availableHours !== null)
        );
      });
      const flowCapacity = flowCapacityKnown
        ? allWeekDates.reduce(
            (sum, date) => {
              const capacity = capacityByDate.get(date) ?? null;
              const isClosure =
                capacity?.isClosed === true || capacity?.source === 'closure';
              return sum + (isClosure ? 0 : capacity?.availableHours ?? 0);
            },
            0,
          )
        : null;
      const unresolvedFlow = lastDayFlow?.endingCarryOut === null || !lastDayFlow;
      const firstUnresolved = weekFlows.find((flow) => flow?.flowStatus === 'unresolved');
      const weekendExceptions = allWeekDates
        .filter((date) => {
          const dayOfWeek = new Date(`${date}T00:00:00Z`).getUTCDay();
          return (dayOfWeek === 0 || dayOfWeek === 6) && (cardsByDate.get(date)?.length ?? 0) > 0;
        })
        .map((date) => {
          const weekendCards = (cardsByDate.get(date) ?? []).sort((a, b) =>
            a.title.localeCompare(b.title),
          );
          const plannedStartsKnown = weekendCards.every((card) => card.shopHoursKnown);

          return {
            date,
            cards: weekendCards,
            plannedStartsKnown,
            plannedStarts: plannedStartsKnown
              ? weekendCards.reduce((sum, card) => sum + (card.shopHours ?? 0), 0)
              : null,
          };
        });
      const checkpointCount = allWeekDates.filter((date) =>
        checkpointsByDate.has(date),
      ).length;

      return {
        weekIndex,
        startDate,
        endDateExclusive,
        days: weekDays,
        bookingCount,
        totalKnownShopHours,
        missingShopHoursCount,
        totalAvailableHours,
        unknownCapacityDayCount,
        closureCount,
        dailyOverloadCount,
        capacityComplete,
        comparisonComplete,
        remainingHours,
        overloadHours,
        openingCarryIn: firstDayFlow?.openingCarryIn ?? null,
        openingCarryKnown: firstDayFlow?.openingCarryKnown ?? false,
        plannedStarts,
        plannedStartsKnown,
        flowCapacity,
        endingCarryOut: lastDayFlow?.endingCarryOut ?? null,
        unresolvedFlow,
        flowUnresolvedReason: firstUnresolved?.flowUnresolvedReason ?? null,
        carriesIntoNextShopDay:
          !lastDayFlow || lastDayFlow.endingCarryOut === null
            ? null
            : lastDayFlow.endingCarryOut > 0,
        weekendBookingExceptionCount: weekendExceptions.reduce(
          (sum, exception) => sum + exception.cards.length,
          0,
        ),
        weekendExceptions,
        checkpointCount,
        hasActualCarryReset: checkpointCount > 0,
      };
    },
  );

  const visibleCards = cards.filter(
    (card) =>
      card.productionDate >= params.startDate &&
      card.productionDate < params.endDateExclusive,
  );
  const visibleScheduledDates = new Set(
    visibleCards.map((card) => card.productionDate),
  );
  const summary: ProductionBoardSummary = {
    totalBookings: visibleCards.length,
    totalKnownShopHours: visibleCards.reduce(
      (sum, card) => sum + (card.shopHoursKnown ? card.shopHours ?? 0 : 0),
      0,
    ),
    scheduledDays: visibleScheduledDates.size,
    doorGoLinkedCount: visibleCards.filter((card) => card.type === 'doorgo_linked').length,
    bizTrackOnlyCount: visibleCards.filter((card) => card.type === 'biztrack_only').length,
    missingShopHoursCount: visibleCards.filter((card) => !card.shopHoursKnown).length,
  };

  return {
    startDate: params.startDate,
    endDateExclusive: params.endDateExclusive,
    weeks: params.weeks,
    days,
    weekGroups,
    summary,
    calculationStartDate,
  };
}
