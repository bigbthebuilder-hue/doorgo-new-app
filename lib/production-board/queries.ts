import { createSupabaseServerClient } from '@/lib/supabase/server';
import { normalizeProductionBoard } from './normalize';
import type { DoorGoJobRow, ProductionBookingRow } from './types';

export async function loadProductionBoardReadOnly(params: {
  boardStart: string;
  boardEndExclusive: string;
}) {
  const supabase = createSupabaseServerClient();

  const { data: bookings, error: bookingError } = await supabase
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
    .gte('production_date', params.boardStart)
    .lt('production_date', params.boardEndExclusive)
    .is('deleted_at', null)
    .is('cancelled_at', null)
    .eq('status', 'active')
    .eq('schedule_status', 'confirmed')
    .neq('board_visible', false)
    .order('production_date', { ascending: true })
    .order('title', { ascending: true });

  if (bookingError) {
    throw new Error(`Failed to load production bookings: ${bookingError.message}`);
  }

  const bookingRows = (bookings ?? []) as ProductionBookingRow[];
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

  return normalizeProductionBoard(bookingRows, jobRows);
}