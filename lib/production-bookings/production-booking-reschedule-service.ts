import 'server-only';

import { getPermissionAccess } from '@/lib/auth/access';
import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { getVancouverDate } from './production-booking-move-contract';
import {
  createProductionBookingRescheduleExecutor,
  productionBookingRescheduleFailure,
  type ProductionBookingRescheduleResult,
  type RescheduleProductionBookingRequest,
} from './production-booking-reschedule-contract';

const executeReschedule = createProductionBookingRescheduleExecutor(async () => {
  const supabase = await createAuthenticatedSupabaseServerClient();
  return async (name, parameters) => {
    const { data, error } = await supabase.rpc(name, parameters);
    return { data, error };
  };
}, getVancouverDate);

export async function rescheduleProductionBookingWithAccess(
  request: RescheduleProductionBookingRequest,
): Promise<ProductionBookingRescheduleResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    if (access.state === 'unauthenticated') return productionBookingRescheduleFailure('authentication_required');
    if (access.state !== 'active') return productionBookingRescheduleFailure('active_profile_required');
    if (getPermissionAccess(access, 'production') !== 'use') return productionBookingRescheduleFailure('permission_required');
    return await executeReschedule(request);
  } catch {
    return productionBookingRescheduleFailure('unavailable');
  }
}
