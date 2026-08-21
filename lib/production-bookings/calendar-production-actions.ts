'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { getCurrentDateInTimeZone } from '@/lib/production-board/date-utils';
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

export async function reorderCalendarNeedsAttention(request: { expectedBookingIds: string[]; orderedBookingIds: string[] }): Promise<{ok:true}|{ok:false;message:string}> {
  if (!await hasCalendarUse()) return { ok:false, message:'Calendar and Production use permission are required.' };
  return reorderNeedsAttentionWithAccess(request);
}

export async function reloadCalendarProductionDays(request: { boardStart: string; boardEndExclusive: string; weeks: number; today: string; dates: string[] }): Promise<{ ok: true; days: ProductionBoardDay[]; needsAttentionCards: ProductionBoardViewModel['needsAttentionCards'] } | { ok: false }> {
  const access = await getCurrentDoorGoAccess();
  if (!hasAtLeastView(access, 'calendar')) return { ok: false };
  try {
    const board = await loadProductionBoardReadOnly({
      boardStart: request.boardStart,
      boardEndExclusive: request.boardEndExclusive,
      weeks: request.weeks,
      today: request.today,
      includeNativeJobLinks: hasAtLeastView(access, 'jobs'),
      includeOperationalCalendarItems:true,
    });
    const dates = new Set(request.dates);
    return { ok: true, days: board.days.filter((day) => dates.has(day.date)), needsAttentionCards: board.needsAttentionCards };
  } catch {
    return { ok: false };
  }
}
