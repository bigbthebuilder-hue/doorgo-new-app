import { createTrustedReadOnlySupabaseClient } from '@/lib/supabase/trusted-read-server';
import { createJobIntakeRepository } from '@/lib/jobs/job-intake-repository';
import {
  loadConfirmedCheckpointsInRange,
  loadLatestConfirmedCheckpointOnOrBefore,
} from '@/lib/production-flow/checkpoint-queries';
import { selectCheckpointAwareCalculationStart } from '@/lib/production-flow/checkpoint-window';
import { loadDailyCapacityReadOnly } from './capacity-queries';
import { normalizeProductionBoard } from './normalize';
import type { DoorGoJobRow, ProductionBookingRow, ProductionBoardViewModel } from './types';
import { loadNativeJobLinksByVisibleIdentifier } from './native-job-links';
import { calendarItemCard, mergeCalendarItems, type CalendarItemRow } from '@/lib/calendar/calendar-items';

export async function loadProductionBoardReadOnly(params: {
  boardStart: string;
  boardEndExclusive: string;
  weeks: number;
  today?: string;
  includeNativeJobLinks?: boolean;
  includeOperationalCalendarItems?: boolean;
}): Promise<ProductionBoardViewModel> {
  const supabase = createTrustedReadOnlySupabaseClient();
  const checkpointAnchor =
    await loadLatestConfirmedCheckpointOnOrBefore(params.boardStart);
  const calculationStart = selectCheckpointAwareCalculationStart({
    boardStart: params.boardStart,
    checkpointAnchorDate: checkpointAnchor?.productionDate ?? null,
  });

  // TODO: Use a persisted carry checkpoint or settings baseline to bound historical reads.

  const [bookingResult, needsAttentionResult, calendarItemsResult, capacityRows, checkpoints] = await Promise.all([
    supabase
      .from('dg_production_bookings')
      .select(`
        booking_id,
        job_id,
        calendar_id,
        calendar_event_id,
        title,
        production_date,
        day_order,
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
      .order('day_order', { ascending: true })
      .order('title', { ascending: true }),
    supabase
      .from('dg_production_bookings')
      .select(`
        booking_id, job_id, calendar_id, calendar_event_id, title, production_date,
        day_order, shop_hours, salesperson, status, schedule_status, booking_kind,
        board_visible, all_day, calendar_sync_state, source, source_system, locked,
        completed_at, cancelled_at, deleted_at, created_at, updated_at, mirrored_at
      `)
      .is('production_date', null)
      .is('deleted_at', null)
      .is('cancelled_at', null)
      .eq('status', 'active')
      .eq('schedule_status', 'confirmed')
      .eq('booking_kind', 'production')
      .neq('board_visible', false)
      .order('day_order', { ascending: true })
      .order('title', { ascending: true }),
    params.includeOperationalCalendarItems?supabase.from('dg_calendar_items').select('item_id,item_type,scheduled_date,linked_internal_job_id,customer_name,sales_order,salesperson,timing,fulfillment_note,title,details,day_order,completed_at,revision')
      .or(`scheduled_date.is.null,and(scheduled_date.gte.${calculationStart},scheduled_date.lt.${params.boardEndExclusive})`)
      .is('deleted_at',null).order('day_order',{ascending:true}):Promise.resolve({data:[],error:null}),
    loadDailyCapacityReadOnly({
      startDate: calculationStart,
      endDateExclusive: params.boardEndExclusive,
    }),
    loadConfirmedCheckpointsInRange({
      startDate: calculationStart,
      endDateExclusive: params.boardEndExclusive,
    }),
  ]);

  if (bookingResult.error) {
    throw new Error(
      `Failed to load production bookings: ${bookingResult.error.message}`,
    );
  }
  if (needsAttentionResult.error) {
    throw new Error(`Failed to load Needs Attention production: ${needsAttentionResult.error.message}`);
  }
  if(calendarItemsResult.error) throw new Error(`Failed to load Calendar items: ${calendarItemsResult.error.message}`);

  const bookingRows = [
    ...((bookingResult.data ?? []) as ProductionBookingRow[]),
    ...((needsAttentionResult.data ?? []) as ProductionBookingRow[]),
  ];
  const jobIds = Array.from(
    new Set(bookingRows.map((row) => row.job_id).filter(Boolean)),
  ) as string[];

  let jobRows: DoorGoJobRow[] = [];

  if (jobIds.length) {
    const [legacyResult, internalIds] = await Promise.all([
      supabase
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
        .in('job_id', jobIds),
      params.includeNativeJobLinks
        ? loadNativeJobLinksByVisibleIdentifier(jobIds, createJobIntakeRepository())
        : Promise.resolve(new Map()),
    ]);

    if (legacyResult.error) {
      throw new Error(`Failed to load DoorGo jobs: ${legacyResult.error.message}`);
    }
    const legacyJobs = (legacyResult.data ?? []) as DoorGoJobRow[];
    const jobsById = new Map(legacyJobs.map((job) => [job.job_id, job]));

    jobRows = jobIds.map((jobId) => {
      const legacy = jobsById.get(jobId);
      const native = internalIds.get(jobId);
      return {
        job_id: jobId,
        customer: legacy?.customer ?? null,
        site_address: legacy?.site_address ?? null,
        salesperson: legacy?.salesperson ?? null,
        status: legacy?.status ?? null,
        active: legacy?.active ?? null,
        shop_hours: legacy?.shop_hours ?? null,
        job_stage: legacy?.job_stage ?? null,
        internal_job_id: native?.internalJobId ?? null,
        native_sales_order: native?.salesOrder ?? null,
      };
    });
  }

  const productionBoard=normalizeProductionBoard(bookingRows, jobRows, capacityRows, {
    startDate: params.boardStart,
    endDateExclusive: params.boardEndExclusive,
    weeks: params.weeks,
    calculationStartDate: calculationStart,
    checkpoints,
    today: params.today,
  });
  const itemRows=(calendarItemsResult.data??[]) as CalendarItemRow[];
  const linked=new Map<string,{internalJobId:string;customer:string|null;salesOrder:string|null;salesperson:string|null}>();
  if(params.includeNativeJobLinks){
    const repository=createJobIntakeRepository();
    await Promise.all(Array.from(new Set(itemRows.map((row)=>row.linked_internal_job_id).filter(Boolean) as string[])).map(async(id)=>{
      const job=await repository.findById(id); if(job)linked.set(id,{internalJobId:job.internalJobId,customer:job.customer,salesOrder:job.bizTrackSalesOrder,salesperson:job.salesperson});
    }));
  }
  return mergeCalendarItems(productionBoard,itemRows.map((row)=>calendarItemCard(row,row.linked_internal_job_id?linked.get(row.linked_internal_job_id):undefined)));
}
