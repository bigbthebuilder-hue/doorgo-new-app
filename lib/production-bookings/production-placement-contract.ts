export const PRODUCTION_PLACEMENT_RPC = 'place_production_booking';

export type ProductionPlacementRequest = {
  commandId: string;
  bookingId: string;
  expectedProductionDate: string | null;
  destinationProductionDate: string | null;
  whollyUnstartedAcknowledged: boolean;
  backdateReason: string | null;
  closedDateOverrideAcknowledged: boolean;
};
export type ProductionPlacement = {
  moveId: string; bookingId: string; previousProductionDate: string | null; newProductionDate: string | null;
  previousDayOrder: number; newDayOrder: number; shopHours: number | null; movedAt: string;
  actionType: 'schedule' | 'unschedule' | 'reschedule'; destinationWasClosed: boolean;
};
export type ProductionPlacementResult = { ok: true; move: ProductionPlacement } | { ok: false; code: string; message: string };

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE=/^\d{4}-\d{2}-\d{2}$/;
const validDate=(value: unknown): value is string => typeof value==='string' && DATE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const failure=(code:string):ProductionPlacementResult=>({ok:false,code,message:({
  authentication_required:'Sign in before moving Production.',active_profile_required:'An active DoorGo profile is required.',
  permission_required:'Calendar and Production use permission are required.',jobs_permission_required:'Jobs use permission is required to change a linked Shop Date.',
  stale_booking:'This Production booking changed after Calendar loaded.',ineligible_booking:'Reopen this Production booking before moving it.',
  closed_date_override_required:'Confirm scheduling Production on this closed date.',not_found:'The Production booking was not found.',
  invalid_request:'The Production placement request is invalid.',command_uuid_collision:'This placement command conflicts with an earlier request.',
  malformed_response:'The Production placement response was invalid.',unavailable:'Production could not be moved. Please try again.',
} as Record<string,string>)[code]??'Production could not be moved.'});

export async function executeProductionPlacement(input: ProductionPlacementRequest, rpc:(name:string,params:Record<string,unknown>)=>Promise<{data:unknown;error:unknown}>):Promise<ProductionPlacementResult>{
  if(!UUID.test(input.commandId)||!input.bookingId.trim()||input.bookingId!==input.bookingId.trim()
    || (input.expectedProductionDate!==null&&!validDate(input.expectedProductionDate))
    || (input.destinationProductionDate!==null&&!validDate(input.destinationProductionDate))
    || input.expectedProductionDate===input.destinationProductionDate||input.backdateReason!==null||input.whollyUnstartedAcknowledged) return failure('invalid_request');
  const result=await rpc(PRODUCTION_PLACEMENT_RPC,{p_command_id:input.commandId,p_booking_id:input.bookingId,p_expected_production_date:input.expectedProductionDate,
    p_destination_production_date:input.destinationProductionDate,p_wholly_unstarted_acknowledged:input.whollyUnstartedAcknowledged,
    p_backdate_reason:input.backdateReason,p_closed_date_override_acknowledged:input.closedDateOverrideAcknowledged});
  if(result.error){const raw=result.error&&typeof result.error==='object'&&'message'in result.error?String(result.error.message):'';return failure(raw.startsWith('production_placement.')?raw.slice(21):'unavailable');}
  const row=Array.isArray(result.data)&&result.data.length===1?result.data[0] as Record<string,unknown>:null;
  if(!row||!UUID.test(String(row.move_id))||row.status!=='moved')return failure('malformed_response');
  return {ok:true,move:{moveId:String(row.move_id),bookingId:String(row.booking_id),previousProductionDate:row.previous_production_date as string|null,
    newProductionDate:row.new_production_date as string|null,previousDayOrder:Number(row.previous_day_order),newDayOrder:Number(row.new_day_order),
    shopHours:row.shop_hours===null?null:Number(row.shop_hours),movedAt:String(row.moved_at),actionType:row.action_type as ProductionPlacement['actionType'],destinationWasClosed:Boolean(row.destination_was_closed)}};
}
