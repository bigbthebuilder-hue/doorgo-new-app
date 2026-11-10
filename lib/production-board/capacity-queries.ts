import { createTrustedReadOnlySupabaseClient } from '@/lib/supabase/trusted-read-server';
import { normalizeDailyCapacityRows } from './capacity-normalize';
import type { DailyCapacity, DailyCapacityRow } from './capacity-types';

export async function loadDailyCapacityReadOnly(params: {
  startDate: string;
  endDateExclusive: string;
}): Promise<DailyCapacity[]> {
  const supabase = createTrustedReadOnlySupabaseClient();

  const { data, error } = await supabase
    .rpc('load_effective_daily_capacity', {
      p_start: params.startDate,
      p_end_exclusive: params.endDateExclusive,
    })
    .order('production_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to load daily capacity: ${error.message}`);
  }

  return normalizeDailyCapacityRows((data ?? []) as DailyCapacityRow[]);
}
