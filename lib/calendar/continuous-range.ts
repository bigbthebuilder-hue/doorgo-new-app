import {addDaysToDateOnly,getMondayForDate} from '../production-board/date-utils';
import type {ProductionBoardViewModel} from '../production-board/types';

export const CALENDAR_INITIAL_PAST_WEEKS=4;
export const CALENDAR_INITIAL_FUTURE_WEEKS=8;
export const CALENDAR_RANGE_CHUNK_WEEKS=8;

export type CalendarOperationalBounds={minimumMonday:string;maximumEndExclusive:string};
export type CalendarLoadedRange={startDate:string;endDateExclusive:string};

export function addMonthsDateOnly(value:string,months:number):string{
  const [year,month,day]=value.split('-').map(Number);const targetMonth=month-1+months;const first=new Date(Date.UTC(year,targetMonth,1));const lastDay=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth()+1).padStart(2,'0')}-${String(Math.min(day,lastDay)).padStart(2,'0')}`;
}
export function calendarOperationalBounds(today:string):CalendarOperationalBounds{
  return {minimumMonday:getMondayForDate(addMonthsDateOnly(today,-12)),maximumEndExclusive:addDaysToDateOnly(getMondayForDate(addMonthsDateOnly(today,24)),7)};
}
export function initialCalendarRange(today:string):CalendarLoadedRange&{weeks:number}{
  const currentMonday=getMondayForDate(today);const startDate=addDaysToDateOnly(currentMonday,-CALENDAR_INITIAL_PAST_WEEKS*7);const weeks=CALENDAR_INITIAL_PAST_WEEKS+1+CALENDAR_INITIAL_FUTURE_WEEKS;
  return {startDate,endDateExclusive:addDaysToDateOnly(startDate,weeks*7),weeks};
}
export function nextCalendarChunk(range:CalendarLoadedRange,direction:'prepend'|'append',bounds:CalendarOperationalBounds,weeks=CALENDAR_RANGE_CHUNK_WEEKS):(CalendarLoadedRange&{weeks:number})|null{
  if(direction==='append'){if(range.endDateExclusive>=bounds.maximumEndExclusive)return null;const endDateExclusive=minDate(addDaysToDateOnly(range.endDateExclusive,weeks*7),bounds.maximumEndExclusive);return {startDate:range.endDateExclusive,endDateExclusive,weeks:weekCount(range.endDateExclusive,endDateExclusive)};}
  if(range.startDate<=bounds.minimumMonday)return null;const startDate=maxDate(addDaysToDateOnly(range.startDate,-weeks*7),bounds.minimumMonday);return {startDate,endDateExclusive:range.startDate,weeks:weekCount(startDate,range.startDate)};
}
export function dateWithinCalendarBounds(date:string,bounds:CalendarOperationalBounds):boolean{return date>=bounds.minimumMonday&&date<bounds.maximumEndExclusive;}
export function preservedPrependScrollTop(beforeTop:number,beforeHeight:number,afterHeight:number):number{return beforeTop+Math.max(0,afterHeight-beforeHeight);}
export function mergeContinuousCalendarBoards(current:ProductionBoardViewModel,incoming:ProductionBoardViewModel):ProductionBoardViewModel{
  const days=new Map([...current.days,...incoming.days].map((day)=>[day.date,day]));const weeks=new Map([...current.weekGroups,...incoming.weekGroups].map((week)=>[week.startDate,week]));
  const startDate=minDate(current.startDate,incoming.startDate);const endDateExclusive=maxDate(current.endDateExclusive,incoming.endDateExclusive);const orderedDays=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date));const orderedWeeks=[...weeks.values()].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map((week,index)=>({...week,weekIndex:index}));
  return {...current,startDate,endDateExclusive,visibleWeekdayEndExclusive:addDaysToDateOnly(endDateExclusive,-2),weeks:weekCount(startDate,endDateExclusive),days:orderedDays,weekGroups:orderedWeeks,needsAttentionCards:dedupeCards(incoming.needsAttentionCards),calculationStartDate:minDate(current.calculationStartDate,incoming.calculationStartDate)};
}
const dedupeCards=(cards:ProductionBoardViewModel['needsAttentionCards'])=>[...new Map(cards.map((card)=>[card.bookingId,card])).values()];
const minDate=(a:string,b:string)=>a<b?a:b;const maxDate=(a:string,b:string)=>a>b?a:b;
function weekCount(start:string,end:string):number{return Math.round((Date.parse(`${end}T00:00:00Z`)-Date.parse(`${start}T00:00:00Z`))/(7*86400000));}
