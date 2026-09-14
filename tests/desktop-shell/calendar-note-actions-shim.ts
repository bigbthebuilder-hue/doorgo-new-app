import type { CalendarNoteConvertInput, CalendarNoteEditInput } from '@/lib/calendar/calendar-item-actions';
import type { ProductionBoardCard } from '@/lib/production-board/types';

export let lastNoteRequest: CalendarNoteEditInput | CalendarNoteConvertInput | null = null;
export async function searchCalendarLinkableJobs() { return { ok: true as const, options: [] }; }
export async function updateCalendarNote(input: CalendarNoteEditInput) {
  lastNoteRequest = input;
  return { ok: true as const, data: {}, card: { bookingId: `item:${input.itemId}`, title: input.title, productionDate: input.scheduledDate } as ProductionBoardCard };
}
export async function convertCalendarNote(input: CalendarNoteConvertInput) {
  lastNoteRequest = input;
  return { ok: true as const, data: {} };
}
