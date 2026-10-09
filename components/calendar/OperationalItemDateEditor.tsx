'use client';
import { useCalendarActivity } from './CalendarActivity';

import { useEffect, useState } from 'react';
import { DateOnlyPicker } from '@/components/jobs/DateOnlyPicker';
import { loadCalendarEdit, saveCalendarEdit, type CalendarEditSnapshot } from '@/lib/calendar/calendar-item-actions';
import { OperationalFields, type OperationalFieldsValue } from './OperationalFields';
import type { ProductionBoardCard } from '@/lib/production-board/types';

export function OperationalItemDateEditor({ card, closedDates, onClose, onSave }: {
  card: ProductionBoardCard;
  closedDates: readonly string[];
  onClose: () => void;
  onSave: (snapshot: CalendarEditSnapshot) => Promise<void>;
}) {
  const [snapshot,setSnapshot]=useState<CalendarEditSnapshot|null>(null);
  const [fields,setFields]=useState<OperationalFieldsValue>({name:'',salesOrder:'',salesperson:'',shopHours:'',timing:'',fulfillmentNote:''});
  const [date, setDate] = useState(card.productionDate ?? '');
  const [closedAcknowledged, setClosedAcknowledged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useCalendarActivity(saving ? 'Saving…' : !snapshot && !error ? 'Loading…' : null);
  const requiresClosedAcknowledgement = Boolean(date && closedDates.includes(date));
  const label = card.recordKind !== 'calendar_item' ? 'Production' : card.calendarItemType === 'customer_pickup' ? 'Customer Pickup' : 'Delivery';

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [onClose]);

  useEffect(()=>{let active=true;void loadCalendarEdit(card.bookingId).then(result=>{if(!active)return;if(!result.ok){setError(result.message);return;}const item=result.snapshot;setSnapshot(item);setDate(item.date??'');setFields({name:item.name??'',salesOrder:item.salesOrder??'',salesperson:item.salesperson??'',shopHours:item.shopHours==null?'':String(item.shopHours),timing:item.timing??'',fulfillmentNote:item.fulfillmentNote??''});}).catch(()=>{if(active)setError('The current item could not be loaded. Reopen Edit to retry.');});return()=>{active=false;};},[card.bookingId]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!snapshot || snapshot.completed || saving || (requiresClosedAcknowledgement && !closedAcknowledged)) return;
    setSaving(true);
    setError(null);
    let result;
    try { result=await saveCalendarEdit(snapshot,{...fields,shopHours:fields.shopHours.trim()===''?null:Number(fields.shopHours),date:date||null},closedAcknowledged); }
    catch { setSaving(false);setError('The item could not be saved. Reopen Edit to retry.');return; }
    setSaving(false);
    if(!result.ok){setError(result.message);return;}
    await onSave(result.snapshot);
    onClose();
  };

  return <div className="calendar-floating-backdrop"><form aria-label={`Edit ${label} schedule`} className="calendar-quick-add calendar-quick-add-form" onSubmit={submit}>
    <header><strong>Edit {label}</strong><button aria-label={`Close Edit ${label}`} onClick={onClose} type="button">×</button></header>
    {snapshot ? <fieldset style={{border:0,padding:0,margin:0,minWidth:0}} disabled={saving||snapshot.completed}><OperationalFields kind={snapshot.kind} value={fields} identityReadOnly={snapshot.identityReadOnly} onChange={patch=>setFields(current=>({...current,...patch}))}/></fieldset> : <p>Loading current item...</p>}
    <label className="calendar-note-date-field"><span>Date (blank = Needs Attention)</span><DateOnlyPicker ariaLabel={`${label} date`} disabled={!snapshot||snapshot.completed||saving} id="calendar-operational-edit-date" onChange={(value) => { setDate(value); setClosedAcknowledged(false); }} value={date}/></label>
    {requiresClosedAcknowledgement ? <label><input checked={closedAcknowledged} disabled={saving} onChange={(event) => setClosedAcknowledged(event.target.checked)} type="checkbox"/> Confirm scheduling on this closed date.</label> : null}
    {error ? <p role="alert">{error}</p> : null}
    <footer><button disabled={saving} onClick={onClose} type="button">Cancel</button><button disabled={!snapshot||snapshot.completed||saving || (requiresClosedAcknowledgement && !closedAcknowledged)} type="submit">{saving ? 'Saving…' : 'Save'}</button></footer>
  </form></div>;
}
