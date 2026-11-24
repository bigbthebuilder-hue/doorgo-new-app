export type CalendarViewport = { week: string; offset: number };
export const calendarViewportKey = (owner: string) => `doorgo.calendar.viewport.v1:${owner}`;
export function parseCalendarViewport(value: unknown): CalendarViewport | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<CalendarViewport>;
  if (typeof candidate.week !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.week) || !Number.isFinite(candidate.offset)) return null;
  const date = new Date(candidate.week + 'T00:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== candidate.week || date.getUTCDay() !== 1) return null;
  return { week: candidate.week, offset: Math.max(-100000, Math.min(100000, candidate.offset!)) };
}
export function viewportOffset(offset: number, height: number): number {
  return Math.max(-Math.max(0,height-24), Math.min(0,offset));
}
