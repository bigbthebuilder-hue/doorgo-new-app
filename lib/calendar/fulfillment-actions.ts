'use server';

import { getCurrentDoorGoAccess } from '@/lib/auth/current-access';
import { getPermissionAccess } from '@/lib/auth/access';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';
import { addDaysToDateOnly, getMondayForDate } from '@/lib/production-board/date-utils';
import type { ProductionBoardCard } from '@/lib/production-board/types';
import { nextAvailableBackorderSalesOrder, type FulfillmentType } from './order-family';

type Failure={ok:false;code:string;message:string};
const fail=(code:string):Failure=>({ok:false,code,message:({wrong_order_family:'That Sales Order does not belong to this Job order family.',sales_order_exists:'That backorder Sales Order already exists.',no_available_backorder:'No available backorder numbers remain in this order family.',jobs_permission_required:'Jobs use permission is required.',permission_required:'Calendar use permission is required.',stale_item:'This fulfillment appointment changed. Reopen it and try again.',item_not_found:'This fulfillment item is no longer active or is not linked to an order family.',unknown_order:'This Sales Order is no longer available.',primary_order_required:'The primary Sales Order cannot be deleted as a backorder.',completed_item:'Reopen this fulfillment item before changing or deleting it.',invalid_request:'Choose Delivery or Customer Pickup.'} as Record<string,string>)[code]??'Fulfillment could not be updated. Reopen Calendar and try again.'});
const errorCode=(error:unknown)=>{const message=error&&typeof error==='object'&&'message'in error?String(error.message):'';return message.startsWith('fulfillment.')?message.slice(12):message.startsWith('calendar_item.')?message.slice(14):'unavailable';};

export async function addBackorder(input:{commandId:string;linkedInternalJobId:string;baseSalesOrder:string;itemType:FulfillmentType;scheduledDate:string|null;timing:string;fulfillmentNote:string;today:string}):Promise<{ok:true;card:ProductionBoardCard;salesOrder:string}|Failure>{
  const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'calendar')!=='use')return fail('permission_required');
  const client=await createAuthenticatedSupabaseServerClient();const {data,error}=await client.rpc('add_fulfillment_backorder_auto',{p_command_id:input.commandId,p_linked_internal_job_id:input.linkedInternalJobId,p_item_type:input.itemType,p_scheduled_date:input.scheduledDate,p_timing:input.timing,p_fulfillment_note:input.fulfillmentNote});
  if(error)return fail(errorCode(error));const itemId=String((data as Record<string,unknown>).item_id);const boardStart=getMondayForDate(input.scheduledDate??input.today);const board=await loadProductionBoardReadOnly({boardStart,boardEndExclusive:addDaysToDateOnly(boardStart,7),weeks:1,today:input.today,includeNativeJobLinks:true,includeOperationalCalendarItems:true});
  const card=[...board.needsAttentionCards,...board.days.flatMap((day)=>day.cards)].find((item)=>item.bookingId===`item:${itemId}`);return card?{ok:true,card,salesOrder:String((data as Record<string,unknown>).sales_order)}:fail('unavailable');
}

export async function loadNextBackorderSalesOrder(internalJobId:string,baseSalesOrder:string){const family=await loadJobFulfillmentFamily(internalJobId);return family.ok?{ok:true as const,salesOrder:nextAvailableBackorderSalesOrder(baseSalesOrder,family.orders)}:family;}

export async function setFulfillmentItemType(input:{commandId:string;itemId:string;expectedRevision:number;itemType:FulfillmentType}){if(getPermissionAccess(await getCurrentDoorGoAccess(),'calendar')!=='use')return fail('permission_required');const {data,error}=await (await createAuthenticatedSupabaseServerClient()).rpc('set_fulfillment_item_type',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision,p_item_type:input.itemType});return error?fail(errorCode(error)):{ok:true as const,data:(data??{}) as Record<string,unknown>};}

export async function deleteFulfillmentBackorder(input:{commandId:string;itemId:string;expectedRevision:number;salesOrder:string}){if(getPermissionAccess(await getCurrentDoorGoAccess(),'calendar')!=='use')return fail('permission_required');const {data,error}=await (await createAuthenticatedSupabaseServerClient()).rpc('delete_fulfillment_backorder',{p_command_id:input.commandId,p_item_id:input.itemId,p_expected_revision:input.expectedRevision,p_sales_order:input.salesOrder});return error?fail(errorCode(error)):{ok:true as const,data:(data??{}) as Record<string,unknown>};}

export async function loadJobFulfillmentFamily(internalJobId:string):Promise<{ok:true;familyKey:string|null;orders:string[]}|Failure>{
  const access=await getCurrentDoorGoAccess();if(getPermissionAccess(access,'calendar')!=='use'&&getPermissionAccess(access,'jobs')==='none')return fail('permission_required');const client=await createAuthenticatedSupabaseServerClient();
  const {data,error}=await client.from('dg_fulfillment_order_portions').select('family_key,sales_order').eq('linked_internal_job_id',internalJobId).is('deleted_at',null).order('sales_order');if(error)return fail('unavailable');return {ok:true,familyKey:data?.[0]?.family_key??null,orders:(data??[]).map((row)=>row.sales_order)};
}
