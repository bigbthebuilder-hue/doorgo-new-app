'use client';

import { useActionState, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CapacityStaff } from '@/lib/manager/capacity-configuration';
import { configuredStaffForDate, exceptionalCapacity, type ClosureRecord, type ManagerCapacityExceptions, type SpecialDayRecord } from '@/lib/manager/capacity-exceptions';
import { deleteClosure, deleteSpecialDay, saveCapacityOverride, saveClosure, saveSpecialDay, toggleHoliday } from '@/lib/manager/capacity-exception-actions';
import type { ManagerActionState } from '@/lib/manager/capacity-actions';

const initial: ManagerActionState = { ok: false, message: '' };
function Result({ state }: { state: ManagerActionState }) { return state.message ? <p aria-live="polite" role="status">{state.message}</p> : null; }

export function ManagerCapacityExceptionsWorkspace({ canEdit, data, roster }: { canEdit: boolean; data: ManagerCapacityExceptions; roster: CapacityStaff[] }) {
  const router = useRouter();
  const [type, setType] = useState<'closed' | 'special'>('closed');
  const [closure, setClosure] = useState<ClosureRecord | null>(null);
  const [special, setSpecial] = useState<SpecialDayRecord | null>(null);
  return <div className="manager-capacity-exceptions">
    <section>
      <div className="manager-section-heading"><div><h2>Closures &amp; Special Days</h2><p>Choose whether the date is closed or operating with a special staff roster.</p></div></div>
      <fieldset className="manager-exception-type"><legend>Exception type</legend><label><input checked={type === 'closed'} name="exceptionType" onChange={() => setType('closed')} type="radio"/>Closed</label><label><input checked={type === 'special'} name="exceptionType" onChange={() => setType('special')} type="radio"/>Open / Special Day</label></fieldset>
      {type === 'closed'
        ? <ClosureEditor canEdit={canEdit} record={closure} onDone={() => { setClosure(null); router.refresh(); }}/>
        : <SpecialDayEditor canEdit={canEdit} key={special?.specialDayId ?? 'new-special'} record={special} roster={roster} onDone={() => { setSpecial(null); router.refresh(); }}/>
      }
      <div className="manager-exception-records"><div><h3>Closures</h3><div className="manager-staff-list">{data.closures.map(item => <button disabled={!canEdit} key={item.closureId} onClick={() => { setClosure(item); setType('closed'); }}><strong>{item.title}</strong><span>{item.startDate === item.endDate ? item.startDate : `${item.startDate} – ${item.endDate}`}</span><span>Closed · 0h</span></button>)}</div></div><div><h3>Special Days</h3><div className="manager-staff-list">{data.specialDays.map(item => <button disabled={!canEdit} key={item.specialDayId} onClick={() => { setSpecial(item); setType('special'); }}><strong>{item.title}</strong><span>{item.date}</span><span>{item.calculatedCapacity}h · {item.staff.length} staff</span></button>)}</div></div></div>
    </section>
    <section><div className="manager-section-heading"><div><h2>Stat Holidays</h2><p>Region {data.regionCode}. Generated holidays are On/Off only.</p></div><div><button onClick={() => router.push(`/manager?year=${data.year - 1}`)} type="button">{data.year - 1}</button><strong>{data.year}</strong><button onClick={() => router.push(`/manager?year=${data.year + 1}`)} type="button">{data.year + 1}</button></div></div><div className="manager-staff-list">{data.holidays.map(item => <HolidayToggle canEdit={canEdit} item={item} year={data.year} key={item.holidayKey}/>)}</div></section>
    <section><h2>Capacity Overrides</h2><p>Final date-level available Production capacity. Blank restores calculated capacity.</p><OverrideEditor canEdit={canEdit}/><div className="manager-staff-list">{data.overrides.map(item => <div key={item.date}><strong>{item.date}</strong><span>Calculated {item.calculatedCapacity ?? 'unknown'}h · Override {item.overrideCapacity}h</span></div>)}</div></section>
  </div>;
}

function ClosureEditor({ canEdit, record, onDone }: { canEdit: boolean; record: ClosureRecord | null; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (s: ManagerActionState, d: FormData) => { const result = await saveClosure(s, d); if (result.ok) onDone(); return result; }, initial);
  const [removeState, remove, removing] = useActionState(async (s: ManagerActionState, d: FormData) => { const result = await deleteClosure(s, d); if (result.ok) onDone(); return result; }, initial);
  return <form action={action} className="manager-workweek" key={record?.closureId ?? 'new-closure'}><input name="closureId" type="hidden" value={record?.closureId ?? ''}/><input name="revision" type="hidden" value={record?.revision ?? ''}/><label>Start Date<input disabled={!canEdit} name="startDate" required type="date" defaultValue={record?.startDate}/></label><label>End Date<input disabled={!canEdit} name="endDate" required type="date" defaultValue={record?.endDate}/></label><label>Title<input disabled={!canEdit} name="title" required defaultValue={record?.title}/></label><label>Details<input disabled={!canEdit} name="details" defaultValue={record?.details ?? ''}/></label><span className="manager-readonly-capacity">Production capacity: 0h</span><button disabled={!canEdit || pending}>{pending ? 'Saving…' : record ? 'Save Closure' : 'Add Closure'}</button>{record ? <button disabled={removing} formAction={remove}>Delete Closure</button> : null}<Result state={state.message ? state : removeState}/></form>;
}

function SpecialDayEditor({ canEdit, record, roster, onDone }: { canEdit: boolean; record: SpecialDayRecord | null; roster: CapacityStaff[]; onDone: () => void }) {
  const [date, setDate] = useState(record?.date ?? '');
  const [selectedIds, setSelectedIds] = useState(() => new Set(record?.staff.map(item => item.staffId) ?? []));
  const existingIds = useMemo(() => record?.staff.map(item => item.staffId) ?? [], [record]);
  const candidates = useMemo(() => configuredStaffForDate(roster, date || '1970-01-01', existingIds), [date, existingIds, roster]);
  const calculatedCapacity = exceptionalCapacity(candidates.filter(item => selectedIds.has(item.staffId)));
  const [state, action, pending] = useActionState(async (s: ManagerActionState, d: FormData) => { const result = await saveSpecialDay(s, d); if (result.ok) onDone(); return result; }, initial);
  const [removeState, remove, removing] = useActionState(async (s: ManagerActionState, d: FormData) => { const result = await deleteSpecialDay(s, d); if (result.ok) onDone(); return result; }, initial);
  const toggleStaff = (staffId: string) => setSelectedIds(current => { const next = new Set(current); if (next.has(staffId)) next.delete(staffId); else next.add(staffId); return next; });
  return <form action={action} className="manager-editor" key={record?.specialDayId ?? 'new-special'}><input name="specialDayId" type="hidden" value={record?.specialDayId ?? ''}/><input name="revision" type="hidden" value={record?.revision ?? ''}/><div className="manager-form-row"><label>Date<input disabled={!canEdit} name="date" onChange={event => setDate(event.target.value)} required type="date" value={date}/></label><label>Title<input disabled={!canEdit} name="title" required defaultValue={record?.title}/></label><label>Details<input disabled={!canEdit} name="details" defaultValue={record?.details ?? ''}/></label></div><fieldset className="manager-special-staff" disabled={!canEdit}><legend>Staff Working That Date</legend>{candidates.map(staff => <label key={staff.staffId}><input checked={selectedIds.has(staff.staffId)} name="staffId" onChange={() => toggleStaff(staff.staffId)} type="checkbox" value={staff.staffId}/><strong>{staff.displayName}</strong><span>{staff.capacityRole === 'direct_production' ? `${staff.productiveHours}h productive` : 'Support · 0h direct capacity'}</span></label>)}</fieldset><output className="manager-readonly-capacity" aria-live="polite">Calculated Production capacity: {calculatedCapacity}h</output><p className="manager-capacity-hint">For a different final capacity, use Capacity Overrides.</p><footer><button disabled={!canEdit || pending}>{pending ? 'Saving…' : record ? 'Save Special Day' : 'Add Special Day'}</button>{record ? <button disabled={removing} formAction={remove}>Delete Special Day</button> : null}</footer><Result state={state.message ? state : removeState}/></form>;
}

function HolidayToggle({ canEdit, item, year }: { canEdit: boolean; item: ManagerCapacityExceptions['holidays'][number]; year: number }) { const router = useRouter(); const [state, action, pending] = useActionState(async (s: ManagerActionState, d: FormData) => { const result = await toggleHoliday(s, d); if (result.ok) router.refresh(); return result; }, initial); return <form action={action}><input name="year" type="hidden" value={year}/><input name="holidayKey" type="hidden" value={item.holidayKey}/><input name="enabled" type="hidden" value={String(!item.enabled)}/><strong>{item.name}</strong><span>{item.date}</span><button disabled={!canEdit || pending}>{pending ? 'Saving…' : item.enabled ? 'On' : 'Off'}</button><Result state={state}/></form>; }
function OverrideEditor({ canEdit }: { canEdit: boolean }) { const router = useRouter(); const [state, action, pending] = useActionState(async (s: ManagerActionState, d: FormData) => { const result = await saveCapacityOverride(s, d); if (result.ok) router.refresh(); return result; }, initial); return <form action={action} className="manager-workweek"><label>Date<input disabled={!canEdit} name="date" required type="date"/></label><label>Override capacity<input disabled={!canEdit} max="999" min="0" name="overrideCapacity" step=".25" type="number"/></label><label>Reason<input disabled={!canEdit} name="reason"/></label><button disabled={!canEdit || pending}>{pending ? 'Saving…' : 'Save / Clear Override'}</button><Result state={state}/></form>; }
