import 'server-only';

import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  createProductionBookingMoveExecutor,
  normalizeRecoveryBookingRows,
  productionBookingMoveFailure,
  PRODUCTION_RECOVERY_READ_RPC,
  type MoveProductionBookingRequest,
  type ProductionBookingMoveResult,
  type ProductionRecoveryBooking,
} from './production-booking-move-contract';

export class ProductionRecoveryReadFailure extends Error {
  constructor(public readonly code: 'access_denied' | 'unavailable') {
    super(code);
    this.name = 'ProductionRecoveryReadFailure';
  }
}

export async function loadRecentProductionRecoveryBookings(
  params: { startDate: string; endDate: string; limit: number },
): Promise<ProductionRecoveryBooking[]> {
  const access = await getCurrentDoorGoAccess();
  if (!hasAtLeastView(access, 'production')) {
    throw new ProductionRecoveryReadFailure('access_denied');
  }

  const supabase = await createAuthenticatedSupabaseServerClient();
  const { data, error } = await supabase.rpc(PRODUCTION_RECOVERY_READ_RPC, {
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_limit: params.limit,
  });
  if (error) throw new ProductionRecoveryReadFailure('unavailable');
  const bookings = normalizeRecoveryBookingRows(data);
  if (!bookings) throw new ProductionRecoveryReadFailure('unavailable');
  return bookings;
}

const executeMove = createProductionBookingMoveExecutor(async () => {
  const supabase = await createAuthenticatedSupabaseServerClient();
  return async (name, parameters) => {
    const { data, error } = await supabase.rpc(name, parameters);
    return { data, error };
  };
});

export async function moveProductionBookingWithAccess(
  request: MoveProductionBookingRequest,
): Promise<ProductionBookingMoveResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    if (access.state === 'unauthenticated') {
      return productionBookingMoveFailure('authentication_required');
    }
    if (access.state !== 'active') {
      return productionBookingMoveFailure('active_profile_required');
    }
    if (getPermissionAccess(access, 'production') !== 'use') {
      return productionBookingMoveFailure('permission_required');
    }
    return await executeMove(request);
  } catch {
    return {
      ok: false,
      code: 'unavailable',
      message: 'The production booking could not be moved. Please try again.',
    };
  }
}
