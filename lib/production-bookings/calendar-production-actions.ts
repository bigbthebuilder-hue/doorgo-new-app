'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { hasAtLeastView } from '@/lib/auth/access';
import { addDaysToDateOnly, getCurrentDateInTimeZone, getMondayForDate } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import type { ProductionBoardDay, ProductionBoardViewModel } from '@/lib/production-board/types';
import { productionBookingRescheduleFailure, type ProductionBookingRescheduleResult, type RescheduleProductionBookingRequest } from './production-booking-reschedule-contract';
import { executeProductionBookingReschedule } from './production-booking-reschedule-contract';
import { executeReorderProductionDay, productionDayOrderFailure } from './production-day-order-contract';
import type { ProductionDayOrderResult, ReorderProductionDayRequest } from './production-day-order-contract';
import type { CompleteProductionBookingRequest, ProductionBookingCompletionResult, ReopenProductionBookingRequest } from './production-booking-completion-contract';
import { executeCompleteProductionBooking, executeReopenProductionBooking } from './production-booking-completion-contract';
import { executeProductionPlacement } from './production-placement-contract';
import type { ProductionPlacementRequest, ProductionPlacementResult } from './production-placement-contract';
import { canMutateCalendar } from '@/lib/calendar/permissions';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

async function calendarProductionRpc(name: string, parameters: Record<string, unknown>) {
  try {
    const client = await createAuthenticatedSupabaseServerClient();
    const { data, error } = await client.rpc('calendar_' + name, parameters);
    return { data, error };
  } catch {
    return { data: null, error: { message: 'Calendar operation unavailable.' } };
  }
}

async function hasCalendarUse(): Promise<boolean> {
  const access = await getCurrentDoorGoAccess();
  return canMutateCalendar(access);
}

export async function rescheduleCalendarProductionBooking(request: RescheduleProductionBookingRequest): Promise<ProductionBookingRescheduleResult> {
  if (!await hasCalendarUse()) return productionBookingRescheduleFailure('permission_required');
  const today = getCurrentDateInTimeZone('America/Vancouver');
  const pastToPast = request.expectedProductionDate < today && request.destinationProductionDate < today;
  return executeProductionBookingReschedule(pastToPast ? {
    ...request,
    whollyUnstartedAcknowledged: true,
    backdateReason: 'Calendar past-to-past move',
  } : request, { rpc: calendarProductionRpc, today });
}

export async function reorderCalendarProductionDay(request: ReorderProductionDayRequest): Promise<ProductionDayOrderResult> {
  if (!await hasCalendarUse()) return productionDayOrderFailure('permission_required');
  return executeReorderProductionDay(request, calendarProductionRpc);
}

export async function completeCalendarProductionBooking(request: CompleteProductionBookingRequest): Promise<ProductionBookingCompletionResult> {
  if (!await hasCalendarUse()) return { ok: false, code: 'permission_required', message: 'Calendar use permission is required.' };
  return executeCompleteProductionBooking(request, calendarProductionRpc);
}

export async function reopenCalendarProductionBooking(request: Omit<ReopenProductionBookingRequest, 'reason'>): Promise<ProductionBookingCompletionResult> {
  if (!await hasCalendarUse()) return { ok: false, code: 'permission_required', message: 'Calendar use permission is required.' };
  return executeReopenProductionBooking({ ...request, reason: 'Reopened from Calendar' }, calendarProductionRpc);
}

export async function placeCalendarProductionBooking(request: ProductionPlacementRequest): Promise<ProductionPlacementResult> {
  if (!await hasCalendarUse()) return { ok: false, code: 'permission_required', message: 'Calendar use permission is required.' };
  return executeProductionPlacement(request, calendarProductionRpc);
}

export type DeleteCalendarProductionResult={ok:true;data:Record<string,unknown>}|{ok:false;code:string;message:string};
export async function deleteCalendarProductionBooking(request:{commandId:string;bookingId:string;expectedProductionDate:string|null;expectedUpdatedAt:string}):Promise<DeleteCalendarProductionResult>{
  if(!await hasCalendarUse())return {ok:false,code:'permission_required',message:'Calendar use permission is required.'};
  const {data,error}=await (await createAuthenticatedSupabaseServerClient()).rpc('delete_calendar_production_booking',{p_command_id:request.commandId,p_booking_id:request.bookingId,p_expected_production_date:request.expectedProductionDate,p_expected_updated_at:request.expectedUpdatedAt});
  if(!error)return {ok:true,data:(data??{}) as Record<string,unknown>};
  const raw=error.message.startsWith('production_booking_delete.')?error.message.slice('production_booking_delete.'.length):'unavailable';
  const messages:Record<string,string>={permission_required:'Calendar use permission is required.',not_found:'This Production item is no longer active.',completed_booking:'Reopen this Production item before deleting it.',stale_booking:'This Production item changed. Reopen its details and try again.',ineligible_booking:'This Production item is not eligible for deletion.',invalid_request:'The Production delete request is invalid.',command_uuid_collision:'This delete request conflicts with an earlier command.'};
  return {ok:false,code:raw,message:messages[raw]??'Production could not be deleted. Reopen Calendar and try again.'};
}

export async function reorderCalendarNeedsAttention(request: { expectedBookingIds: string[]; orderedBookingIds: string[] }): Promise<{ok:true}|{ok:false;message:string}> {
  if (!await hasCalendarUse()) return { ok:false, message:'Calendar use permission is required.' };
  const { error } = await calendarProductionRpc('reorder_production_needs_attention', { p_expected_booking_ids: request.expectedBookingIds, p_ordered_booking_ids: request.orderedBookingIds });
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function reloadCalendarProductionDays(request: { boardStart: string; boardEndExclusive: string; weeks: number; today: string; dates: string[] }): Promise<{ ok: true; days: ProductionBoardDay[]; needsAttentionCards: ProductionBoardViewModel['needsAttentionCards'] } | { ok: false }> {
  const access = await getCurrentDoorGoAccess();
  if (!hasAtLeastView(access, 'calendar')) return { ok: false };
  try {
    const orderedDates = [...new Set(request.dates)].sort();
    const boardStart = orderedDates.length ? getMondayForDate(orderedDates[0]) : getMondayForDate(request.today);
    const boardEndExclusive = orderedDates.length ? addDaysToDateOnly(getMondayForDate(orderedDates.at(-1)!), 7) : addDaysToDateOnly(boardStart, 7);
    const weeks = Math.max(1, Math.round((Date.parse(`${boardEndExclusive}T00:00:00Z`) - Date.parse(`${boardStart}T00:00:00Z`)) / (7 * 86400000)));
    const board = await loadProductionBoardReadOnly({
      boardStart,
      boardEndExclusive,
      weeks,
      today: request.today,
      includeNativeJobLinks: hasAtLeastView(access, 'jobs'),
      includeOperationalCalendarItems:true,
      includeStaffAway:hasAtLeastView(access,'calendar'),
      includeCapacityExceptions:true,
    });
    const dates = new Set(request.dates);
    return { ok: true, days: board.days.filter((day) => dates.has(day.date)), needsAttentionCards: board.needsAttentionCards };
  } catch {
    return { ok: false };
  }
}

export async function loadCalendarWindow(request:{boardStart:string;boardEndExclusive:string;weeks:number;today:string}):Promise<{ok:true;board:ProductionBoardViewModel}|{ok:false}> {
  const access=await getCurrentDoorGoAccess();if(!hasAtLeastView(access,'calendar'))return {ok:false};
  try{return {ok:true,board:await loadProductionBoardReadOnly({...request,includeNativeJobLinks:hasAtLeastView(access,'jobs'),includeOperationalCalendarItems:true,includeStaffAway:hasAtLeastView(access,'calendar'),includeCapacityExceptions:true})};}catch{return {ok:false};}
}
