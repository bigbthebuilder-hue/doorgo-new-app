'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addDaysToDateOnly,
  formatFriendlyDateRange,
  isValidDateOnly,
  normalizeProductionWeekAnchor,
} from '@/lib/production-board/date-utils';

export function ProductionScheduleNavigation({
  anchorMonday,
  currentMonday,
  visibleWeekdayEndExclusive,
}: {
  anchorMonday: string;
  currentMonday: string;
  visibleWeekdayEndExclusive: string;
}) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(anchorMonday);
  const [pending, startTransition] = useTransition();

  const navigate = (monday: string) => {
    startTransition(() => {
      router.push(`/production-schedule?week=${encodeURIComponent(monday)}`);
    });
  };

  return (
    <section
      aria-label="Production Schedule date window"
      className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Visible workweeks
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {formatFriendlyDateRange(anchorMonday, visibleWeekdayEndExclusive)}
          </p>
          {pending ? <p className="mt-1 text-xs text-sky-700" role="status">Loading schedule…</p> : null}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="grid grid-cols-3 gap-2">
            <NavigationButton
              label="Previous week"
              disabled={pending}
              onClick={() => navigate(addDaysToDateOnly(anchorMonday, -7))}
            />
            <NavigationButton
              label="Today"
              disabled={pending || anchorMonday === currentMonday}
              current={anchorMonday === currentMonday}
              onClick={() => navigate(currentMonday)}
            />
            <NavigationButton
              label="Next week"
              disabled={pending}
              onClick={() => navigate(addDaysToDateOnly(anchorMonday, 7))}
            />
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!isValidDateOnly(selectedDate)) return;
              navigate(normalizeProductionWeekAnchor(selectedDate, currentMonday));
            }}
          >
            <label className="block text-xs font-semibold text-slate-700" htmlFor="production-schedule-go-to-date">
              Go to date
              <input
                id="production-schedule-go-to-date"
                type="date"
                required
                value={selectedDate}
                disabled={pending}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="mt-1 block min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base font-normal text-slate-900"
              />
            </label>
            <button
              type="submit"
              disabled={pending || !isValidDateOnly(selectedDate)}
              className="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Go
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

function NavigationButton({
  label,
  disabled,
  current = false,
  onClick,
}: {
  label: string;
  disabled: boolean;
  current?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-current={current ? 'date' : undefined}
      onClick={onClick}
      className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-default disabled:bg-sky-50 disabled:text-sky-800"
    >
      {label}
    </button>
  );
}
