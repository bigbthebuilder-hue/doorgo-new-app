import { useLayoutEffect, useRef, useState } from 'react';
import { useCalendarViewport } from '../../components/calendar/useCalendarViewport';
import { addDaysToDateOnly } from '../../lib/production-board/date-utils';

function View({owner,delay=false,onLeave}:{owner:string;delay?:boolean;onLeave:()=>void}) {
  const stream=useRef<HTMLElement>(null);const viewport=useCalendarViewport(stream,owner);
  const [expanded,setExpanded]=useState(false);const [prefix,setPrefix]=useState(false);
  const pending=useRef<(()=>void)|null>(null);
  useLayoutEffect(()=>{
    const token=viewport.prepare();const target=viewport.read()??{week:'2026-11-23',offset:0};
    if(delay)pending.current=()=>viewport.jump(target,token);else viewport.place(target,token);
    // Fixture initialization intentionally mirrors the production mount lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return <><button onClick={onLeave}>Open Job / Leave Calendar</button><button onClick={()=>pending.current?.()}>Finish delayed initialization</button><button onClick={()=>setExpanded(value=>!value)}>Remote week-height change</button><button onClick={()=>setPrefix(true)}>Complete delayed prepend</button><button onClick={()=>{const token=viewport.prepare();viewport.jump({week:'2026-11-23',offset:0},token);}}>Today</button>
    <main ref={stream} className="calendar-stream" style={{height:500,overflow:'auto'}} tabIndex={0}>
      {Array.from({length:prefix?33:32},(_,index)=>{const date=addDaysToDateOnly('2026-09-28',(index-(prefix?1:0))*7);return <section data-calendar-week={date} key={date} style={{height:date==='2026-10-05'&&expanded?800:180,borderBottom:'1px solid'}}>{date}</section>;})}
    </main></>;
}
export function CalendarViewportHarness({owner='viewport-a',delay=false}:{owner?:string;delay?:boolean}) {
  const [shown,setShown]=useState(true);return shown?<View owner={owner} delay={delay} onLeave={()=>setShown(false)}/>:<><p>Job or document fixture</p><button onClick={()=>setShown(true)}>Go to Calendar</button></>;
}

// Real Calendar mount/return lifecycle, with fictional Calendar records and existing RPC shims.
import { CalendarStabilityHarness } from './CalendarStabilityHarness';
export function CalendarViewportReturnHarness() {
  const [shown,setShown]=useState(true);
  return <><button onClick={()=>setShown(value=>!value)}>{shown?'Leave real Calendar':'Return real Calendar'}</button>{shown?<CalendarStabilityHarness extraWeeks={4}/>:<p>Job / work order route fixture</p>}</>;
}
