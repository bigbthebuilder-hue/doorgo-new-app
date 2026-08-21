import {addDaysToDateOnly,isValidDateOnly} from '../production-board/date-utils';

export type DateOnlyVisualState='none'|'today'|'selected'|'today-selected';
export function dateOnlyVisualState(date:string,today:string,selected:string):DateOnlyVisualState{
  const isToday=date===today;const isSelected=date===selected;
  return isToday&&isSelected?'today-selected':isToday?'today':isSelected?'selected':'none';
}
export function monthCalendarDates(month:string):string[]{
  const first=`${month}-01`;if(!isValidDateOnly(first))return [];
  const offset=new Date(`${first}T00:00:00Z`).getUTCDay();const start=addDaysToDateOnly(first,-offset);
  return Array.from({length:42},(_,index)=>addDaysToDateOnly(start,index));
}
export function shiftDateOnlyMonth(month:string,offset:number):string{
  const [year,value]=month.split('-').map(Number);const date=new Date(Date.UTC(year,value-1+offset,1));return `${date.getUTCFullYear()}-${String(date.getUTCMonth()+1).padStart(2,'0')}`;
}
