export * from './calendar-permissions-actions-shim';
import type { CalendarSearchTarget } from '@/lib/calendar/calendar-item-actions';
import type { CalendarJobOption } from '@/lib/calendar/calendar-job-linking';
import { normalizeProductionBoard } from '@/lib/production-board/normalize';

type CalendarReply = { ok: true; targets: CalendarSearchTarget[] } | { ok: false };
type JobReply = { ok: true; options: CalendarJobOption[] } | { ok: false; message: string };
export type SearchFixture = {
  calendar: { query: string; resolve: (reply: CalendarReply) => void }[];
  jobs: { query: string; itemType: string; resolve: (reply: JobReply) => void }[];
};
export type SearchGlobal = typeof globalThis & { searchFixture: SearchFixture };
function fixture() {
  const target = globalThis as SearchGlobal;
  return target.searchFixture ??= { calendar: [], jobs: [] };
}
export function searchScheduledCalendar(input: { query: string }): Promise<CalendarReply> {
  return new Promise(resolve => fixture().calendar.push({ ...input, resolve }));
}
export function searchCalendarLinkableJobs(input: { query: string; itemType: string }): Promise<JobReply> {
  return new Promise(resolve => fixture().jobs.push({ ...input, resolve }));
}
export async function loadCalendarWindow(input: {boardStart:string;boardEndExclusive:string;weeks:number;today:string}) {
  return {ok:true,board:normalizeProductionBoard([],[],[],{startDate:input.boardStart,endDateExclusive:input.boardEndExclusive,weeks:input.weeks,today:input.today})};
}
