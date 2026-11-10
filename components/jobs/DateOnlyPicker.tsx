'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCurrentDateInTimeZone } from '@/lib/production-board/date-utils';
import { dateOnlyVisualState, monthCalendarDates, shiftDateOnlyMonth } from '@/lib/jobs/date-only-picker';
import { shopDateCapacityLabels, type ShopDateIndicators } from '@/lib/jobs/shop-date-capacity';

type DateOnlyPickerProps = {
  ariaLabel: string;
  className?: string;
  disabled: boolean;
  id: string;
  onChange: (value: string) => void;
  value: string;
  capacity?: {
    estimatedHours: number | null;
    internalJobId: string | null;
    loadAvailability: (month: string, internalJobId: string | null, estimatedHours: number | null) => Promise<ShopDateIndicators | null>;
  };
};

export function DateOnlyPicker({
  ariaLabel, className = '', disabled, id, onChange, value, capacity,
}: DateOnlyPickerProps) {
  const today = useMemo(() => getCurrentDateInTimeZone('America/Vancouver'), []);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || today).slice(0, 7));
  const [availability, setAvailability] = useState<{
    month: string;
    internalJobId: string | null;
    dates: ShopDateIndicators | null;
    estimatedHours: number | null;
  } | null>(null);
  const estimatedHours = capacity?.estimatedHours ?? null;
  const root = useRef<HTMLDivElement>(null);
  const loadAvailability = capacity?.loadAvailability;
  const internalJobId = capacity?.internalJobId ?? null;

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    return () => document.removeEventListener('pointerdown', close, true);
  }, [open]);

  useEffect(() => {
    if (!open || disabled || !loadAvailability) return;
    let cancelled = false;
    function receive(dates: ShopDateIndicators | null) {
      if (!cancelled) setAvailability({ month, internalJobId, dates, estimatedHours });
    }
    void loadAvailability(month, internalJobId, estimatedHours).then(receive, () => receive(null));
    return () => { cancelled = true; };
  }, [open, disabled, month, internalJobId, loadAvailability, estimatedHours]);

  function changeMonth(next: string) {
    if (next === month) return;
    setAvailability(null);
    setMonth(next);
  }

  function selectDate(date: string) {
    onChange(date);
    setOpen(false);
  }

  const dates = monthCalendarDates(month);
  const label = new Intl.DateTimeFormat('en-US', {
    month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${month}-01T00:00:00Z`));
  const currentAvailability = availability?.month === month && availability.internalJobId === internalJobId && availability.estimatedHours === estimatedHours
    ? availability : null;

  return (
    <div className={`job-date-only-picker ${className}`} ref={root}>
      <button aria-expanded={open} aria-haspopup="dialog" aria-label={ariaLabel} disabled={disabled}
        id={id} onClick={() => {
          if (!open) setAvailability(null);
          setMonth((value || today).slice(0, 7));
          setOpen(!open);
        }} type="button">{value || 'Select date'}</button>
      {open ? (
        <div aria-label={`${ariaLabel} calendar`} className={capacity ? "job-date-only-popover job-date-capacity-popover" : "job-date-only-popover"} role="dialog">
          <header>
            <button aria-label="Previous month" onClick={() => changeMonth(shiftDateOnlyMonth(month, -1))} type="button">‹</button>
            <strong>{label}</strong>
            <button aria-label="Next month" onClick={() => changeMonth(shiftDateOnlyMonth(month, 1))} type="button">›</button>
          </header>
          <div className="job-date-only-weekdays" aria-hidden="true">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}
          </div>
          <div className="job-date-only-grid">
            {dates.map((date) => {
              const status = capacity
                ? (currentAvailability?.dates?.[date] ?? 'unavailable')
                : undefined;
              return (
                <button aria-label={status ? `${date}, ${shopDateCapacityLabels[status]}` : undefined}
                  className={date.slice(0, 7) === month ? '' : 'outside'}
                  data-date-state={dateOnlyVisualState(date, today, value)} key={date}
                  onClick={() => selectDate(date)} type="button">
                  {Number(date.slice(8))}
                  {status ? <span aria-hidden="true" className="job-date-capacity-marker" data-capacity={status} /> : null}
                </button>
              );
            })}
          </div>
          {capacity ? (
            <div className="job-date-capacity-legend" aria-label="Advisory shop capacity">
              {Object.entries(shopDateCapacityLabels).map(([status, label]) => (
                <span key={status}><span aria-hidden="true" className="job-date-capacity-marker" data-capacity={status} />{label}</span>
              ))}
            </div>
          ) : null}
          <footer>
            <button onClick={() => selectDate('')} type="button">Clear</button>
            {month !== today.slice(0, 7) ? <button onClick={() => changeMonth(today.slice(0, 7))} type="button">Today</button> : null}
          </footer>
        </div>
      ) : null}
    </div>
  );
}
