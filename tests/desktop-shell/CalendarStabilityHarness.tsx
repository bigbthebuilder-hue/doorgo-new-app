import { useState } from 'react';
import { CalendarWorkspace } from '@/components/CalendarWorkspace';
import { initialCalendarRange } from '@/lib/calendar/continuous-range';
import { normalizeProductionBoard } from '@/lib/production-board/normalize';

export function CalendarStabilityHarness({sessions=1,readOnly=false}:{sessions?:number;readOnly?:boolean}) {
  const [version,setVersion]=useState(0);
  const today='2026-11-11';
  const range=initialCalendarRange(today);
  const board=normalizeProductionBoard([{booking_id:'shared-booking',job_id:null,title:'Original shared job',production_date:'2026-11-10',shop_hours:2,salesperson:'Staff',calendar_id:null,calendar_event_id:null,status:'active',schedule_status:'confirmed',booking_kind:'production',board_visible:true,all_day:true,calendar_sync_state:'native',source:'DoorGo Calendar',source_system:'doorgo_native',locked:false,completed_at:null,updated_at:'2026-11-10T10:00:00Z'}],[],[],{...range,today});
  const card=board.days.flatMap(day=>day.cards)[0]; card.customer='Original shared job';
  return <><button onClick={()=>setVersion(value=>value+1)}>Simulate server render</button><output style={{display:'none'}} data-testid="board-fixture">{JSON.stringify(board)}</output>{Array.from({length:sessions},(_,index)=><div style={{height:'85vh'}} data-testid={'session-'+index} key={index}><CalendarWorkspace board={{...board,summary:{...board.summary},calculationStartDate:board.calculationStartDate+''}} canAddBackorders={false} canUseCalendar={!readOnly} canManageSettings={false} canOpenJobs={false} currentMonday="2026-11-09" initialTargetMonday="2026-11-09" preferenceOwner={'stability-'+index} defaultSalesperson={'Staff '+version} today={today}/></div>)}</>;
}
