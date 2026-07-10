import type { DailyCapacity, DailyCapacityRow, DailyCapacitySource } from './capacity-types';

function toNumericHours(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function toDateOnly(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

export function normalizeDailyCapacityRow(row: DailyCapacityRow): DailyCapacity {
  const productionDate = toDateOnly(row.production_date) ?? row.production_date;
  const availableHours = toNumericHours(row.available_hours);
  const staffCapacityHours = toNumericHours(row.staff_capacity_hours);
  const deductionHours = toNumericHours(row.deduction_hours);

  const source = (row.capacity_source as DailyCapacitySource) ?? 'unknown';
  const isClosed = Boolean(row.is_closed);

  return {
    productionDate,
    availableHours,
    staffCapacityHours,
    deductionHours,
    source,
    isClosed,
    notes: row.notes ?? null,
    details: row.details ?? {},
    calculatedAt: row.calculated_at ?? null,
    mirroredAt: row.mirrored_at ?? null,
  };
}

export function normalizeDailyCapacityRows(rows: DailyCapacityRow[]): DailyCapacity[] {
  return rows.map((row) => normalizeDailyCapacityRow(row));
}
