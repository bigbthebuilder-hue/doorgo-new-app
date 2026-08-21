import type {JobIntakeRepository,NativeJobAggregate,NativeJobListItem,NativeJobListRequest} from '../jobs/job-intake-types';

export type CalendarLinkItemType='production'|'delivery'|'customer_pickup'|'note';
export type CalendarJobOption={internalJobId:string;customer:string;salesOrder:string;doorGoReference:string|null;salesperson:string|null;fulfillmentPlan:string|null;revision:number};

export function calendarJobMatches(job:NativeJobListItem,query:string):boolean{
  const value=query.trim().toLocaleLowerCase();if(!value)return false;
  return [job.customer,job.bizTrackSalesOrder,job.doorGoReference,job.visibleIdentifier].some((field)=>field?.toLocaleLowerCase().includes(value));
}
export function calendarJobEligible(plan:string|null|undefined,itemType:CalendarLinkItemType):boolean{
  if(itemType==='production'||itemType==='note')return true;
  const normalized=plan?.trim()||null;
  return normalized===null||(itemType==='delivery'?normalized==='Delivery':normalized==='Customer Pickup');
}
export function calendarJobOption(job:NativeJobAggregate):CalendarJobOption{
  return {internalJobId:job.internalJobId,customer:job.customer?.trim()||'',salesOrder:job.bizTrackSalesOrder?.trim()||job.visibleIdentifier?.trim()||'',
    doorGoReference:job.doorGoReference?.trim()||null,salesperson:job.salesperson?.trim()||null,fulfillmentPlan:job.fulfillmentPlan?.trim()||null,revision:job.revision};
}
export async function findCalendarJobOptions(repository:Pick<JobIntakeRepository,'listPage'|'findById'>,query:string,itemType:CalendarLinkItemType):Promise<CalendarJobOption[]>{
  const matches:NativeJobListItem[]=[];let cursor:NativeJobListRequest['cursor']=null;
  do{const page=await repository.listPage({limit:100,cursor});matches.push(...page.items.filter((job)=>calendarJobMatches(job,query)));cursor=page.page.nextCursor;}while(cursor);
  const aggregates=await Promise.all(matches.map((job)=>repository.findById(job.internalJobId)));
  return aggregates.filter((job):job is NativeJobAggregate=>job!==null).filter((job)=>calendarJobEligible(job.fulfillmentPlan,itemType)).map(calendarJobOption).slice(0,20);
}
export function jobHeaderForFulfillment(job:NativeJobAggregate,fulfillmentPlan:'Delivery'|'Customer Pickup',scheduledDate:string|null=fulfillmentPlan==='Delivery'?job.deliveryDate:job.customerPickupDate){
  return {bizTrackSalesOrder:job.bizTrackSalesOrder,customer:job.customer,siteAddress:job.siteAddress,phone:job.phone,email:job.email,salesperson:job.salesperson,
    notes:job.notes,hingeColor:job.hingeColor,shopHours:job.shopHours,shopHoursSource:job.shopHoursSource,poNumbers:job.poNumbers,fulfillmentPlan,
    deliveryDate:fulfillmentPlan==='Delivery'?scheduledDate:null,customerPickupDate:fulfillmentPlan==='Customer Pickup'?scheduledDate:null,shopDate:job.shopDate,shopDateSource:job.shopDateSource,lifecycleStage:job.lifecycleStage};
}
export function jobHeaderForShopDate(job:NativeJobAggregate,shopDate:string|null){return {...jobHeaderForFulfillment(job,job.fulfillmentPlan==='Customer Pickup'?'Customer Pickup':'Delivery'),fulfillmentPlan:job.fulfillmentPlan,deliveryDate:job.deliveryDate,customerPickupDate:job.customerPickupDate,shopDate,shopDateSource:shopDate?'Manual':null};}
