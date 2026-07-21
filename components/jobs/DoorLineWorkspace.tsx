'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  DOOR_HEIGHTS,
  EXTERIOR_WIDTHS,
  INTERIOR_WIDTHS,
  J2A_CONFIGS,
  J2B_CONFIGS,
  CONFIRMED_JOB_LINE_MESSAGE,
  calculateJ2AShopHours,
  defaultDoorLine,
  doorLineEquivalenceKey,
  normalizeDoorLineInput,
  prepChoices,
} from '@/lib/jobs/door-line-contract';
import type { DoorLineInput, JobLifecycleStage } from '@/lib/jobs/job-intake-types';

const control = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-950';
const button = 'min-h-11 rounded-xl border border-slate-300 px-3 font-semibold dark:border-slate-600';

function lineTitle(line: DoorLineInput): string {
  return [line.mode, line.doorType || 'TBD', `${line.width} × ${line.height}`, line.config, line.hand, line.jambWidth].filter(Boolean).join(' · ');
}

export function DoorLineWorkspace({
  lines,
  onChange,
  canEdit,
  lifecycleStage,
}: {
  lines: DoorLineInput[];
  onChange: (lines: DoorLineInput[]) => void;
  canEdit: boolean;
  lifecycleStage: JobLifecycleStage;
}) {
  const [editor, setEditor] = useState<DoorLineInput>(() => defaultDoorLine('Exterior'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ripMode, setRipMode] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string; lifecycleStage: JobLifecycleStage } | null>(null);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = lines.filter((line) => (line.lineStatus ?? 'Active') === 'Active');
  const archived = lines.filter((line) => line.lineStatus === 'Archived');
  const estimate = useMemo(() => calculateJ2AShopHours(lines), [lines]);
  const mode = editor.mode === 'Interior' ? 'Interior' : 'Exterior';
  const config = String(editor.config ?? 'D');
  const noJamb = mode === 'Interior' && (config === 'PKT' || config === 'B.P.');
  const widths = mode === 'Interior' ? INTERIOR_WIDTHS : EXTERIOR_WIDTHS;
  const visibleMessage = message?.lifecycleStage === lifecycleStage ? message : null;

  function clearMessageTimer() {
    if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    messageTimer.current = null;
  }

  function clearWorkspaceMessage() {
    clearMessageTimer();
    setMessage(null);
  }

  function showTransientMessage(next: { error: boolean; text: string }) {
    clearMessageTimer();
    setMessage({ ...next, lifecycleStage });
    messageTimer.current = setTimeout(() => {
      messageTimer.current = null;
      setMessage(null);
    }, 5000);
  }

  useEffect(() => () => {
    if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    messageTimer.current = null;
  }, [lifecycleStage]);

  function set(name: string, value: unknown) {
    setEditor((current) => ({ ...current, [name]: value }));
    clearWorkspaceMessage();
  }

  function chooseMode(nextMode: 'Interior' | 'Exterior') {
    setEditor(defaultDoorLine(nextMode));
    setRipMode(false);
    clearWorkspaceMessage();
  }

  function chooseConfig(nextConfig: string) {
    const next = { ...editor, config: nextConfig };
    const choices = prepChoices(mode, nextConfig);
    next.prep = choices[0] ?? '';
    if (mode === 'Interior' && (nextConfig === 'PKT' || nextConfig === 'B.P.')) {
      Object.assign(next, { hand: '', jambWidth: '', jambType: '', hingeType: '', ripJamb: '', customSlab: 'No', customSlabWidth: '', customSlabHeight: '' });
      setRipMode(false);
    }
    setEditor(next);
    clearWorkspaceMessage();
  }

  function resetEditor() {
    setEditor(defaultDoorLine(mode));
    setEditingId(null);
    setRipMode(false);
    clearWorkspaceMessage();
  }

  function commitEditor() {
    const candidate = { ...editor, lineId: editingId ?? globalThis.crypto.randomUUID(), lineStatus: 'Active' as const };
    const normalized = normalizeDoorLineInput(candidate);
    if (!normalized.ok) {
      const special = lifecycleStage === 'Confirmed Job' && editingId && active.length === 1
        ? CONFIRMED_JOB_LINE_MESSAGE
        : Object.values(normalized.fieldErrors)[0] ?? normalized.message;
      clearMessageTimer();
      setMessage({ error: true, text: special, lifecycleStage });
      return;
    }
    const saved = { ...candidate, ...normalized.value };
    if (editingId) onChange(lines.map((line) => line.lineId === editingId ? saved : line));
    else onChange([...lines, saved]);
    showTransientMessage({ error: false, text: editingId ? 'Door line updated. Save the job to persist it.' : 'Door line added. Save the job to persist it.' });
    setEditor(defaultDoorLine(mode));
    setEditingId(null);
    setRipMode(false);
  }

  function edit(line: DoorLineInput) {
    setEditor(structuredClone(line));
    setEditingId(String(line.lineId));
    setRipMode(String(line.ripJamb ?? '').toLowerCase() === 'yes');
    clearWorkspaceMessage();
  }

  function duplicate(line: DoorLineInput) {
    const duplicateLine = { ...structuredClone(line), lineId: globalThis.crypto.randomUUID(), lineStatus: 'Active' as const, lineIndex: lines.length + 1 };
    onChange([...lines, duplicateLine]);
    showTransientMessage({ error: false, text: 'Door line duplicated with a new identity. Save the job to persist it.' });
  }

  function adjust(lineId: unknown, delta: number) {
    const line = lines.find((item) => item.lineId === lineId);
    if (!line) return;
    const nextQuantity = Number(line.qty) + delta;
    if (lifecycleStage === 'Confirmed Job' && nextQuantity <= 0 && active.length === 1) {
      showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE });
      return;
    }
    onChange(lines.map((item) => item.lineId === lineId ? { ...item, qty: Math.max(1, nextQuantity) } : item));
  }

  function move(lineId: unknown, delta: number) {
    const activeIds = active.map((line) => String(line.lineId));
    const position = activeIds.indexOf(String(lineId));
    const target = position + delta;
    if (position < 0 || target < 0 || target >= activeIds.length) return;
    const left = lines.findIndex((line) => String(line.lineId) === activeIds[position]);
    const right = lines.findIndex((line) => String(line.lineId) === activeIds[target]);
    const next = [...lines];
    [next[left], next[right]] = [next[right], next[left]];
    onChange(next.map((line, index) => ({ ...line, lineIndex: index + 1 })));
  }

  function archive(lineId: unknown) {
    if (lifecycleStage === 'Confirmed Job' && active.length === 1 && active[0]?.lineId === lineId) {
      showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE });
      return;
    }
    onChange(lines.map((line) => line.lineId === lineId ? { ...line, lineStatus: 'Archived' as const } : line));
  }

  function restore(lineId: unknown) {
    onChange(lines.map((line) => line.lineId === lineId ? { ...line, lineStatus: 'Active' as const } : line));
    clearWorkspaceMessage();
  }

  function merge() {
    const keepers = new Map<string, DoorLineInput>();
    const next = lines.map((line) => ({ ...line }));
    let count = 0;
    for (const line of next.filter((item) => (item.lineStatus ?? 'Active') === 'Active')) {
      const key = doorLineEquivalenceKey(line);
      const keeper = keepers.get(key);
      if (!keeper) keepers.set(key, line);
      else {
        keeper.qty = Number(keeper.qty) + Number(line.qty);
        line.lineStatus = 'Merged';
        count += 1;
      }
    }
    onChange(next);
    showTransientMessage({ error: false, text: count ? `Merged ${count} equivalent line${count === 1 ? '' : 's'} into the remaining active line.` : 'No equivalent active lines were found.' });
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]" aria-labelledby="door-lines-heading">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Door editor</p><h2 className="text-xl font-semibold">{editingId ? 'Edit Door Line' : 'Add Door Line'}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold dark:bg-slate-800">J2A · Non-glass</span></div>
        {!canEdit ? <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">Door lines are read-only with jobs = view.</p> : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Door mode">
              {(['Exterior', 'Interior'] as const).map((value) => <button className={`${button} ${mode === value ? 'border-sky-700 bg-sky-700 text-white' : ''}`} key={value} onClick={() => chooseMode(value)} type="button">{value}</button>)}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Door Type<input className={control} onChange={(e) => set('doorType', e.target.value)} value={String(editor.doorType ?? '')}/></label>
              <label className="grid gap-1 text-sm font-semibold">Configuration<select className={control} onChange={(e) => chooseConfig(e.target.value)} value={config}>{J2A_CONFIGS[mode].map((value) => <option key={value}>{value}</option>)}{J2B_CONFIGS.map((value) => <option disabled key={value} value={value}>{value} — glass support in J2B</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Width<select className={control} onChange={(e) => set('width', e.target.value)} value={String(editor.width)}>{widths.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Height<select className={control} onChange={(e) => set('height', e.target.value)} value={String(editor.height)}>{DOOR_HEIGHTS.map((value) => <option key={value}>{value}</option>)}</select></label>
              {!noJamb ? <label className="grid gap-1 text-sm font-semibold">Swing<select className={control} onChange={(e) => set('hand', e.target.value)} value={String(editor.hand ?? '')}>{mode === 'Interior' && config === 'DD' ? <option value="">No handing</option> : null}<option>LH</option><option>RH</option>{mode === 'Exterior' ? <><option>LHOUT</option><option>RHOUT</option></> : null}</select></label> : null}
              <label className="grid gap-1 text-sm font-semibold">Prep<select className={control} onChange={(e) => set('prep', e.target.value)} value={String(editor.prep ?? '')}>{prepChoices(mode, config).map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="grid gap-1 text-sm font-semibold">Quantity<input className={control} min="1" onChange={(e) => set('qty', e.target.value)} step="1" type="number" value={String(editor.qty ?? 1)}/></label>
            </div>
            <details className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer font-semibold">More Details</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
              {!noJamb ? <><label className="grid gap-1 text-sm font-semibold">Jamb Width{ripMode ? <input className={control} onChange={(e) => set('jambWidth', e.target.value)} placeholder="Completed RIP size" value={String(editor.jambWidth === 'RIP' ? '' : editor.jambWidth ?? '')}/> : <select className={control} onChange={(e) => set('jambWidth', e.target.value)} value={String(editor.jambWidth ?? '')}><option>{mode === 'Exterior' ? `6-9/16"` : `4-9/16"`}</option><option>{mode === 'Exterior' ? `4-9/16"` : `6-9/16"`}</option><option>{`7-1/4"`}</option></select>}</label><label className="flex min-h-12 items-center gap-3 self-end rounded-xl border border-slate-300 px-3 dark:border-slate-600"><input checked={ripMode} onChange={(e) => { setRipMode(e.target.checked); set('ripJamb', e.target.checked ? 'Yes' : ''); if (e.target.checked) set('jambWidth', ''); }} type="checkbox"/>RIP jamb</label><label className="grid gap-1 text-sm font-semibold">Jamb Type<select className={control} onChange={(e) => set('jambType', e.target.value)} value={String(editor.jambType ?? 'Primed')}><option>Primed</option><option>Fir</option>{mode === 'Exterior' ? <><option>Smooth Composite</option><option>Textured Composite</option></> : null}</select></label><label className="grid gap-1 text-sm font-semibold">Hinge Type<select className={control} onChange={(e) => set('hingeType', e.target.value)} value={String(editor.hingeType ?? '')}><option>BB</option><option>REG</option>{mode === 'Exterior' ? <><option>BOM</option><option>NRP</option></> : null}</select></label></> : null}
              {mode === 'Exterior' ? <><label className="grid gap-1 text-sm font-semibold">Material<select className={control} onChange={(e) => set('material', e.target.value)} value={String(editor.material)}><option value="fiberglass">Fiberglass</option><option value="wood">Wood</option></select></label><label className="grid gap-1 text-sm font-semibold">Sill<input className={control} onChange={(e) => set('sill', e.target.value)} value={String(editor.sill ?? '')}/></label><label className="grid gap-1 text-sm font-semibold">Weatherstrip<input className={control} onChange={(e) => set('weatherstrip', e.target.value)} value={String(editor.weatherstrip ?? '')}/></label></> : null}
              <label className="grid gap-1 text-sm font-semibold">Custom Slab / RO<select className={control} onChange={(e) => set('customSlab', e.target.value)} value={String(editor.customSlab ?? 'No')}><option value="No">Standard</option>{!noJamb ? <option value="RO">Custom RO / Cut Down</option> : null}<option disabled={editor.material !== 'wood'} value="WoodCustom">Custom Wood Slab</option></select></label>
              {editor.customSlab === 'WoodCustom' ? <><label className="grid gap-1 text-sm font-semibold">Custom Slab Width<input className={control} onChange={(e) => set('customSlabWidth', e.target.value)} value={String(editor.customSlabWidth ?? '')}/></label><label className="grid gap-1 text-sm font-semibold">Custom Slab Height<input className={control} onChange={(e) => set('customSlabHeight', e.target.value)} value={String(editor.customSlabHeight ?? '')}/></label></> : null}
              {config === 'B.P.' ? <label className="grid gap-1 text-sm font-semibold">F.O. Height (only when cutting)<input className={control} onChange={(e) => set('roHeight', e.target.value)} value={String(editor.roHeight ?? '')}/></label> : null}
              <label className="grid gap-1 text-sm font-semibold">Door Thickness<select className={control} onChange={(e) => set('doorThickness', e.target.value)} value={String(editor.doorThickness ?? '')}><option value="">Auto</option><option>1-3/8</option><option>1-3/4</option></select></label>
              <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Line Notes<textarea className={`${control} min-h-20 py-2`} onChange={(e) => set('notes', e.target.value)} value={String(editor.notes ?? '')}/></label>
            </div></details>
            <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800"><span className="font-semibold">Preview:</span> {lineTitle(editor)}</div>
            <div className="mt-4 flex flex-wrap gap-2"><button className={`${button} border-sky-700 bg-sky-700 text-white`} onClick={commitEditor} type="button">{editingId ? 'Update Door' : 'Add Door'}</button>{editingId ? <button className={button} onClick={resetEditor} type="button">Cancel Edit</button> : null}</div>
          </>
        )}
        {visibleMessage ? <p aria-live="polite" className={`mt-4 rounded-xl p-3 text-sm ${visibleMessage.error ? 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100' : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'}`} role="status">{visibleMessage.text}</p> : null}
      </div>

      <aside className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Job Lines</p><h2 className="text-xl font-semibold" id="door-lines-heading">{active.length} active · {archived.length} archived</h2></div>{canEdit ? <button className={button} onClick={merge} type="button">Merge Equivalent</button> : null}</div>
        <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">Shop Hours: {estimate.shopHours ?? '—'} · {estimate.shopHoursSource ?? 'No estimate'}</p>
        <div className="mt-4 grid gap-3">{active.length ? active.map((line, index) => <article className="rounded-xl border border-slate-200 p-3 dark:border-slate-700" key={String(line.lineId)}><h3 className="font-semibold">{lineTitle(line)}</h3><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Qty {String(line.qty)}{line.notes ? ` · ${line.notes}` : ''}</p>{canEdit ? <div className="mt-3 grid grid-cols-3 gap-2"><button className={button} onClick={() => adjust(line.lineId, 1)} type="button">+ Qty</button><button className={button} onClick={() => adjust(line.lineId, -1)} type="button">− Qty</button><button className={button} onClick={() => edit(line)} type="button">Edit</button><button className={button} onClick={() => duplicate(line)} type="button">Duplicate</button><button className={button} disabled={index === 0} onClick={() => move(line.lineId, -1)} type="button">Move Up</button><button className={button} disabled={index === active.length - 1} onClick={() => move(line.lineId, 1)} type="button">Move Down</button><button className={`${button} col-span-3 border-rose-300 text-rose-800 dark:text-rose-200`} onClick={() => archive(line.lineId)} type="button">Archive / Remove</button></div> : null}</article>) : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No active door lines.</p>}</div>
        <details className="mt-5"><summary className="cursor-pointer font-semibold">Archived Lines ({archived.length})</summary><div className="mt-3 grid gap-3">{archived.length ? archived.map((line) => <article className="rounded-xl border border-slate-200 p-3 opacity-80 dark:border-slate-700" key={String(line.lineId)}><h3 className="font-semibold">{lineTitle(line)}</h3><p className="mt-1 text-sm">Qty {String(line.qty)} · Archived</p>{canEdit ? <button className={`${button} mt-3`} onClick={() => restore(line.lineId)} type="button">Restore Line</button> : null}</article>) : <p className="text-sm text-slate-500">No archived lines.</p>}</div></details>
      </aside>
    </section>
  );
}
