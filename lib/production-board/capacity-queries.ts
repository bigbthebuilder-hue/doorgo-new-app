import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeDailyCapacityRows } from './capacity-normalize';
import type { DailyCapacity, DailyCapacityRow } from './capacity-types';

export async function loadDailyCapacityReadOnly(params: {
  startDate: string;
  endDateExclusive: string;
}): Promise<DailyCapacity[]> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('dg_daily_capacity')
    .select(`
      production_date,
      available_hours,
      staff_capacity_hours,
      deduction_hours,
      capacity_source,
      is_closed,
      notes,
      details,
      source_system,
      calculated_at,
      mirrored_at,
      created_at,
      updated_at
    `)
    .gte('production_date', params.startDate)
    .lt('production_date', params.endDateExclusive)
    .order('production_date', { ascending: true });

  if (error) {
    throw new Error(`Failed to load daily capacity: ${error.message}`);
  }

  return normalizeDailyCapacityRows((data ?? []) as DailyCapacityRow[]);
}
