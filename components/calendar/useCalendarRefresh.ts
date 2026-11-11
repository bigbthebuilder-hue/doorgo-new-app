'use client';
import { useEffect, useRef, useState } from 'react';
import type { ProductionBoardViewModel } from '@/lib/production-board/types';
import { addDaysToDateOnly } from '@/lib/production-board/date-utils';

type Status = {state:'checking'|'current'|'paused'|'offline'|'retrying'; label:string; checkedAt:number|null};
type Props = {board:ProductionBoardViewModel; monday:string; endMonday:string; today:string; blocked:boolean; onBoard:(board:ProductionBoardViewModel,baseline:ProductionBoardViewModel)=>void};
export function useCalendarRefresh({board,monday,endMonday,today,blocked,onBoard}:Props) {
  const [status,setStatus] = useState<Status>({state:'checking',label:'Checking for updates…',checkedAt:null});
  const latest = useRef({board,onBoard});
  useEffect(()=>{latest.current={board,onBoard};},[board,onBoard]);
  useEffect(()=>{
    let disposed=false;
    let controller:AbortController|null=null;
    let timer:ReturnType<typeof setTimeout>|undefined;
    let failures=0;
    const update=(state:Status['state'],label:string,checkedAt?:number)=>setStatus(previous=>({...previous,state,label,...(checkedAt===undefined?{}:{checkedAt})}));
    const schedule=(delay:number)=>{clearTimeout(timer);timer=setTimeout(()=>void refresh(),delay);};
    const refresh=async()=>{
      if(disposed||controller)return;
      if(!navigator.onLine){update('offline','Offline · reconnecting');schedule(10000);return;}
      if(blocked||document.hidden||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){update('paused','Updates paused while busy');schedule(1000);return;}
      controller=new AbortController();
      const activeController=controller;
      const timeout=setTimeout(()=>activeController.abort(),15000);
      const baseline=latest.current.board;
      // Refresh only the visible neighbourhood; do not repeatedly read years of cached dates.
      const start=monday<baseline.startDate?baseline.startDate:monday;
      const end=[addDaysToDateOnly(start,112),endMonday>start?endMonday:addDaysToDateOnly(start,7),baseline.endDateExclusive].sort()[0];
      update('checking','Checking for updates…');
      try {
        const response=await fetch('/api/calendar/window?'+new URLSearchParams({start,end}),{cache:'no-store',signal:activeController.signal});
        if(!response.ok)throw Error('Refresh unavailable');
        const data=await response.json() as {board:ProductionBoardViewModel};
        if(disposed)return;
        if(!data.board||!Array.isArray(data.board.days)||!Array.isArray(data.board.weekGroups)||!Array.isArray(data.board.needsAttentionCards))throw Error('Invalid Calendar response');
        // A local mutation or range load won the race; fetch again, never overwrite it.
        if(latest.current.board!==baseline||document.hidden||document.activeElement?.matches('input,textarea,select,[contenteditable="true"]')){schedule(1000);return;}
        latest.current.onBoard(data.board,baseline);
        failures=0;
        update('current','Up to date',Date.now());
        schedule(10000);
      } catch {
        if(!disposed){failures++;update(navigator.onLine?'retrying':'offline',navigator.onLine?'Updates delayed · retrying':'Offline · reconnecting');schedule(Math.min(30000,10000*failures));}
      } finally {clearTimeout(timeout);if(controller===activeController)controller=null;}
    };
    const wake=()=>{if(!disposed)schedule(0);};
    const offline=()=>{controller?.abort();update('offline','Offline · reconnecting');};
    window.addEventListener('focus',wake);window.addEventListener('online',wake);window.addEventListener('offline',offline);
    document.addEventListener('visibilitychange',wake);window.addEventListener('doorgo:calendar-refresh',wake);
    schedule(0);
    return ()=>{disposed=true;clearTimeout(timer);controller?.abort();window.removeEventListener('focus',wake);window.removeEventListener('online',wake);window.removeEventListener('offline',offline);document.removeEventListener('visibilitychange',wake);window.removeEventListener('doorgo:calendar-refresh',wake);};
  },[monday,endMonday,today,blocked]);
  return status;
}
