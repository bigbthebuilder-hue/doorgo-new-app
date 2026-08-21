'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess } from '@/lib/auth/access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {createJobIntakeRepository} from '@/lib/jobs/job-intake-repository';
import {updateJobWithAccess} from '@/lib/jobs/job-intake-service';
import {loadProductionBoardReadOnly} from '@/lib/production-board/queries';
import type {ProductionBoardCard} from '@/lib/production-board/types';
import {calendarJobEligible,findCalendarJobOptions,jobHeaderForFulfillment,type CalendarJobOption,type CalendarLinkItemType} from './calendar-job-linking';

export type CalendarCreateInput={commandId:string;itemType:'production'|'delivery'|'customer_pickup'|'note';scheduledDate:string|null;linkedInternalJobId:string|null;
  name:string;salesOrder:string;salesperson:string;shopHours:number|null;timing:string;fulfillmentNote:string;title:string;details:string;
  boardStart:string;boardEndExclusive:string;weeks:number;today:string};
export type CalendarMutationResult={ok:true;data:Record<string,unknown>}|{ok:false;message:string;code:string};
export type CalendarCreateResult={ok:true;data:Record<string,unknown>;card:ProductionBoardCard}|{ok:false;message:string;code:string};

const failure=(error:unknown):{ok:false;message:string;code:string}=>{const raw=error&&typeof error==='object'&&'message'in error?String(error.message):'';const code=raw.startsWith('calendar_item.')?raw.slice(14):'unavailable';
  const messages:Record<string,string>={permission_required:'Calendar use permission is required.',production_permission_required:'Production use permission is required.',jobs_permission_required:'Jobs use permission is required to link this item.',name_required:'Name is required.',salesperson_required:'Salesperson is required for Production.',job_not_found:'The selected DoorGo job is unavailable.',stale_item:'This item changed after Calendar loaded.',completed_item:'Reopen this item before moving it.',closed_date_override_required:'Confirm scheduling on this closed date.',stale_order:'Calendar ordering changed elsewhere. Try again.',invalid_order:'The requested Calendar order is invalid.',invalid_request:'The Calendar request is invalid.'};
  return {ok:false,code,message:messages[code]??'Calendar could not save this change. Please try again.'};};
async function calendarUse(){const access=await getCurrentDoorGoAccess();return getPermissionAccess(access,'calendar')==='use';}
async function rpc(name:string,args:Record<string,unknown>):Promise<CalendarMutationResult>{if(!await calendarUse())return failure({message:'calendar_item.permission_required'});const result=await (await createAuthenticatedSupabaseServerClient()).rpc(name,args);if(result.error)return failure(result.error);return {ok:true,data:(result.data??{}) as Record<string,unknown>};}

export async function searchCalendarLinkableJobs(input:{query:string;itemType:CalendarLinkItemType}):Promise<{ok:true;options:CalendarJobOption[]}|{ok:false;message:string}>{
  const query=input.query.trim();if(!query)return {ok:true,options:[]};const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'jobs')==='none')return {ok:false,message:'Jobs view permission is required.'};
  try{const repository=createJobIntakeRepository();
    return {ok:true,options:await findCalendarJobOptions(repository,query,input.itemType)};
  }catch{return {ok:false,message:'DoorGo jobs could not be searched. Please try again.'};}
}

export async function createCalendarItem(input:CalendarCreateInput):Promise<CalendarCreateResult>{
  const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'calendar')!=='use')return failure({message:'calendar_item.permission_required'});
  let authoritativeJob=null;
  if(input.linkedInternalJobId){try{const repository=createJobIntakeRepository();authoritativeJob=await repository.findById(input.linkedInternalJobId);if(!authoritativeJob)return failure({message:'calendar_item.job_not_found'});
    if(!calendarJobEligible(authoritativeJob.fulfillmentPlan,input.itemType))return {ok:false,code:'fulfillment_mismatch',message:`This Job is already marked ${authoritativeJob.fulfillmentPlan} and cannot be linked to this appointment type.`};
    const desired=input.itemType==='delivery'?'Delivery':input.itemType==='customer_pickup'?'Customer Pickup':null;
    if(desired&&!authoritativeJob.fulfillmentPlan){authoritativeJob=await updateJobWithAccess(access,{internalJobId:authoritativeJob.internalJobId,expectedRevision:authoritativeJob.revision,input:jobHeaderForFulfillment(authoritativeJob,desired),lines:authoritativeJob.lines},repository);}
  }catch{return {ok:false,code:'jobs_update_failed',message:'The linked Job could not be verified or updated. Jobs use permission is required when assigning fulfillment type.'};}}
  const result=await rpc('create_calendar_item',{p_command_id:input.commandId,p_item_type:input.itemType,p_scheduled_date:input.scheduledDate,p_linked_internal_job_id:input.linkedInternalJobId,
    p_customer_name:input.name,p_sales_order:input.salesOrder,p_salesperson:input.salesperson,p_shop_hours:input.shopHours,p_timing:input.timing,p_fulfillment_note:input.fulfillmentNote,p_title:input.title,p_details:input.details});
  if(!result.ok)return result;
  const id=String(result.data.id??'');const board=await loadProductionBoardReadOnly({boardStart:input.boardStart,boardEndExclusive:input.boardEndExclusive,weeks:input.weeks,today:input.today,
    includeNativeJobLinks:getPermissionAccess(access,'jobs')!=='none',includeOperationalCalendarItems:true});
  const expectedId=result.data.record_kind==='calendar_item'?`item:${id}`:id;const card=[...board.needsAttentionCards,...board.days.flatMap((day)=>day.cards)].find((item)=>item.bookingId===expectedId);
  return card?{ok:true,data:result.data,card}:{ok:false,code:'authoritative_read_failed',message:'The item was saved but could not be loaded into Calendar. Reopen Calendar to reconcile it.'};
}
export async function moveCalendarItem(input:{commandId:string;itemId:string;expectedRevision:number;destinationDate:string|null;closedAcknowledged:boolean}){return rpc('move_calendar_item',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision,p_destination_date:input.destinationDate,p_closed_acknowledged:input.closedAcknowledged});}
export async function setCalendarItemCompletion(input:{commandId:string;itemId:string;expectedRevision:number;completed:boolean}){return rpc('set_calendar_item_completion',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision,p_completed:input.completed});}
export async function reorderCalendarItems(input:{scheduledDate:string|null;expectedKeys:string[];orderedKeys:string[]}){return rpc('reorder_calendar_items',{p_scheduled_date:input.scheduledDate,p_expected_keys:input.expectedKeys,p_ordered_keys:input.orderedKeys});}
