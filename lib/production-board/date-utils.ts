const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type ProductionBoardSearchParams = Record<
  string,
  string | string[] | undefined
>;

export function parseProductionBoardParams(
  searchParams?: ProductionBoardSearchParams,
): { startDate: string; weeks: number } {
  const rawStart = getSingleValue(searchParams?.start);
  const rawWeeks = getSingleValue(searchParams?.weeks);

  return {
    startDate: parseBoardStartDate(rawStart),
    weeks: parseBoardWeeks(rawWeeks),
  };
}

export function parseBoardStartDate(value: string | undefined): string {
  const trimmed = value?.trim();

  if (trimmed && isValidDateOnly(trimmed)) {
    return trimmed;
  }

  return getCurrentDateInTimeZone('America/Vancouver');
}

export function parseBoardWeeks(value: string | undefined): number {
  if (!value) {
    return 8;
  }

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) {
    return 8;
  }

  const parsed = Number(trimmed);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    return 8;
  }

  return Math.min(parsed, 26);
}

export function addDaysToDateOnly(dateText: string, days: number): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateOnly(date);
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatBoardDateRange(
  startDate: string,
  endDateExclusive: string,
): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDateExclusive);

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  const displayEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  return `${formatter.format(start)} – ${formatter.format(displayEnd)}`;
}

export function formatFriendlyDateRange(
  startDate: string,
  endDateExclusive: string,
): string {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDateExclusive);
  const displayEnd = new Date(end.getTime() - 24 * 60 * 60 * 1000);

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return `${formatter.format(start)} – ${formatter.format(displayEnd)}`;
}

export function formatFriendlyDateOnly(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function getCurrentDateInTimeZone(timeZone: string): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    return formatDateOnly(new Date());
  }

  return `${year}-${month}-${day}`;
}

function getSingleValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
