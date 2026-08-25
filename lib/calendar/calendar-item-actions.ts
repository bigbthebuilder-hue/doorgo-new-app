'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess } from '@/lib/auth/access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import {createTrustedReadOnlySupabaseClient} from '@/lib/supabase/trusted-read-server';
import {createJobIntakeRepository} from '@/lib/jobs/job-intake-repository';
import {updateJobWithAccess} from '@/lib/jobs/job-intake-service';
import {loadProductionBoardReadOnly} from '@/lib/production-board/queries';
import {loadNativeJobLinksByVisibleIdentifier} from '@/lib/production-board/native-job-links';
import type {ProductionBoardCard} from '@/lib/production-board/types';
import {calendarJobEligible,jobHeaderForShopDate,type CalendarJobOption,type CalendarLinkItemType} from './calendar-job-linking';

export type CalendarCreateInput={commandId:string;itemType:'production'|'delivery'|'customer_pickup'|'note';scheduledDate:string|null;linkedInternalJobId:string|null;
  name:string;salesOrder:string;salesperson:string;shopHours:number|null;timing:string;fulfillmentNote:string;title:string;details:string;
  boardStart:string;boardEndExclusive:string;weeks:number;today:string};
export type CalendarMutationResult={ok:true;data:Record<string,unknown>}|{ok:false;message:string;code:string};
export type CalendarCreateResult={ok:true;data:Record<string,unknown>;card:ProductionBoardCard}|{ok:false;message:string;code:string};
export type CalendarSearchTarget={bookingId:string;productionDate:string;customer:string;jobId:string|null;calendarItemType:'production'|'delivery'|'customer_pickup'|'note'};

const failure=(error:unknown):{ok:false;message:string;code:string}=>{const raw=error&&typeof error==='object'&&'message'in error?String(error.message):'';const code=raw.startsWith('calendar_item.')?raw.slice(14):'unavailable';
  const messages:Record<string,string>={permission_required:'Calendar use permission is required.',production_permission_required:'Production use permission is required.',jobs_permission_required:'Jobs use permission is required to link this item.',name_required:'Name is required.',salesperson_required:'Salesperson is required for Production.',job_not_found:'The selected DoorGo job is unavailable.',not_found:'This Calendar item is no longer available.',stale_item:'This item changed after Calendar loaded. Reopen its details and try again.',completed_item:'Reopen this Calendar item before deleting it.',backorder_delete_required:'Use Delete Backorder so its Sales Order is released safely.',fulfillment_portion_missing:'This fulfillment item has lost its authoritative order link.',fulfillment_mismatch:'This Job has a different fulfillment type.',duplicate_fulfillment:'This order already has an active fulfillment appointment.',closed_date_override_required:'Confirm scheduling on this closed date.',stale_order:'Calendar ordering changed elsewhere. Try again.',invalid_order:'The requested Calendar order is invalid.',invalid_request:'The Calendar request is invalid.'};
  return {ok:false,code,message:messages[code]??'Calendar could not save this change. Please try again.'};};
async function calendarUse(){const access=await getCurrentDoorGoAccess();return getPermissionAccess(access,'calendar')==='use';}
async function rpc(name:string,args:Record<string,unknown>):Promise<CalendarMutationResult>{if(!await calendarUse())return failure({message:'calendar_item.permission_required'});const result=await (await createAuthenticatedSupabaseServerClient()).rpc(name,args);if(result.error)return failure(result.error);return {ok:true,data:(result.data??{}) as Record<string,unknown>};}

export async function searchCalendarLinkableJobs(input:{query:string;itemType:CalendarLinkItemType}):Promise<{ok:true;options:CalendarJobOption[]}|{ok:false;message:string}>{
  const query=input.query.trim();if(!query)return {ok:true,options:[]};const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'jobs')==='none')return {ok:false,message:'Jobs view permission is required.'};
  try{const result=await (await createAuthenticatedSupabaseServerClient()).rpc('search_calendar_linkable_jobs',{p_query:query,p_item_type:input.itemType,p_limit:20});
    if(result.error)throw result.error;const rows=Array.isArray(result.data)?result.data:[];
    return {ok:true,options:rows.map((row)=>{const value=row as Record<string,unknown>;return {internalJobId:String(value.internal_job_id),customer:String(value.customer??''),salesOrder:String(value.biztrack_sales_order??value.visible_identifier??''),doorGoReference:typeof value.door_go_reference==='string'?value.door_go_reference:null,salesperson:typeof value.salesperson==='string'?value.salesperson:null,fulfillmentPlan:typeof value.fulfillment_plan==='string'?value.fulfillment_plan:null,revision:Number(value.revision)};})};
  }catch{return {ok:false,message:'DoorGo jobs could not be searched. Please try again.'};}
}

export async function searchScheduledCalendar(input:{query:string}):Promise<{ok:true;targets:CalendarSearchTarget[]}|{ok:false}>{
  const query=input.query.trim();if(!query)return {ok:true,targets:[]};const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'calendar')==='none')return {ok:false};
  try{const client=createTrustedReadOnlySupabaseClient();const pattern=`%${query.replaceAll('%','\\%').replaceAll('_','\\_')}%`;
    const [productionTitle,productionJob,itemCustomer,itemSales,itemTitle]=await Promise.all([
      client.from('dg_production_bookings').select('booking_id,production_date,title,job_id').ilike('title',pattern).not('production_date','is',null).is('deleted_at',null).is('cancelled_at',null).eq('status','active').eq('schedule_status','confirmed').neq('board_visible',false).limit(20),
      client.from('dg_production_bookings').select('booking_id,production_date,title,job_id').ilike('job_id',pattern).not('production_date','is',null).is('deleted_at',null).is('cancelled_at',null).eq('status','active').eq('schedule_status','confirmed').neq('board_visible',false).limit(20),
      client.from('dg_calendar_items').select('item_id,item_type,scheduled_date,linked_internal_job_id,customer_name,sales_order,title').ilike('customer_name',pattern).not('scheduled_date','is',null).is('deleted_at',null).limit(20),
      client.from('dg_calendar_items').select('item_id,item_type,scheduled_date,linked_internal_job_id,customer_name,sales_order,title').ilike('sales_order',pattern).not('scheduled_date','is',null).is('deleted_at',null).limit(20),
      client.from('dg_calendar_items').select('item_id,item_type,scheduled_date,linked_internal_job_id,customer_name,sales_order,title').ilike('title',pattern).not('scheduled_date','is',null).is('deleted_at',null).limit(20),
    ]);if([productionTitle,productionJob,itemCustomer,itemSales,itemTitle].some((result)=>result.error))return {ok:false};const portionMatches=await client.from('dg_fulfillment_order_portions').select('portion_id,sales_order').ilike('sales_order',pattern).limit(20);if(portionMatches.error)return {ok:false};const portionIds=(portionMatches.data??[]).map((row)=>row.portion_id);const membershipMatches=portionIds.length?await client.from('dg_calendar_item_orders').select('item_id,portion_id').in('portion_id',portionIds):{data:[],error:null};if(membershipMatches.error)return {ok:false};const matchedItemIds=Array.from(new Set((membershipMatches.data??[]).map((row)=>row.item_id)));const includedItemMatches=matchedItemIds.length?await client.from('dg_calendar_items').select('item_id,item_type,scheduled_date,linked_internal_job_id,customer_name,sales_order,title').in('item_id',matchedItemIds).not('scheduled_date','is',null).is('deleted_at',null):{data:[],error:null};if(includedItemMatches.error)return {ok:false};const targets=new Map<string,CalendarSearchTarget>();
    const productionRows=[...(productionTitle.data??[]),...(productionJob.data??[])];const itemRows=[...(itemCustomer.data??[]),...(itemSales.data??[]),...(itemTitle.data??[]),...(includedItemMatches.data??[])];
    const nativeByVisible=new Map<string,{customer:string|null;salesOrder:string|null}>();const nativeByInternal=new Map<string,{customer:string|null;salesOrder:string|null}>();
    if(getPermissionAccess(access,'jobs')!=='none'){const repository=createJobIntakeRepository();const visibleIds=Array.from(new Set(productionRows.map((row)=>row.job_id).filter((value):value is string=>Boolean(value))));const links=await loadNativeJobLinksByVisibleIdentifier(visibleIds,repository);await Promise.all([...links.entries()].map(async([visible,link])=>{const job=await repository.findById(link.internalJobId);if(job)nativeByVisible.set(visible,{customer:job.customer,salesOrder:job.bizTrackSalesOrder});}));const internalIds=Array.from(new Set(itemRows.map((row)=>row.linked_internal_job_id).filter((value):value is string=>Boolean(value))));await Promise.all(internalIds.map(async(id)=>{const job=await repository.findById(id);if(job)nativeByInternal.set(id,{customer:job.customer,salesOrder:job.bizTrackSalesOrder});}));}
    for(const row of productionRows)if(row.production_date){const native=row.job_id?nativeByVisible.get(row.job_id):undefined;targets.set(row.booking_id,{bookingId:row.booking_id,productionDate:row.production_date,customer:native?.customer?.trim()||row.title||'Untitled',jobId:native?.salesOrder?.trim()||row.job_id,calendarItemType:'production'});}
    for(const row of itemRows)if(row.scheduled_date){const native=row.linked_internal_job_id?nativeByInternal.get(row.linked_internal_job_id):undefined;targets.set(`item:${row.item_id}`,{bookingId:`item:${row.item_id}`,productionDate:row.scheduled_date,customer:native?.customer?.trim()||row.customer_name||row.title||'Untitled',jobId:row.sales_order?.trim()||native?.salesOrder?.trim()||null,calendarItemType:row.item_type});}
    const typeOrder={production:0,delivery:1,customer_pickup:2,note:3};return {ok:true,targets:[...targets.values()].sort((a,b)=>a.productionDate.localeCompare(b.productionDate)||typeOrder[a.calendarItemType]-typeOrder[b.calendarItemType]||a.bookingId.localeCompare(b.bookingId)).slice(0,20)};
  }catch{return {ok:false};}
}

export async function createCalendarItem(input:CalendarCreateInput):Promise<CalendarCreateResult>{
  const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'calendar')!=='use')return failure({message:'calendar_item.permission_required'});
  let authoritativeJob=null;
  if(input.linkedInternalJobId){try{const repository=createJobIntakeRepository();authoritativeJob=await repository.findById(input.linkedInternalJobId);if(!authoritativeJob)return failure({message:'calendar_item.job_not_found'});
    if(!calendarJobEligible(authoritativeJob.fulfillmentPlan,input.itemType))return {ok:false,code:'fulfillment_mismatch',message:`This Job is already marked ${authoritativeJob.fulfillmentPlan} and cannot be linked to this appointment type.`};
    const desired=input.itemType==='delivery'?'Delivery':input.itemType==='customer_pickup'?'Customer Pickup':null;
    if(desired){const scheduled=await rpc('schedule_linked_fulfillment',{p_command_id:input.commandId,p_linked_internal_job_id:authoritativeJob.internalJobId,p_item_type:input.itemType,p_scheduled_date:input.scheduledDate,p_timing:input.timing,p_fulfillment_note:input.fulfillmentNote});if(!scheduled.ok)return scheduled;
      const board=await loadProductionBoardReadOnly({boardStart:input.boardStart,boardEndExclusive:input.boardEndExclusive,weeks:input.weeks,today:input.today,includeNativeJobLinks:true,includeOperationalCalendarItems:true});const expectedId=`item:${String(scheduled.data.item_id)}`;const card=[...board.needsAttentionCards,...board.days.flatMap((day)=>day.cards)].find((item)=>item.bookingId===expectedId);return card?{ok:true,data:scheduled.data,card}:{ok:false,code:'authoritative_read_failed',message:'The fulfillment appointment was saved but could not be loaded into Calendar. Reopen Calendar to reconcile it.'};}
    else if(input.itemType==='production'){authoritativeJob=await updateJobWithAccess(access,{internalJobId:authoritativeJob.internalJobId,expectedRevision:authoritativeJob.revision,input:jobHeaderForShopDate(authoritativeJob,input.scheduledDate),lines:authoritativeJob.lines},repository);}
  }catch{return {ok:false,code:'jobs_update_failed',message:'The linked Job could not be verified or updated. Jobs use permission is required when assigning fulfillment type.'};}}
  if(authoritativeJob&&input.itemType!=='note'){
    const board=await loadProductionBoardReadOnly({boardStart:input.boardStart,boardEndExclusive:input.boardEndExclusive,weeks:input.weeks,today:input.today,includeNativeJobLinks:true,includeOperationalCalendarItems:true});
    const card=[...board.needsAttentionCards,...board.days.flatMap((day)=>day.cards)].find((item)=>item.internalJobId===authoritativeJob.internalJobId&&!item.completedAt&&(input.itemType==='production'?item.recordKind!=='calendar_item':item.recordKind==='calendar_item'&&item.calendarItemType===input.itemType));
    if(card)return {ok:true,data:{record_kind:card.recordKind==='calendar_item'?'calendar_item':'production',id:card.recordKind==='calendar_item'?card.bookingId.slice(5):card.bookingId,scheduled_date:card.productionDate,day_order:card.dayOrder},card};
    if(input.itemType!=='production')return {ok:false,code:'authoritative_read_failed',message:'The fulfillment appointment was synchronized but could not be loaded into Calendar. Reopen Calendar to reconcile it.'};
  }
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
export async function deleteCalendarItem(input:{commandId:string;itemId:string;expectedRevision:number}){return rpc('delete_calendar_item',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision});}
export async function reorderCalendarItems(input:{scheduledDate:string|null;expectedKeys:string[];orderedKeys:string[]}){return rpc('reorder_calendar_items',{p_scheduled_date:input.scheduledDate,p_expected_keys:input.expectedKeys,p_ordered_keys:input.orderedKeys});}
