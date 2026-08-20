'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess } from '@/lib/auth/access';
import { productionBookingRescheduleFailure, type ProductionBookingRescheduleResult, type RescheduleProductionBookingRequest } from './production-booking-reschedule-contract';
import { rescheduleProductionBookingWithAccess } from './production-booking-reschedule-service';
import { reorderProductionDayWithAccess } from './production-day-order-service';
import type { ProductionDayOrderResult, ReorderProductionDayRequest } from './production-day-order-contract';

async function hasCalendarUse(): Promise<boolean> {
  const access = await getCurrentDoorGoAccess();
  return getPermissionAccess(access, 'calendar') === 'use';
}

export async function rescheduleCalendarProductionBooking(request: RescheduleProductionBookingRequest): Promise<ProductionBookingRescheduleResult> {
  if (!await hasCalendarUse()) return productionBookingRescheduleFailure('permission_required');
  const result = await rescheduleProductionBookingWithAccess(request);
  if (result.ok) revalidatePath('/calendar');
  return result;
}

export async function reorderCalendarProductionDay(request: ReorderProductionDayRequest): Promise<ProductionDayOrderResult> {
  const result = await reorderProductionDayWithAccess(request);
  if (result.ok) revalidatePath('/calendar');
  return result;
}
