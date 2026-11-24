'use client';
import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { calendarViewportKey, parseCalendarViewport, viewportOffset, type CalendarViewport } from '@/lib/calendar/viewport';

export function useCalendarViewport(streamRef: RefObject<HTMLElement | null>, owner: string) {
  const anchor = useRef<CalendarViewport | null>(null);
  const lastTop = useRef(0);
  const lastHistoryWrite = useRef(0);
  const generation = useRef(0);
  const ready = useRef(false);
  const pendingNavigation = useRef(false);
  const pendingRestore = useRef<{ value: CalendarViewport; token: number } | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const key = calendarViewportKey(owner);
  const capture = useCallback(() => {
    const stream = streamRef.current;
    if (!stream || !stream.clientHeight) return null;
    const top = stream.getBoundingClientRect().top;
    const week = [...stream.querySelectorAll<HTMLElement>('[data-calendar-week]')].find(node => node.getBoundingClientRect().bottom > top + 8);
    if (!week?.dataset.calendarWeek) return null;
    lastTop.current = stream.scrollTop;
    return { week: week.dataset.calendarWeek, offset: Math.round((week.getBoundingClientRect().top - top)*100)/100 };
  }, [streamRef]);
  const save = useCallback((force = false) => {
    if (!ready.current) return;
    const value = capture(); if (!value) return;
    anchor.current = value;
    if (pendingNavigation.current) return;
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* In-memory anchoring remains available. */ }
    if (location.pathname === '/calendar') {
      if (!force && performance.now()-lastHistoryWrite.current<250) return;
      // Preserve Next's router state; keep each history entry's anchor separate.
      const previous = history.state?.doorGoCalendarViewport;
      const url = new URL(location.href);
      if (previous?.owner === owner && previous.value?.week === value.week && Math.abs(previous.value.offset-value.offset)<0.25 && url.searchParams.get('week') === value.week) return;
      const state = { ...history.state, doorGoCalendarViewport: { owner, value } };
      url.searchParams.set('week', value.week);
      try { history.replaceState(state, '', url); lastHistoryWrite.current=performance.now(); } catch { /* Device-local state remains available if History is unavailable. */ }
    }
  }, [capture,key,owner]);
  const restore = useCallback((value: CalendarViewport) => {
    const stream = streamRef.current;
    const week = stream?.querySelector<HTMLElement>(`[data-calendar-week="${value.week}"]`);
    if (!stream || !week) return false;
    const offset = viewportOffset(value.offset, week.getBoundingClientRect().height);
    stream.scrollTop += week.getBoundingClientRect().top - stream.getBoundingClientRect().top - offset;
    lastTop.current = stream.scrollTop;
    anchor.current = { ...value, offset };
    return true;
  },[streamRef]);
  const preserve = useCallback(() => {
    if (!ready.current) return;
    const stream = streamRef.current;
    // A scroll may precede its event. Never replay an older position over it.
    if (stream && Math.abs(stream.scrollTop-lastTop.current)>1) { save(); return; }
    if (anchor.current) restore(anchor.current);
    save();
  },[restore,save,streamRef]);
  const begin = useCallback(() => ++generation.current, []);
  const prepare = useCallback(() => { pendingNavigation.current = true; return ++generation.current; }, []);
  const current = useCallback((token: number) => token === generation.current, []);
  const read = useCallback((): CalendarViewport | null => {
    const explicit = new URL(location.href).searchParams.get('week');
    const historyValue = history.state?.doorGoCalendarViewport;
    const entry = historyValue?.owner === owner ? parseCalendarViewport(historyValue.value) : null;
    let stored: CalendarViewport | null = null;
    try { stored = parseCalendarViewport(JSON.parse(localStorage.getItem(key) ?? 'null')); } catch { /* Ignore unavailable or invalid preferences. */ }
    if (explicit) {
      if(stored?.week===explicit)return stored;
      if(entry?.week===explicit)return entry;
      return parseCalendarViewport({week:explicit,offset:0});
    }
    return stored ?? entry;
  },[key,owner]);
  const place = useCallback((value: CalendarViewport, token: number) => {
    if (!current(token) || !restore(value)) return false;
    pendingNavigation.current = false; ready.current = true; save(true); return true;
  },[current,restore,save]);
  const jump = useCallback((value: CalendarViewport, token: number) => {
    pendingRestore.current = { value, token };
    const frame = requestAnimationFrame(() => {
      if (pendingRestore.current?.token !== token || !current(token)) return;
      if (place(value,token)) pendingRestore.current = null;
    });
    return () => { cancelAnimationFrame(frame); if(pendingRestore.current?.token===token)pendingRestore.current=null; };
  },[current,place]);

  // Every committed board/layer/mutation update uses the same live date anchor.
  useLayoutEffect(() => {
    const pending = pendingRestore.current;
    if (pending && (!current(pending.token) || place(pending.value,pending.token))) pendingRestore.current = null;
    for (const week of streamRef.current?.querySelectorAll('[data-calendar-week]') ?? []) observerRef.current?.observe(week);
    preserve();
  });
  useLayoutEffect(() => {
    const stream = streamRef.current; if (!stream) return;
    const intent = (event: Event) => {
      if (event instanceof KeyboardEvent && (!['ArrowUp','ArrowDown','PageUp','PageDown','Home','End',' '].includes(event.key) || (event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"]'))) return;
      begin(); pendingNavigation.current = false; ready.current = true; save();
    };
    const scroll = () => {
      if (ready.current && Math.abs(stream.scrollTop-lastTop.current)>1) { begin(); pendingNavigation.current=false; }
      save();
    };
    const leaving = () => save(true);
    let resizeFrame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(resizeFrame);
      const token = generation.current;
      resizeFrame = requestAnimationFrame(() => { if (current(token)) preserve(); });
    });
    observerRef.current = observer;
    observer.observe(stream);
    for (const week of stream.querySelectorAll('[data-calendar-week]')) observer.observe(week);
    stream.addEventListener('scroll',scroll,{passive:true});
    stream.addEventListener('scrollend',leaving);
    stream.addEventListener('wheel',intent,{passive:true}); stream.addEventListener('touchstart',intent,{passive:true});
    stream.addEventListener('pointerdown',intent); document.addEventListener('keydown',intent);
    document.addEventListener('click',leaving,true); window.addEventListener('pagehide',leaving);
    return () => {
      save(true); begin(); pendingRestore.current = null; observerRef.current = null; observer.disconnect(); cancelAnimationFrame(resizeFrame);
      stream.removeEventListener('scrollend',leaving);
      stream.removeEventListener('scroll',scroll); stream.removeEventListener('wheel',intent); stream.removeEventListener('touchstart',intent);
      stream.removeEventListener('pointerdown',intent); document.removeEventListener('keydown',intent);
      document.removeEventListener('click',leaving,true); window.removeEventListener('pagehide',leaving);
    };
  },[begin,current,preserve,save,streamRef]);
  const finish = useCallback(() => { pendingNavigation.current = false; ready.current = true; save(true); },[save]);
  return { begin, prepare, current, read, jump, place, save, ready, finish };
}
