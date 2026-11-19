'use client';

import { useEffect, useState, type ReactNode } from 'react';

export function usePhoneIntake() {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 640px)');
    const update = () => setPhone(query.matches);
    update(); query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return phone;
}

// One set of fields and business handlers: always expanded on desktop.
export function MobileIntakeSection({ title, summary, children, invalid = false, enabled = false }: { title: string; summary?: string; children: ReactNode; invalid?: boolean; enabled?: boolean }) {
  const phone = usePhoneIntake();
  const [expanded, setExpanded] = useState(false);
  return <details className="mobile-intake-section" open={!enabled || !phone || expanded || invalid} onToggle={event => {
    if (enabled && phone && !invalid) setExpanded(event.currentTarget.open);
  }}><summary><strong>{title}</strong>{summary ? <span>{summary}</span> : null}</summary><div className="mobile-intake-section-fields">{children}</div></details>;
}
