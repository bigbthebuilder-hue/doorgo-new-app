import { NextRequest, NextResponse } from 'next/server';
import { loadCalendarWindow } from '@/lib/production-bookings/calendar-production-actions';
import { addDaysToDateOnly, getCurrentDateInTimeZone, getMondayForDate } from '@/lib/production-board/date-utils';
import { calendarOperationalBounds } from '@/lib/calendar/continuous-range';

export const dynamic='force-dynamic';
export async function GET(request:NextRequest) {
  const start=request.nextUrl.searchParams.get('start')??'';
  const end=request.nextUrl.searchParams.get('end')??'';
  const today=getCurrentDateInTimeZone('America/Vancouver');
  const bounds=calendarOperationalBounds(today);
  const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  const headers={'Cache-Control':'private, no-store'};
  if(!validDate(start)||!validDate(end)||start<bounds.minimumMonday||end>bounds.maximumEndExclusive||getMondayForDate(start)!==start||end<=start||end>addDaysToDateOnly(start,112)||getMondayForDate(end)!==end) return NextResponse.json({error:'Invalid Calendar window'},{status:400,headers});
  // Reuse existing authenticated Calendar View/Use read gates and projections.
  const result=await loadCalendarWindow({boardStart:start,boardEndExclusive:end,weeks:Math.round((Date.parse(end)-Date.parse(start))/604800000),today});
  return NextResponse.json(result.ok?{board:result.board}:{error:'Calendar refresh unavailable'},{status:result.ok?200:503,headers});
}
