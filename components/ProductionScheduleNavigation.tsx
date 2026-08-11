'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { addDaysToDateOnly, isValidDateOnly, normalizeProductionWeekAnchor } from '@/lib/production-board/date-utils';

export function ProductionScheduleNavigation({
  anchorMonday,
  currentMonday,
  pathname = '/production-schedule',
  label = 'Production Schedule date window',
}: {
  anchorMonday: string;
  currentMonday: string;
  visibleWeekdayEndExclusive: string;
  pathname?: '/production-board' | '/production-schedule';
  label?: string;
}) {
  const router = useRouter();
  return <ProductionWindowNavigation anchorMonday={anchorMonday} currentMonday={currentMonday} label={label} onNavigate={(href) => router.push(href)} pathname={pathname}/>;
}

export function ProductionWindowNavigation({ anchorMonday, currentMonday, pathname, label, onNavigate }: {
  anchorMonday: string;
  currentMonday: string;
  pathname: '/production-board' | '/production-schedule';
  label: string;
  onNavigate: (href: string) => void;
}) {
  const [selectedDate, setSelectedDate] = useState(anchorMonday);
  const [pending, startTransition] = useTransition();
  const navigate = (monday: string) => startTransition(() => onNavigate(`${pathname}?week=${encodeURIComponent(monday)}`));
  const inputId = pathname === '/production-board' ? 'production-board-go-to-date' : 'production-schedule-go-to-date';

  return <div aria-label={label} className="flex items-end gap-1">
    <NavigationButton label="Previous week" disabled={pending} onClick={() => navigate(addDaysToDateOnly(anchorMonday, -7))}/>
    <NavigationButton label="Today" disabled={pending || anchorMonday === currentMonday} current={anchorMonday === currentMonday} onClick={() => navigate(currentMonday)}/>
    <NavigationButton label="Next week" disabled={pending} onClick={() => navigate(addDaysToDateOnly(anchorMonday, 7))}/>
    <form className="flex items-end gap-1" onSubmit={(event) => { event.preventDefault(); if (isValidDateOnly(selectedDate)) navigate(normalizeProductionWeekAnchor(selectedDate, currentMonday)); }}>
      <label className="sr-only" htmlFor={inputId}>Go to date</label>
      <input className="h-8 rounded-md border border-slate-300 bg-white px-1.5 text-xs font-normal text-slate-900" disabled={pending} id={inputId} onChange={(event) => setSelectedDate(event.target.value)} required type="date" value={selectedDate}/>
      <button className="h-8 rounded-md bg-sky-700 px-2 text-xs font-semibold text-white disabled:bg-slate-300" disabled={pending || !isValidDateOnly(selectedDate)} type="submit">Go</button>
    </form>
    {pending ? <span className="sr-only" role="status">Loading schedule…</span> : null}
  </div>;
}

function NavigationButton({ label, disabled, current = false, onClick }: { label: string; disabled: boolean; current?: boolean; onClick: () => void }) {
  return <button aria-current={current ? 'date' : undefined} className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 disabled:bg-sky-50 disabled:text-sky-800" disabled={disabled} onClick={onClick} type="button">{label}</button>;
}
