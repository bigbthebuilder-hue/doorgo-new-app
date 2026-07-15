const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const PRODUCTION_BOARD_WEEK_COUNT = 8;

export type ProductionBoardDayState = 'past' | 'today' | 'future';

export type ProductionBoardSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type ProductionBoardWindow = {
  startDate: string;
  weeks: number;
  endDateExclusive: string;
  visibleWeekdayEndExclusive: string;
};

export type ProductionWorkweek = {
  monday: string;
  weekdayDates: [string, string, string, string, string];
  weekendDates: [string, string];
};

export function parseProductionBoardParams(
  searchParams?: ProductionBoardSearchParams,
  vancouverToday = getCurrentDateInTimeZone('America/Vancouver'),
): ProductionBoardWindow {
  const rawWeek = getSingleValue(searchParams?.week);
  const startDate = normalizeProductionWeekAnchor(rawWeek, vancouverToday);

  return {
    startDate,
    weeks: PRODUCTION_BOARD_WEEK_COUNT,
    endDateExclusive: addDaysToDateOnly(startDate, PRODUCTION_BOARD_WEEK_COUNT * 7),
    visibleWeekdayEndExclusive: addDaysToDateOnly(
      startDate,
      (PRODUCTION_BOARD_WEEK_COUNT - 1) * 7 + 5,
    ),
  };
}

export function normalizeProductionWeekAnchor(
  value: string | undefined,
  fallbackDate: string,
): string {
  const selected = value && isValidDateOnly(value) ? value : fallbackDate;
  if (!isValidDateOnly(selected)) {
    throw new Error('A valid fallback calendar date is required');
  }
  return getMondayForDate(selected);
}

export function getMondayForDate(dateText: string): string {
  if (!isValidDateOnly(dateText)) {
    throw new Error(`Invalid calendar date: ${dateText}`);
  }
  const dayOfWeek = parseDateOnly(dateText).getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  return addDaysToDateOnly(dateText, -daysSinceMonday);
}

export function generateProductionWorkweeks(
  mondayAnchor: string,
  weeks = PRODUCTION_BOARD_WEEK_COUNT,
): ProductionWorkweek[] {
  if (getMondayForDate(mondayAnchor) !== mondayAnchor) {
    throw new Error('Production workweek anchor must be a Monday');
  }
  return Array.from({ length: weeks }, (_, weekIndex) => {
    const monday = addDaysToDateOnly(mondayAnchor, weekIndex * 7);
    return {
      monday,
      weekdayDates: [0, 1, 2, 3, 4].map((offset) =>
        addDaysToDateOnly(monday, offset),
      ) as ProductionWorkweek['weekdayDates'],
      weekendDates: [5, 6].map((offset) =>
        addDaysToDateOnly(monday, offset),
      ) as ProductionWorkweek['weekendDates'],
    };
  });
}

export function classifyProductionBoardDay(
  dateText: string,
  vancouverToday: string,
): ProductionBoardDayState {
  if (dateText < vancouverToday) return 'past';
  if (dateText > vancouverToday) return 'future';
  return 'today';
}

export function isValidDateOnly(value: string): boolean {
  if (!DATE_ONLY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
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
  return formatFriendlyDateRange(startDate, endDateExclusive);
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
  const date = parseDateOnly(dateText);
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
  return year && month && day ? `${year}-${month}-${day}` : formatDateOnly(new Date());
}

function getSingleValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? undefined : value;
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
