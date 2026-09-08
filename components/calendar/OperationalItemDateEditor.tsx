'use client';

import { useEffect, useState } from 'react';
import { DateOnlyPicker } from '@/components/jobs/DateOnlyPicker';
import type { ProductionBoardCard } from '@/lib/production-board/types';

export function OperationalItemDateEditor({ card, closedDates, onClose, onSave }: {
  card: ProductionBoardCard;
  closedDates: readonly string[];
  onClose: () => void;
  onSave: (date: string | null, closedAcknowledged: boolean) => Promise<string | null>;
}) {
  const [date, setDate] = useState(card.productionDate ?? '');
  const [closedAcknowledged, setClosedAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requiresClosedAcknowledgement = Boolean(date && closedDates.includes(date));
  const label = card.calendarItemType === 'customer_pickup' ? 'Customer Pickup' : 'Delivery';

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [onClose]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || (requiresClosedAcknowledgement && !closedAcknowledged)) return;
    setSaving(true);
    setError(null);
    const failure = await onSave(date || null, closedAcknowledged);
    setSaving(false);
    if (failure) { setError(failure); return; }
    onClose();
  };

  return <div className="calendar-floating-backdrop"><form aria-label={`Edit ${label} schedule`} className="calendar-quick-add calendar-quick-add-form" onSubmit={submit}>
    <header><strong>Edit {label}</strong><button aria-label={`Close Edit ${label}`} onClick={onClose} type="button">×</button></header>
    <label><span>Date (blank = Needs Attention)</span><DateOnlyPicker ariaLabel={`${label} date`} disabled={saving} id="calendar-operational-edit-date" onChange={(value) => { setDate(value); setClosedAcknowledged(false); }} value={date}/></label>
    {requiresClosedAcknowledgement ? <label><input checked={closedAcknowledged} disabled={saving} onChange={(event) => setClosedAcknowledged(event.target.checked)} type="checkbox"/> Confirm scheduling on this closed date.</label> : null}
    {error ? <p role="alert">{error}</p> : null}
    <footer><button disabled={saving} onClick={onClose} type="button">Cancel</button><button disabled={saving || (requiresClosedAcknowledgement && !closedAcknowledged)} type="submit">{saving ? 'Saving…' : 'Save'}</button></footer>
  </form></div>;
}
