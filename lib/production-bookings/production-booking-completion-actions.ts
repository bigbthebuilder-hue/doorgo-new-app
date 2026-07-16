'use server';

import { revalidatePath } from 'next/cache';
import {
  PRODUCTION_COMPLETION_REVALIDATE_PATHS,
  type CompleteProductionBookingRequest,
  type ProductionBookingCompletionResult,
  type ReopenProductionBookingRequest,
} from './production-booking-completion-contract';
import {
  completeProductionBookingWithAccess,
  reopenProductionBookingWithAccess,
} from './production-booking-completion-service';

function revalidateProductionCompletionPaths() {
  for (const path of PRODUCTION_COMPLETION_REVALIDATE_PATHS) revalidatePath(path);
}

export async function completeProductionBooking(
  request: CompleteProductionBookingRequest,
): Promise<ProductionBookingCompletionResult> {
  const result = await completeProductionBookingWithAccess(request);
  if (result.ok) revalidateProductionCompletionPaths();
  return result;
}

export async function reopenProductionBooking(
  request: ReopenProductionBookingRequest,
): Promise<ProductionBookingCompletionResult> {
  const result = await reopenProductionBookingWithAccess(request);
  if (result.ok) revalidateProductionCompletionPaths();
  return result;
}
