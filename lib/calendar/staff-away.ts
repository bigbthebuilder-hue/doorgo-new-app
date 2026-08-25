import type {ProductionBoardCard,ProductionBoardViewModel,StaffAwayRosterOption} from '../production-board/types';

export type StaffAwayOccurrence={date:string;deductionHours:number|string};
export type StaffAwayPeriod={
  periodId:string;staffId:string;staffName:string;startDate:string;endDate:string;mode:'full_day'|'partial';
  partialDragHours:number|string|null;reason:string|null;revision:number|string;createdAt:string;updatedAt:string;occurrences:StaffAwayOccurrence[];
};
export type StaffAwayRangePayload={activeStaff:StaffAwayRosterOption[];periods:StaffAwayPeriod[]};

export function staffAwayCard(period:StaffAwayPeriod,occurrence:StaffAwayOccurrence):ProductionBoardCard{
  return {bookingId:`away:${period.periodId}:${occurrence.date}`,recordKind:'staff_away',calendarItemType:'staff_away',revision:Number(period.revision),
    type:'biztrack_only',typeLabel:'BizTrack-only',productionDate:occurrence.date,dayOrder:Number.MIN_SAFE_INTEGER,title:period.staffName,customer:period.staffName,
    jobId:null,calendarId:null,calendarEventId:null,shopHours:null,shopHoursKnown:true,salesperson:null,source:'DoorGo Staff Away',sourceSystem:'doorgo_native',
    bookingKind:'staff_away',locked:true,completedAt:null,updatedAt:period.updatedAt,details:period.reason,staffAwayPeriodId:period.periodId,staffId:period.staffId,
    staffAwayStartDate:period.startDate,staffAwayEndDate:period.endDate,staffAwayMode:period.mode,partialDragHours:period.partialDragHours===null?null:Number(period.partialDragHours)};
}

export function mergeStaffAway(board:ProductionBoardViewModel,payload:StaffAwayRangePayload):ProductionBoardViewModel{
  const cards=payload.periods.flatMap((period)=>period.occurrences.map((occurrence)=>staffAwayCard(period,occurrence)));
  const byDate=new Map<string,ProductionBoardCard[]>();
  for(const card of cards)byDate.set(card.productionDate!,[...(byDate.get(card.productionDate!)??[]),card]);
  const mergeDays=(days:typeof board.days)=>days.map((day)=>({...day,cards:calendarCardOrder([...day.cards,...(byDate.get(day.date)??[])])}));
  return {...board,days:mergeDays(board.days),weekGroups:board.weekGroups.map((week)=>({...week,days:mergeDays(week.days)})),staffAwayRoster:payload.activeStaff};
}

export function calendarCardOrder(cards:ProductionBoardCard[]):ProductionBoardCard[]{
  return cards.sort((a,b)=>{
    if(a.recordKind==='staff_away'||b.recordKind==='staff_away'){
      if(a.recordKind!=='staff_away')return 1;if(b.recordKind!=='staff_away')return -1;
      return (a.customer??a.title).localeCompare(b.customer??b.title)||a.bookingId.localeCompare(b.bookingId);
    }
    return (a.dayOrder??0)-(b.dayOrder??0)||a.bookingId.localeCompare(b.bookingId);
  });
}

export function datesInRange(start:string,end:string):string[]{
  const values:string[]=[];for(let value=start;value<=end;){values.push(value);const date=new Date(`${value}T00:00:00Z`);date.setUTCDate(date.getUTCDate()+1);value=date.toISOString().slice(0,10);}return values;
}
