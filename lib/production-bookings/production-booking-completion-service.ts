import 'server-only';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  createProductionBookingCompletionExecutors,
  getProductionCompletionAuthorizationError,
  productionBookingCompletionFailure,
  type CompleteProductionBookingRequest,
  type ProductionBookingCompletionResult,
  type ReopenProductionBookingRequest,
} from './production-booking-completion-contract';

const executors = createProductionBookingCompletionExecutors(async () => {
  const supabase = await createAuthenticatedSupabaseServerClient();
  return async (name, parameters) => {
    const { data, error } = await supabase.rpc(name, parameters);
    return { data, error };
  };
});

async function authorize(): Promise<ProductionBookingCompletionResult | null> {
  const access = await getCurrentDoorGoAccess();
  const error = getProductionCompletionAuthorizationError(access);
  return error ? productionBookingCompletionFailure(error) : null;
}

export async function completeProductionBookingWithAccess(
  request: CompleteProductionBookingRequest,
): Promise<ProductionBookingCompletionResult> {
  try {
    const authorizationFailure = await authorize();
    return authorizationFailure ?? await executors.complete(request);
  } catch {
    return productionBookingCompletionFailure('unavailable');
  }
}

export async function reopenProductionBookingWithAccess(
  request: ReopenProductionBookingRequest,
): Promise<ProductionBookingCompletionResult> {
  try {
    const authorizationFailure = await authorize();
    return authorizationFailure ?? await executors.reopen(request);
  } catch {
    return productionBookingCompletionFailure('unavailable');
  }
}
