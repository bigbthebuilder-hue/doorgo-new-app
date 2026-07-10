import type {
  DoorGoJobRow,
  ProductionBoardCard,
  ProductionBoardDay,
  ProductionBookingRow,
} from './types';

function toHours(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function normalizeProductionBoard(
  bookings: ProductionBookingRow[],
  jobs: DoorGoJobRow[],
): ProductionBoardDay[] {
  const jobsById = new Map(jobs.map((job) => [job.job_id, job]));

  const cards: ProductionBoardCard[] = bookings.map((row) => {
    const linkedJob = row.job_id ? jobsById.get(row.job_id) ?? null : null;
    const isDoorGoLinked = Boolean(row.job_id);

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
      shopHours: toHours(row.shop_hours),
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

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayCards]) => ({
      date,
      totalShopHours: dayCards.reduce((sum, card) => sum + card.shopHours, 0),
      cards: dayCards.sort((a, b) => a.title.localeCompare(b.title)),
    }));
}