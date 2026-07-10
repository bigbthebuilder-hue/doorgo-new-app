import type {
  DoorGoJobRow,
  ProductionBoardCard,
  ProductionBoardDay,
  ProductionBoardSummary,
  ProductionBoardViewModel,
  ProductionBookingRow,
} from './types';

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

  const grouped = new Map<string, ProductionBoardCard[]>();

  for (const card of cards) {
    const existing = grouped.get(card.productionDate) ?? [];
    existing.push(card);
    grouped.set(card.productionDate, existing);
  }

  const days: ProductionBoardDay[] = Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayCards]) => {
      const sortedCards = dayCards.sort((a, b) => a.title.localeCompare(b.title));
      const missingShopHoursCount = sortedCards.filter(
        (card) => !card.shopHoursKnown,
      ).length;

      return {
        date,
        totalKnownShopHours: sortedCards.reduce(
          (sum, card) => sum + (card.shopHoursKnown ? card.shopHours ?? 0 : 0),
          0,
        ),
        bookingCount: sortedCards.length,
        missingShopHoursCount,
        cards: sortedCards,
      };
    });

  const summary: ProductionBoardSummary = {
    totalBookings: cards.length,
    totalKnownShopHours: days.reduce((sum, day) => sum + day.totalKnownShopHours, 0),
    scheduledDays: days.length,
    doorGoLinkedCount: cards.filter((card) => card.type === 'doorgo_linked').length,
    bizTrackOnlyCount: cards.filter((card) => card.type === 'biztrack_only').length,
    missingShopHoursCount: cards.filter((card) => !card.shopHoursKnown).length,
  };

  return {
    startDate: params.startDate,
    endDateExclusive: params.endDateExclusive,
    weeks: params.weeks,
    days,
    summary,
  };
}