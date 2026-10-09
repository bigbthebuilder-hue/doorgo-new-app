'use client';

import { createContext, useCallback, useContext, useEffect, useId, useState, type ReactNode } from 'react';

const ActivityContext = createContext<((id: string, label: string | null) => void) | null>(null);

// Presentation only: callers supply their existing pending state.
export function useCalendarActivity(label: string | null) {
  const report = useContext(ActivityContext);
  const id = useId();
  useEffect(() => {
    report?.(id, label);
    return () => report?.(id, null);
  }, [id, label, report]);
}

function DelayedActivity({ label }: { label: string }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 250);
    return () => window.clearTimeout(timer);
  }, []);
  return visible ? <div className="calendar-activity" role="status" aria-live="polite"><span aria-hidden="true" className="calendar-activity-spinner"/>{label}</div> : null;
}

export function CalendarActivityProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<Record<string, string>>({});
  const report = useCallback((id: string, label: string | null) => {
    setSources(current => {
      if ((current[id] ?? null) === label) return current;
      const next = { ...current };
      delete next[id];
      if (label) next[id] = label;
      return next;
    });
  }, []);
  const label = Object.values(sources).at(-1);
  return <ActivityContext.Provider value={report}>{children}{label ? <DelayedActivity label={label}/> : null}</ActivityContext.Provider>;
}
