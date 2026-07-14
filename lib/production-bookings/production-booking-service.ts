import 'server-only';

import { getPermissionAccess, hasAtLeastView, type CurrentDoorGoAccess } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  createProductionBookingMoveExecutor,
  getVancouverDate,
  isValidDateOnly,
  normalizeRecoveryBookingRows,
  productionBookingMoveFailure,
  PRODUCTION_RECOVERY_READ_RPC,
  type MoveProductionBookingRequest,
  type ProductionBookingMoveResult,
  type ProductionRecoveryBooking,
} from './production-booking-move-contract';

export type ProductionRecoveryReadRequest = {
  startDate: string;
  endDate: string;
  limit: number;
};

export class ProductionRecoveryReadFailure extends Error {
  constructor(public readonly code: 'access_denied' | 'unavailable') {
    super(code);
    this.name = 'ProductionRecoveryReadFailure';
  }
}

export async function loadAuthorizedRecentProductionRecoveryBookings(
  access: CurrentDoorGoAccess,
  params: ProductionRecoveryReadRequest,
): Promise<ProductionRecoveryBooking[]> {
  if (!hasAtLeastView(access, 'production')) {
    throw new ProductionRecoveryReadFailure('access_denied');
  }

  const today = getVancouverDate();
  const span = isValidDateOnly(params.startDate) && isValidDateOnly(params.endDate)
    ? (Date.parse(`${params.endDate}T00:00:00Z`) - Date.parse(`${params.startDate}T00:00:00Z`)) / 86_400_000
    : Number.NaN;
  if (!Number.isInteger(params.limit) || params.limit < 1 || params.limit > 100
    || !isValidDateOnly(params.startDate) || !isValidDateOnly(params.endDate)
    || params.startDate > params.endDate || params.endDate >= today || span > 93) {
    throw new ProductionRecoveryReadFailure('unavailable');
  }

  const supabase = await createAuthenticatedSupabaseServerClient();
  const { data, error } = await supabase.rpc(PRODUCTION_RECOVERY_READ_RPC, {
    p_start_date: params.startDate,
    p_end_date: params.endDate,
    p_limit: params.limit,
  });
  if (error) {
    const message = typeof error.message === 'string' ? error.message.trim() : '';
    if (['production_booking_read.authentication_required', 'production_booking_read.active_profile_required', 'production_booking_read.permission_required'].includes(message)) {
      throw new ProductionRecoveryReadFailure('access_denied');
    }
    throw new ProductionRecoveryReadFailure('unavailable');
  }
  const bookings = normalizeRecoveryBookingRows(data);
  if (!bookings || bookings.length > params.limit || bookings.some((booking) =>
    booking.productionDate < params.startDate || booking.productionDate > params.endDate || booking.productionDate >= today
  )) throw new ProductionRecoveryReadFailure('unavailable');
  return bookings;
}

export async function loadRecentProductionRecoveryBookings(
  params: ProductionRecoveryReadRequest,
): Promise<ProductionRecoveryBooking[]> {
  return loadAuthorizedRecentProductionRecoveryBookings(await getCurrentDoorGoAccess(), params);
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
