'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { addDaysToDateOnly, getCurrentDateInTimeZone, getMondayForDate } from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import type { ProductionBoardDay, ProductionBoardViewModel } from '@/lib/production-board/types';
import { productionBookingRescheduleFailure, type ProductionBookingRescheduleResult, type RescheduleProductionBookingRequest } from './production-booking-reschedule-contract';
import { rescheduleProductionBookingWithAccess } from './production-booking-reschedule-service';
import { reorderProductionDayWithAccess } from './production-day-order-service';
import type { ProductionDayOrderResult, ReorderProductionDayRequest } from './production-day-order-contract';
import type { CompleteProductionBookingRequest, ProductionBookingCompletionResult, ReopenProductionBookingRequest } from './production-booking-completion-contract';
import { completeProductionBookingWithAccess, reopenProductionBookingWithAccess } from './production-booking-completion-service';
import { placeProductionBookingWithAccess } from './production-placement-service';
import type { ProductionPlacementRequest, ProductionPlacementResult } from './production-placement-contract';
import { reorderNeedsAttentionWithAccess } from './production-needs-attention-order-service';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

async function hasCalendarUse(): Promise<boolean> {
  const access = await getCurrentDoorGoAccess();
  return getPermissionAccess(access, 'calendar') === 'use';
}

export async function rescheduleCalendarProductionBooking(request: RescheduleProductionBookingRequest): Promise<ProductionBookingRescheduleResult> {
  if (!await hasCalendarUse()) return productionBookingRescheduleFailure('permission_required');
  const today = getCurrentDateInTimeZone('America/Vancouver');
  const pastToPast = request.expectedProductionDate < today && request.destinationProductionDate < today;
  return rescheduleProductionBookingWithAccess(pastToPast ? {
    ...request,
    whollyUnstartedAcknowledged: true,
    backdateReason: 'Calendar past-to-past move',
  } : request);
}

export async function reorderCalendarProductionDay(request: ReorderProductionDayRequest): Promise<ProductionDayOrderResult> {
  return reorderProductionDayWithAccess(request);
}

export async function completeCalendarProductionBooking(request: CompleteProductionBookingRequest): Promise<ProductionBookingCompletionResult> {
  if (!await hasCalendarUse()) return { ok: false, code: 'permission_required', message: 'Calendar and Production use permission are required.' };
  return completeProductionBookingWithAccess(request);
}

export async function reopenCalendarProductionBooking(request: Omit<ReopenProductionBookingRequest, 'reason'>): Promise<ProductionBookingCompletionResult> {
  if (!await hasCalendarUse()) return { ok: false, code: 'permission_required', message: 'Calendar and Production use permission are required.' };
  return reopenProductionBookingWithAccess({ ...request, reason: 'Reopened from Calendar' });
}

export async function placeCalendarProductionBooking(request: ProductionPlacementRequest): Promise<ProductionPlacementResult> {
  if (!await hasCalendarUse()) return { ok: false, code: 'permission_required', message: 'Calendar and Production use permission are required.' };
  return placeProductionBookingWithAccess(request);
}

export type DeleteCalendarProductionResult={ok:true;data:Record<string,unknown>}|{ok:false;code:string;message:string};
export async function deleteCalendarProductionBooking(request:{commandId:string;bookingId:string;expectedProductionDate:string|null;expectedUpdatedAt:string}):Promise<DeleteCalendarProductionResult>{
  if(!await hasCalendarUse())return {ok:false,code:'permission_required',message:'Calendar and Production use permission are required.'};
  const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'production')!=='use')return {ok:false,code:'permission_required',message:'Calendar and Production use permission are required.'};
  const {data,error}=await (await createAuthenticatedSupabaseServerClient()).rpc('delete_calendar_production_booking',{p_command_id:request.commandId,p_booking_id:request.bookingId,p_expected_production_date:request.expectedProductionDate,p_expected_updated_at:request.expectedUpdatedAt});
  if(!error)return {ok:true,data:(data??{}) as Record<string,unknown>};
  const raw=error.message.startsWith('production_booking_delete.')?error.message.slice('production_booking_delete.'.length):'unavailable';
  const messages:Record<string,string>={permission_required:'Calendar and Production use permission are required.',not_found:'This Production item is no longer active.',completed_booking:'Reopen this Production item before deleting it.',stale_booking:'This Production item changed. Reopen its details and try again.',ineligible_booking:'This Production item is not eligible for deletion.',invalid_request:'The Production delete request is invalid.',command_uuid_collision:'This delete request conflicts with an earlier command.'};
  return {ok:false,code:raw,message:messages[raw]??'Production could not be deleted. Reopen Calendar and try again.'};
}

export async function reorderCalendarNeedsAttention(request: { expectedBookingIds: string[]; orderedBookingIds: string[] }): Promise<{ok:true}|{ok:false;message:string}> {
  if (!await hasCalendarUse()) return { ok:false, message:'Calendar and Production use permission are required.' };
  return reorderNeedsAttentionWithAccess(request);
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
      includeStaffAway:hasAtLeastView(access,'production'),
    });
    const dates = new Set(request.dates);
    return { ok: true, days: board.days.filter((day) => dates.has(day.date)), needsAttentionCards: board.needsAttentionCards };
  } catch {
    return { ok: false };
  }
}

export async function loadCalendarWindow(request:{boardStart:string;boardEndExclusive:string;weeks:number;today:string}):Promise<{ok:true;board:ProductionBoardViewModel}|{ok:false}> {
  const access=await getCurrentDoorGoAccess();if(!hasAtLeastView(access,'calendar'))return {ok:false};
  try{return {ok:true,board:await loadProductionBoardReadOnly({...request,includeNativeJobLinks:hasAtLeastView(access,'jobs'),includeOperationalCalendarItems:true,includeStaffAway:hasAtLeastView(access,'production')})};}catch{return {ok:false};}
}
