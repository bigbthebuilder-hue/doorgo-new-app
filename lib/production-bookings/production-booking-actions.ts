'use server';

import { revalidatePath } from 'next/cache';
import {
  PRODUCTION_RECOVERY_REVALIDATE_PATHS,
  type MoveProductionBookingRequest,
  type ProductionBookingMoveResult,
} from './production-booking-move-contract';
import { moveProductionBookingWithAccess } from './production-booking-service';

export async function moveProductionBookingToToday(
  request: MoveProductionBookingRequest,
): Promise<ProductionBookingMoveResult> {
  const result = await moveProductionBookingWithAccess(request);
  if (result.ok) {
    for (const path of PRODUCTION_RECOVERY_REVALIDATE_PATHS) {
      revalidatePath(path);
    }
  }
  return result;
}
