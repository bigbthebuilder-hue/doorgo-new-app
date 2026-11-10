import 'server-only';

import { calendarOperationalBounds, dateWithinCalendarBounds } from '@/lib/calendar/continuous-range';
import { addDaysToDateOnly, getCurrentDateInTimeZone, getMondayForDate } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import { createTrustedReadOnlySupabaseClient } from '@/lib/supabase/trusted-read-server';
import { monthCalendarDates } from './date-only-picker';
import { shopDateCapacityStatus, type ShopDateIndicators } from './shop-date-capacity';

// Only called after the Jobs action authorizes the Calendar scope and editable Job.
export async function loadShopDateIndicators(
  month: string,
  internalJobId: string | null,
  estimatedHours: number | null,
): Promise<ShopDateIndicators> {
  const today = getCurrentDateInTimeZone('America/Vancouver');
  const bounds = calendarOperationalBounds(today);
  const dates = monthCalendarDates(month).filter(date => dateWithinCalendarBounds(date, bounds));
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last) return {};
  const boardStart = getMondayForDate(first);
  const boardEndExclusive = addDaysToDateOnly(getMondayForDate(last), 7);
  const weeks = (Date.parse(boardEndExclusive) - Date.parse(boardStart)) / 604800000;
  const board = await loadProductionBoardReadOnly({
    boardStart, boardEndExclusive, weeks, today, includeOperationalCalendarItems: true,
    includeCapacityExceptions: true, includeStaffAway: true,
  });

  const linkedBooking = internalJobId ? await loadLinkedBooking(internalJobId) : null;
  const requestedDates = new Set(dates);
  return Object.fromEntries(board.days.filter(day => requestedDates.has(day.date)).map(day => {
    // Use exactly the cards and capacity projected by the Calendar board. A
    // linked row omitted by Calendar must never influence exclusion.
    const excluded = linkedBooking?.production_date === day.date
      ? day.cards.find(card => card.bookingId === linkedBooking.booking_id) : undefined;
    const known = day.missingShopHoursCount - (excluded && !excluded.shopHoursKnown ? 1 : 0) === 0;
    const planned = Math.round(day.totalKnownShopHours * 100) - Math.round((excluded?.shopHours ?? 0) * 100);
    const available = day.availableHours === null ? null : Math.round(day.availableHours * 100);
    const remaining = day.isClosed ? 'closed' : !day.capacityKnown || available === null ? null
      : available === 0 ? 0 : known ? Math.max(0, available - planned) : null;
    return [day.date, shopDateCapacityStatus(remaining, estimatedHours)];
  }));
}

async function loadLinkedBooking(internalJobId: string) {
  const { data, error } = await createTrustedReadOnlySupabaseClient().from('dg_production_bookings')
    .select('booking_id,production_date')
    .eq('linked_internal_job_id', internalJobId)
    .eq('booking_kind', 'production')
    .eq('status', 'active')
    .eq('schedule_status', 'confirmed')
    .neq('board_visible', false)
    .is('deleted_at', null)
    .is('cancelled_at', null)
    .is('completed_at', null)
    .maybeSingle();
  if (error) throw new Error('The linked Production booking could not be resolved.');
  return data;
}
