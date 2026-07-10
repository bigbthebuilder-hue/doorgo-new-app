import type { DailyCapacity } from './capacity-types';
import type {
  DoorGoJobRow,
  ProductionBoardCard,
  ProductionBoardDay,
  ProductionBoardSummary,
  ProductionBoardViewModel,
  ProductionBoardWeek,
  ProductionBookingRow,
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
  params: { startDate: string; endDateExclusive: string; weeks: number },
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
  ).sort((a, b) => a.localeCompare(b));

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
    const availableHours = capacity?.availableHours ?? null;
    const capacityKnown =
      capacity !== null &&
      capacity.source !== 'unknown' &&
      availableHours !== null;
    const comparisonComplete = capacityKnown && missingShopHoursCount === 0;
    const remainingHours = comparisonComplete
      ? Math.max(0, availableHours - totalKnownShopHours)
      : null;
    const overloadHours = comparisonComplete
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
      isClosed: capacity?.isClosed ?? false,
      capacityNotes: capacity?.notes ?? null,
      remainingHours,
      overloadHours,
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
      };
    },
  );

  const summary: ProductionBoardSummary = {
    totalBookings: cards.length,
    totalKnownShopHours: cards.reduce(
      (sum, card) => sum + (card.shopHoursKnown ? card.shopHours ?? 0 : 0),
      0,
    ),
    scheduledDays: cardsByDate.size,
    doorGoLinkedCount: cards.filter((card) => card.type === 'doorgo_linked').length,
    bizTrackOnlyCount: cards.filter((card) => card.type === 'biztrack_only').length,
    missingShopHoursCount: cards.filter((card) => !card.shopHoursKnown).length,
  };

  return {
    startDate: params.startDate,
    endDateExclusive: params.endDateExclusive,
    weeks: params.weeks,
    days,
    weekGroups,
    summary,
  };
}
