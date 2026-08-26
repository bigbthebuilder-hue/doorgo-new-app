import type{CapacityRole,CapacityStaff}from'./capacity-configuration';
export type ClosureRecord={closureId:string;startDate:string;endDate:string;title:string;details:string|null;revision:number};
export type SpecialDayStaff={staffId:string;displayName:string;scheduledHours:number;productiveHours:number;capacityRole?:CapacityRole};
export type SpecialDayRecord={specialDayId:string;date:string;title:string;details:string|null;calculatedCapacity:number;revision:number;staff:SpecialDayStaff[]};
export type HolidayCandidate={holidayKey:string;name:string;date:string;enabled:boolean};
export type CapacityOverrideRecord={date:string;calculatedCapacity:number|null;overrideCapacity:number;reason:string|null;revision:number};
export type ManagerCapacityExceptions={regionCode:string;year:number;closures:ClosureRecord[];specialDays:SpecialDayRecord[];holidays:HolidayCandidate[];overrides:CapacityOverrideRecord[]};
export function configuredStaffForDate(staff:CapacityStaff[],date:string,includeInactiveIds:string[]=[]):SpecialDayStaff[]{const weekday=new Date(`${date}T00:00:00Z`).getUTCDay();const included=new Set(includeInactiveIds);return staff.filter((item)=>item.active||included.has(item.staffId)).map((item)=>{const version=item.versions.find((entry)=>entry.effectiveFrom<=date);const day=version?.weekdays.find((entry)=>entry.weekday===weekday);return{staffId:item.staffId,displayName:item.displayName,scheduledHours:day?.scheduledHours??0,productiveHours:version?.capacityRole==='direct_production'?day?.capacityHours??0:0,capacityRole:version?.capacityRole};});}
export function exceptionalCapacity(staff:Array<Pick<SpecialDayStaff,'productiveHours'>>):number{return staff.reduce((sum,item)=>sum+item.productiveHours,0);}
