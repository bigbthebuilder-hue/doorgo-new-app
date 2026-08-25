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
import { loadCalendarNativeJobLinks } from './native-job-links';
import { calendarItemCard, mergeCalendarItems, type CalendarItemRow } from '@/lib/calendar/calendar-items';
import {loadStaffAwayRange} from '@/lib/calendar/staff-away-queries';
import {mergeStaffAway} from '@/lib/calendar/staff-away';
import{loadCalendarCapacityExceptions}from'@/lib/calendar/capacity-exception-queries';
import{mergeCapacityExceptions}from'@/lib/calendar/capacity-exceptions';

export async function loadProductionBoardReadOnly(params: {
  boardStart: string;
  boardEndExclusive: string;
  weeks: number;
  today?: string;
  includeNativeJobLinks?: boolean;
  includeOperationalCalendarItems?: boolean;
  includeStaffAway?: boolean;
  includeCapacityExceptions?:boolean;
}): Promise<ProductionBoardViewModel> {
  const supabase = createTrustedReadOnlySupabaseClient();
  const checkpointAnchor =
    await loadLatestConfirmedCheckpointOnOrBefore(params.boardStart);
  const calculationStart = selectCheckpointAwareCalculationStart({
    boardStart: params.boardStart,
    checkpointAnchorDate: checkpointAnchor?.productionDate ?? null,
  });

  // TODO: Use a persisted carry checkpoint or settings baseline to bound historical reads.

  const [bookingResult, needsAttentionResult, calendarItemsResult, staffAwayPayload, capacityExceptionPayload, capacityRows, checkpoints] = await Promise.all([
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
    params.includeOperationalCalendarItems?supabase.from('dg_calendar_items').select('item_id,item_type,scheduled_date,linked_internal_job_id,current_portion_id,order_family_key,customer_name,sales_order,salesperson,timing,fulfillment_note,title,details,day_order,completed_at,revision')
      .or(`scheduled_date.is.null,and(scheduled_date.gte.${calculationStart},scheduled_date.lt.${params.boardEndExclusive})`)
      .is('deleted_at',null).order('day_order',{ascending:true}):Promise.resolve({data:[],error:null}),
    params.includeStaffAway?loadStaffAwayRange(params.boardStart,params.boardEndExclusive):Promise.resolve({activeStaff:[],periods:[]}),
    params.includeCapacityExceptions?loadCalendarCapacityExceptions(params.boardStart,params.boardEndExclusive):Promise.resolve({records:[],exceptionalDates:[]}),
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
  const itemRows=(calendarItemsResult.data??[]) as CalendarItemRow[];
  const itemNativeJobIds=Array.from(new Set(itemRows.map((row)=>row.linked_internal_job_id).filter((value):value is string=>Boolean(value))));

  let jobRows: DoorGoJobRow[] = [];
  const [nativeLinks,legacyResult]=await Promise.all([
    params.includeNativeJobLinks?loadCalendarNativeJobLinks(jobIds,itemNativeJobIds,createJobIntakeRepository()):Promise.resolve({byVisibleIdentifier:new Map(),byInternalJobId:new Map()}),
    jobIds.length?supabase.from('dg_jobs').select(`job_id,customer,site_address,salesperson,status,active,shop_hours,job_stage`).in('job_id',jobIds):Promise.resolve({data:[],error:null}),
  ]);

  if (jobIds.length) {
    if (legacyResult.error) {
      throw new Error(`Failed to load DoorGo jobs: ${legacyResult.error.message}`);
    }
    const legacyJobs = (legacyResult.data ?? []) as DoorGoJobRow[];
    const jobsById = new Map(legacyJobs.map((job) => [job.job_id, job]));

    jobRows = jobIds.map((jobId) => {
      const legacy = jobsById.get(jobId);
      const native = nativeLinks.byVisibleIdentifier.get(jobId);
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
    exceptionalVisibleDates:capacityExceptionPayload.exceptionalDates,
  });
  const withItems=mergeCalendarItems(productionBoard,itemRows.map((row)=>{const native=row.linked_internal_job_id?nativeLinks.byInternalJobId.get(row.linked_internal_job_id):undefined;const job=native?{internalJobId:native.internalJobId,customer:native.customer,salesOrder:native.salesOrder,salesperson:row.salesperson}:undefined;return calendarItemCard(row,job,{included:row.sales_order?[row.sales_order]:[],available:[]});}));
  return mergeCapacityExceptions(mergeStaffAway(withItems,staffAwayPayload),capacityExceptionPayload);
}
