import type { ProductionBoardCard, ProductionBoardViewModel } from '../production-board/types';

export type CalendarItemRow = {
  item_id:string; item_type:'delivery'|'customer_pickup'|'note'; scheduled_date:string|null;
  linked_internal_job_id:string|null; customer_name:string; sales_order:string|null; salesperson:string|null;
  timing:string|null; fulfillment_note:string|null; title:string|null; details:string|null; day_order:number|string;
  completed_at:string|null; revision:number|string; order_family_key:string|null; current_portion_id?:string|null;
};

export function calendarItemCard(row:CalendarItemRow, linked?:{internalJobId:string;customer:string|null;salesOrder:string|null;salesperson:string|null},orders:{included:string[];available:string[];send?:string[]}={included:[],available:[]}):ProductionBoardCard {
  const customer=linked?.customer?.trim()||row.customer_name;
  const salesOrder=row.sales_order?.trim()||linked?.salesOrder?.trim()||null;
  return {bookingId:`item:${row.item_id}`,recordKind:'calendar_item',calendarItemType:row.item_type,revision:Number(row.revision),type:linked?'doorgo_linked':'biztrack_only',
    typeLabel:linked?'DoorGo-linked':'BizTrack-only',productionDate:row.scheduled_date,dayOrder:Number(row.day_order),title:row.title?.trim()||customer,
    customer,jobId:salesOrder,internalJobId:linked?.internalJobId,nativeSalesOrder:salesOrder,primarySalesOrder:linked?.salesOrder?.trim()||null,currentPortionId:row.current_portion_id,calendarId:null,calendarEventId:null,shopHours:null,
    shopHoursKnown:true,salesperson:linked?.salesperson?.trim()||row.salesperson,source:'DoorGo Calendar',sourceSystem:'doorgo_native',bookingKind:row.item_type,
    locked:false,completedAt:row.completed_at,timing:row.timing,fulfillmentNote:row.fulfillment_note,details:row.details,orderFamilyKey:row.order_family_key,
    includedOrders:orders.included,sendOrders:orders.send??orders.included,availableFamilyOrders:orders.available};
}

export function mergeCalendarItems(board:ProductionBoardViewModel,cards:ProductionBoardCard[]):ProductionBoardViewModel {
  const byDate=new Map<string,ProductionBoardCard[]>(); const needs:ProductionBoardCard[]=[];
  for(const card of cards){if(card.productionDate)byDate.set(card.productionDate,[...(byDate.get(card.productionDate)??[]),card]);else needs.push(card);}
  const mergeDays=(days:typeof board.days)=>days.map((day)=>({...day,cards:[...day.cards,...(byDate.get(day.date)??[])].sort(order)}));
  return {...board,days:mergeDays(board.days),weekGroups:board.weekGroups.map((week)=>({...week,days:mergeDays(week.days)})),
    needsAttentionCards:[...board.needsAttentionCards,...needs].sort(order)};
}
export function replaceCalendarCardLocally(board:ProductionBoardViewModel,card:ProductionBoardCard):ProductionBoardViewModel{
  const update=(cards:ProductionBoardCard[])=>cards.map((current)=>current.bookingId===card.bookingId?card:current);
  return {...board,days:board.days.map((day)=>({...day,cards:update(day.cards)})),weekGroups:board.weekGroups.map((week)=>({...week,days:week.days.map((day)=>({...day,cards:update(day.cards)}))})),needsAttentionCards:update(board.needsAttentionCards)};
}
export function removeCalendarCardLocally(board:ProductionBoardViewModel,bookingId:string):ProductionBoardViewModel{
  const remove=(cards:ProductionBoardCard[])=>cards.filter((card)=>card.bookingId!==bookingId);
  return {...board,days:board.days.map((day)=>({...day,cards:remove(day.cards)})),weekGroups:board.weekGroups.map((week)=>({...week,days:week.days.map((day)=>({...day,cards:remove(day.cards)}))})),needsAttentionCards:remove(board.needsAttentionCards)};
}
const order=(a:ProductionBoardCard,b:ProductionBoardCard)=>(a.dayOrder??0)-(b.dayOrder??0)||a.bookingId.localeCompare(b.bookingId);

export function calendarRecordKey(card:ProductionBoardCard):string {
  return card.recordKind==='calendar_item'?card.bookingId:`production:${card.bookingId}`;
}

export function calendarItemLayerKey(card:ProductionBoardCard):string {
  if(card.calendarItemType==='delivery')return 'fulfillment:delivery';
  if(card.calendarItemType==='customer_pickup')return 'fulfillment:pickup';
  if(card.calendarItemType==='note')return 'other:notes';
  return `production:${card.salesperson?.trim().toLocaleLowerCase()||'unassigned'}`;
}
