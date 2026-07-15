'use server';

import { revalidatePath } from 'next/cache';
import {
  PRODUCTION_RESCHEDULE_REVALIDATE_PATHS,
  type ProductionBookingRescheduleResult,
  type RescheduleProductionBookingRequest,
} from './production-booking-reschedule-contract';
import { rescheduleProductionBookingWithAccess } from './production-booking-reschedule-service';

export async function rescheduleProductionBooking(
  request: RescheduleProductionBookingRequest,
): Promise<ProductionBookingRescheduleResult> {
  const result = await rescheduleProductionBookingWithAccess(request);
  if (result.ok) {
    for (const path of PRODUCTION_RESCHEDULE_REVALIDATE_PATHS) revalidatePath(path);
  }
  return result;
}
