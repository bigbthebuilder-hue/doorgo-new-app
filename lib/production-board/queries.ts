import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadDailyCapacityReadOnly } from './capacity-queries';
import { PRODUCTION_FLOW_BASELINE_DATE } from './flow-constants';
import { normalizeProductionBoard } from './normalize';
import type { DoorGoJobRow, ProductionBookingRow, ProductionBoardViewModel } from './types';

export async function loadProductionBoardReadOnly(params: {
  boardStart: string;
  boardEndExclusive: string;
  weeks: number;
}): Promise<ProductionBoardViewModel> {
  const supabase = createSupabaseServerClient();
  const calculationStart =
    params.boardStart >= PRODUCTION_FLOW_BASELINE_DATE
      ? PRODUCTION_FLOW_BASELINE_DATE
      : params.boardStart;

  // TODO: Use a persisted carry checkpoint or settings baseline to bound historical reads.

  const [bookingResult, capacityRows] = await Promise.all([
    supabase
      .from('dg_production_bookings')
      .select(`
        booking_id,
        job_id,
        calendar_id,
        calendar_event_id,
        title,
        production_date,
        shop_hours,
        salesperson,
        status,
        schedule_status,
        booking_kind,
        board_visible,
        all_day,
        calendar_sync_state,
        source,
        source_system,
        locked,
        completed_at,
        cancelled_at,
        deleted_at,
        created_at,
        updated_at,
        mirrored_at
      `)
      .gte('production_date', calculationStart)
      .lt('production_date', params.boardEndExclusive)
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .eq('status', 'active')
      .eq('schedule_status', 'confirmed')
      .neq('board_visible', false)
      .order('production_date', { ascending: true })
      .order('title', { ascending: true }),
    loadDailyCapacityReadOnly({
      startDate: calculationStart,
      endDateExclusive: params.boardEndExclusive,
    }),
  ]);

  if (bookingResult.error) {
    throw new Error(
      `Failed to load production bookings: ${bookingResult.error.message}`,
    );
  }

  const bookingRows = (bookingResult.data ?? []) as ProductionBookingRow[];
  const jobIds = Array.from(
    new Set(bookingRows.map((row) => row.job_id).filter(Boolean)),
  ) as string[];

  let jobRows: DoorGoJobRow[] = [];

  if (jobIds.length) {
    const { data: jobs, error: jobError } = await supabase
      .from('dg_jobs')
      .select(`
        job_id,
        customer,
        site_address,
        salesperson,
        status,
        active,
        shop_hours,
        job_stage
      `)
      .in('job_id', jobIds);

    if (jobError) {
      throw new Error(`Failed to load DoorGo jobs: ${jobError.message}`);
    }

    jobRows = (jobs ?? []) as DoorGoJobRow[];
  }

  return normalizeProductionBoard(bookingRows, jobRows, capacityRows, {
    startDate: params.boardStart,
    endDateExclusive: params.boardEndExclusive,
    weeks: params.weeks,
    calculationStartDate: calculationStart,
  });
}
