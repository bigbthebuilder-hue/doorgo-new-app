'use server';
import{getCurrentDoorGoAccess}from'@/lib/auth/current-access';import{canMutateCalendar}from'./permissions';import{createAuthenticatedSupabaseServerClient}from'@/lib/supabase/server';

export type StaffAwayInput={commandId:string;periodId:string|null;expectedRevision:number|null;staffId:string;startDate:string;endDate:string;mode:'full_day'|'partial';partialDragHours:number|null;reason:string};
type Result={ok:true;periodId:string;revision:number;startDate:string;endDate:string}|{ok:false;code:string;message:string};
const messages:Record<string,string>={permission_required:'Calendar use permission is required.',staff_unavailable:'Choose an active Manager roster member.',invalid_request:'Check the Staff Away dates and fields.',partial_single_working_date:'Partial Staff Away must use one normal working date.',partial_drag_excessive:'Capacity Drag Hours exceed the allowed maximum for this date.',no_working_dates:'Choose a range containing at least one normal working date.',overlapping_period:'This staff member already has Staff Away overlapping the selected dates.',not_found:'This Staff Away period is no longer active.',stale_period:'This Staff Away period changed. Reopen it and try again.',invalid_range:'Choose a valid Staff Away date range.'};
const failure=(message:string):Result=>{const code=message.startsWith('staff_away.')?message.slice(11):'unavailable';return{ok:false,code,message:messages[code]??'Staff Away could not be saved. Please try again.'};};
async function authorized(){const access=await getCurrentDoorGoAccess();return canMutateCalendar(access)?createAuthenticatedSupabaseServerClient():null;}
export async function saveStaffAway(input:StaffAwayInput):Promise<Result>{const client=await authorized();if(!client)return failure('staff_away.permission_required');const {data,error}=await client.rpc('save_staff_away_period',{p_command_id:input.commandId,p_period_id:input.periodId,p_expected_revision:input.expectedRevision,p_staff_id:input.staffId,p_start_date:input.startDate,p_end_date:input.endDate,p_mode:input.mode,p_partial_drag_hours:input.partialDragHours,p_reason:input.reason});if(error)return failure(error.message);const row=(data??{}) as Record<string,unknown>;return{ok:true,periodId:String(row.periodId),revision:Number(row.revision??1),startDate:String(row.startDate??input.startDate),endDate:String(row.endDate??input.endDate)};}
export async function deleteStaffAway(input:{commandId:string;periodId:string;expectedRevision:number}):Promise<Result>{const client=await authorized();if(!client)return failure('staff_away.permission_required');const {data,error}=await client.rpc('delete_staff_away_period',{p_command_id:input.commandId,p_period_id:input.periodId,p_expected_revision:input.expectedRevision});if(error)return failure(error.message);const row=(data??{}) as Record<string,unknown>;return{ok:true,periodId:input.periodId,revision:input.expectedRevision+1,startDate:String(row.startDate),endDate:String(row.endDate)};}

export type StaffAwayMaximumResult = {ok:true;maximum:number}|{ok:false;message:string};
export async function loadStaffAwayCapacityDragMax(staffId:string,date:string):Promise<StaffAwayMaximumResult>{
  try {
    const client=await authorized();
    if(!client)return {ok:false,message:'Calendar use permission is required.'};
    const {data,error}=await client.rpc('calendar_staff_away_capacity_drag_max',{p_staff_id:staffId,p_date:date});
    if(error)return {ok:false,message:error.message==='staff_away.partial_single_working_date'?'Choose a normal working date for Partial Staff Away.':'Maximum unavailable.'};
    const maximum=typeof data==='number'?data:typeof data==='string'&&data.trim()!==''?Number(data):NaN;
    return Number.isFinite(maximum)&&maximum>=0?{ok:true,maximum}:{ok:false,message:'Maximum unavailable.'};
  } catch { return {ok:false,message:'Maximum unavailable.'}; }
}
