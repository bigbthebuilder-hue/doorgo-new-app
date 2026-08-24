import assert from 'node:assert/strict';
import {calendarItemCard,calendarItemLayerKey,calendarRecordKey,mergeCalendarItems,removeCalendarCardLocally,type CalendarItemRow} from './calendar-items';
import type {ProductionBoardViewModel} from '../production-board/types';

const row=(type:CalendarItemRow['item_type'],date:string|null):CalendarItemRow=>({item_id:'11111111-1111-4111-8111-111111111111',item_type:type,scheduled_date:date,linked_internal_job_id:null,order_family_key:'123455',customer_name:'Hamilton',sales_order:'123455',salesperson:'Alex',timing:'AM',fulfillment_note:'Call first',title:type==='note'?'Check measurements':null,details:null,day_order:2048,completed_at:null,revision:1});
const delivery=calendarItemCard(row('delivery',null));assert.equal(delivery.productionDate,null);assert.equal(delivery.shopHours,null);assert.equal(calendarItemLayerKey(delivery),'fulfillment:delivery');assert.equal(calendarRecordKey(delivery),'item:11111111-1111-4111-8111-111111111111');
const linked=calendarItemCard(row('customer_pickup','2026-08-24'),{internalJobId:'22222222-2222-4222-8222-222222222222',customer:'Authoritative',salesOrder:'999',salesperson:'Blair'});assert.equal(linked.customer,'Authoritative');assert.equal(linked.nativeSalesOrder,'999');assert.equal(linked.internalJobId,'22222222-2222-4222-8222-222222222222');
const day={date:'2026-08-24',cards:[],totalKnownShopHours:4,missingShopHoursCount:0} as unknown as ProductionBoardViewModel['days'][number];
const board={days:[day],needsAttentionCards:[],weekGroups:[{days:[day]}]} as unknown as ProductionBoardViewModel;
const unrelatedDelivery={...delivery,bookingId:'item:33333333-3333-4333-8333-333333333333'};const merged=mergeCalendarItems(board,[linked,unrelatedDelivery]);assert.equal(merged.days[0].cards.length,1);assert.equal(merged.needsAttentionCards.length,1);assert.equal(merged.days[0].totalKnownShopHours,4,'fulfillment has no Production capacity effect');
const removed=removeCalendarCardLocally(merged,linked.bookingId);assert.equal(removed.days[0].cards.length,0);assert.equal(removed.weekGroups[0].days[0].cards.length,0);assert.equal(removed.needsAttentionCards.length,1,'local delete preserves unrelated Needs Attention state');
console.log('Operational Calendar item tests passed');
