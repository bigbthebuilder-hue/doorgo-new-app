'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess } from '@/lib/auth/access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';

export type CalendarCreateInput={commandId:string;itemType:'production'|'delivery'|'customer_pickup'|'note';scheduledDate:string|null;linkedInternalJobId:string|null;
  name:string;salesOrder:string;salesperson:string;shopHours:number|null;timing:string;fulfillmentNote:string;title:string;details:string};
export type CalendarMutationResult={ok:true;data:Record<string,unknown>}|{ok:false;message:string;code:string};

const failure=(error:unknown):CalendarMutationResult=>{const raw=error&&typeof error==='object'&&'message'in error?String(error.message):'';const code=raw.startsWith('calendar_item.')?raw.slice(14):'unavailable';
  const messages:Record<string,string>={permission_required:'Calendar use permission is required.',production_permission_required:'Production use permission is required.',jobs_permission_required:'Jobs use permission is required to link this item.',name_required:'Name is required.',salesperson_required:'Salesperson is required for Production.',job_not_found:'The selected DoorGo job is unavailable.',stale_item:'This item changed after Calendar loaded.',completed_item:'Reopen this item before moving it.',closed_date_override_required:'Confirm scheduling on this closed date.',stale_order:'Calendar ordering changed elsewhere. Try again.',invalid_order:'The requested Calendar order is invalid.',invalid_request:'The Calendar request is invalid.'};
  return {ok:false,code,message:messages[code]??'Calendar could not save this change. Please try again.'};};
async function calendarUse(){const access=await getCurrentDoorGoAccess();return getPermissionAccess(access,'calendar')==='use';}
async function rpc(name:string,args:Record<string,unknown>):Promise<CalendarMutationResult>{if(!await calendarUse())return failure({message:'calendar_item.permission_required'});const result=await (await createAuthenticatedSupabaseServerClient()).rpc(name,args);if(result.error)return failure(result.error);return {ok:true,data:(result.data??{}) as Record<string,unknown>};}

export async function createCalendarItem(input:CalendarCreateInput){return rpc('create_calendar_item',{p_command_id:input.commandId,p_item_type:input.itemType,p_scheduled_date:input.scheduledDate,
  p_linked_internal_job_id:input.linkedInternalJobId,p_customer_name:input.name,p_sales_order:input.salesOrder,p_salesperson:input.salesperson,p_shop_hours:input.shopHours,
  p_timing:input.timing,p_fulfillment_note:input.fulfillmentNote,p_title:input.title,p_details:input.details});}
export async function moveCalendarItem(input:{commandId:string;itemId:string;expectedRevision:number;destinationDate:string|null;closedAcknowledged:boolean}){return rpc('move_calendar_item',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision,p_destination_date:input.destinationDate,p_closed_acknowledged:input.closedAcknowledged});}
export async function setCalendarItemCompletion(input:{commandId:string;itemId:string;expectedRevision:number;completed:boolean}){return rpc('set_calendar_item_completion',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision,p_completed:input.completed});}
export async function reorderCalendarItems(input:{scheduledDate:string|null;expectedKeys:string[];orderedKeys:string[]}){return rpc('reorder_calendar_items',{p_scheduled_date:input.scheduledDate,p_expected_keys:input.expectedKeys,p_ordered_keys:input.orderedKeys});}
