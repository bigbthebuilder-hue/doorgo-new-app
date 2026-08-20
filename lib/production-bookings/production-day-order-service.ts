import 'server-only';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {
  canReorderProductionDay,
  executeReorderProductionDay,
  productionDayOrderFailure,
  type ProductionDayOrderResult,
  type ReorderProductionDayRequest,
} from './production-day-order-contract';

export async function reorderProductionDayWithAccess(request: ReorderProductionDayRequest): Promise<ProductionDayOrderResult> {
  try {
    const access = await getCurrentDoorGoAccess();
    if (access.state === 'unauthenticated') return productionDayOrderFailure('authentication_required');
    if (access.state !== 'active') return productionDayOrderFailure('active_profile_required');
    if (!canReorderProductionDay(access)) return productionDayOrderFailure('permission_required');
    const supabase = await createAuthenticatedSupabaseServerClient();
    return await executeReorderProductionDay(request, async (name, parameters) => {
      const { data, error } = await supabase.rpc(name, parameters);
      return { data, error };
    });
  } catch {
    return productionDayOrderFailure('unavailable');
  }
}
