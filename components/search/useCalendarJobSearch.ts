'use client';
import { useCallback } from 'react';
import { searchCalendarLinkableJobs } from '@/lib/calendar/calendar-item-actions';
import type { CalendarJobOption, CalendarLinkItemType } from '@/lib/calendar/calendar-job-linking';
import { useRetainedSearch } from './useRetainedSearch';

const matchesJob = (job: CalendarJobOption, query: string) =>
  [job.customer, job.salesOrder, job.doorGoReference].some(value => value?.toLocaleLowerCase().includes(query.toLocaleLowerCase()));

export function useCalendarJobSearch(query: string, itemType: CalendarLinkItemType | null, enabled: boolean) {
  const load = useCallback(async (value: string) => {
    if (!itemType) return { ok: true as const, items: [] };
    const reply = await searchCalendarLinkableJobs({ query: value, itemType });
    return reply.ok ? { ok: true as const, items: reply.options } : reply;
  }, [itemType]);
  return useRetainedSearch({ query, scope: itemType || '', enabled: enabled && Boolean(itemType), delay: 200,
    load, matches: matchesJob, failureMessage: 'DoorGo jobs could not be searched. Please try again.' });
}
