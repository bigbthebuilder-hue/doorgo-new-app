import assert from 'node:assert/strict';
import {calendarJobEligible,calendarJobMatches,findCalendarJobOptions,jobHeaderForFulfillment} from './calendar-job-linking';
import type {NativeJobAggregate,NativeJobListItem,NativeJobListRequest} from '../jobs/job-intake-types';
const summary={internalJobId:'1',doorGoReference:'DG-000123',bizTrackSalesOrder:'4567',visibleIdentifier:'4567',visibleIdentifierKind:'biztrack_sales_order',legacyJobId:null,customer:'Hamilton',siteAddress:null,lifecycleStage:'Draft',createdAt:'x',updatedAt:'x',revision:1,activeLineCount:1,archivedLineCount:0,archivedAt:null} as NativeJobListItem;
assert.equal(calendarJobMatches(summary,'Hamilton'),true);assert.equal(calendarJobMatches(summary,'4567'),true);assert.equal(calendarJobMatches(summary,'DG-000123'),true);
assert.equal(calendarJobEligible('Delivery','delivery'),true);assert.equal(calendarJobEligible(null,'delivery'),true);assert.equal(calendarJobEligible('Customer Pickup','delivery'),false);
assert.equal(calendarJobEligible('Customer Pickup','customer_pickup'),true);assert.equal(calendarJobEligible(null,'customer_pickup'),true);assert.equal(calendarJobEligible('Delivery','customer_pickup'),false);
assert.equal(calendarJobEligible('Delivery','production'),true);assert.equal(calendarJobEligible('Customer Pickup','note'),true);
const aggregate={...summary,phone:null,email:null,salesperson:'Alex',notes:null,hingeColor:null,shopHours:null,shopHoursSource:null,poNumbers:[],fulfillmentPlan:null,deliveryDate:null,customerPickupDate:null,shopDate:null,shopDateSource:null,createdByUserId:'u',updatedByUserId:'u',lines:[]} as NativeJobAggregate;
const delivery=jobHeaderForFulfillment(aggregate,'Delivery');assert.equal(delivery.fulfillmentPlan,'Delivery');assert.equal(delivery.deliveryDate,null);assert.equal(delivery.customerPickupDate,null);
const pickup=jobHeaderForFulfillment(aggregate,'Customer Pickup');assert.equal(pickup.fulfillmentPlan,'Customer Pickup');assert.equal(pickup.deliveryDate,null);assert.equal(pickup.customerPickupDate,null);
const scheduledDelivery=jobHeaderForFulfillment(aggregate,'Delivery','2026-12-21');assert.equal(scheduledDelivery.deliveryDate,'2026-12-21');assert.equal(scheduledDelivery.customerPickupDate,null);
const scheduledPickup=jobHeaderForFulfillment(aggregate,'Customer Pickup','2026-09-21');assert.equal(scheduledPickup.customerPickupDate,'2026-09-21');assert.equal(scheduledPickup.deliveryDate,null);
const cursor={updatedAt:'2026-08-20T00:00:00.000Z',internalJobId:'cursor'};let pages=0;
const later={...summary,internalJobId:'2',customer:'Far Away Job',bizTrackSalesOrder:'9876',visibleIdentifier:'9876'};
let testedPlan:'Customer Pickup'|null='Customer Pickup';
void (async()=>{const repository={
  async listPage(request:NativeJobListRequest={}){pages+=1;return request.cursor?{items:[later],page:{limit:100,hasMore:false,nextCursor:null}}:{items:[summary],page:{limit:100,hasMore:true,nextCursor:cursor}};},
  async findById(id:string){return id==='2'?{...aggregate,...later,fulfillmentPlan:testedPlan}:aggregate;},
};
assert.deepEqual(await findCalendarJobOptions(repository,'9876','delivery'),[],'an explicitly Pickup job is excluded from Delivery even on a later page');
assert.equal(pages,2,'authoritative search follows every repository page');
testedPlan=null;pages=0;const options=await findCalendarJobOptions(repository,'DG-000123','delivery');assert.equal(options[0].internalJobId,'1');assert.equal(options[0].fulfillmentPlan,null);
console.log('Calendar native-job linking tests passed');})().catch((error)=>{console.error(error);process.exitCode=1;});
