'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  DOOR_HEIGHTS, EXTERIOR_WIDTHS, INTERIOR_WIDTHS, J2A_CONFIGS, J2B_CONFIGS,
  CONFIRMED_JOB_LINE_MESSAGE, calculateJ2AShopHours, defaultDoorLine,
  doorLineEquivalenceKey, normalizeDoorLineInput, prepChoices,
} from '@/lib/jobs/door-line-contract';
import {
  calculateGlassGeometry, geometryChanged, glassConfigurationTopology, glassLineNeedsAttention,
  isGlassConfiguration, normalizeSidelightType, retainCompatibleGlassFields,
} from '@/lib/jobs/glass-geometry-contract';
import { prepareGlassOverrideAction, removeGlassOverrideAction } from '@/lib/jobs/job-intake-actions';
import { parseShopDimension, parseStoredShopDimension } from '@/lib/jobs/dimension-contract';
import { calculationPresentation, canCommitGlassCalculation } from '@/lib/jobs/glass-editor-contract';
import type { DoorLineInput, GlassCalculationStatus, GlassGeometryValues, GlassIssue, JobLifecycleStage } from '@/lib/jobs/job-intake-types';
import { GlassUnitDiagram } from './GlassUnitDiagram';

const control = 'min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-600 dark:bg-slate-950';
const button = 'min-h-11 rounded-xl border border-slate-300 px-3 font-semibold dark:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50';
const geometryFields = new Set(['config', 'width', 'height', 'customSlab', 'customSlabWidth', 'customSlabHeight', 'hand', 'roWidth', 'roHeight', 'material', 'sidelightType', 'sidelightGlass', 'transomGlass', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight']);

function lineTitle(line: DoorLineInput): string {
  return [line.mode, line.doorType || 'TBD', `${line.width} × ${line.height}`, line.config, line.hand, line.jambWidth].filter(Boolean).join(' · ');
}

function statusTone(status: unknown): string {
  if (status === 'Blocked') return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100';
  if (status === 'Warning' || status === 'Glass Detail Needed' || status === 'Incomplete') return 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100';
  if (status === 'Manual Override') return 'bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100';
  return 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100';
}

function StatusBadge({ status }: { status: unknown }) {
  if (!status || status === 'Ready' || status === 'Not Needed') return null;
  return <span aria-label={`Calculation status: ${String(status)}`} className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone(status)}`}>{String(status)}</span>;
}

function Issues({ label, issues, blocker = false }: { label: string; issues: GlassIssue[]; blocker?: boolean }) {
  if (!issues.length) return null;
  return <section aria-label={label} className={`rounded-xl border p-3 ${blocker ? 'border-rose-400 bg-rose-50 text-rose-950 dark:bg-rose-950 dark:text-rose-100' : 'border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`}><p className="font-bold">{blocker ? '⛔' : '⚠'} {label}</p><ul className="mt-1 list-disc pl-5 text-sm">{issues.map((entry) => <li key={`${entry.code}:${entry.message}`}>{entry.message}</li>)}</ul></section>;
}

function lineShopHours(line: DoorLineInput): string {
  return String(calculateJ2AShopHours([{ ...line, lineStatus: 'Active' }]).shopHours ?? '—');
}

function DimensionInput({ label, required = false, value, error, onValue }: { label: string; required?: boolean; value: string; error?: string; onValue: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-semibold">{label}{required ? ' *' : ''}<span className="relative block"><input aria-invalid={Boolean(error)} aria-label={`${label}, inches`} className={`${control} pr-9 font-mono`} inputMode="decimal" onChange={(event) => onValue(event.target.value)} placeholder="54 or 54 1/2" value={value}/><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base font-bold">&quot;</span></span>{error ? <span className="text-xs text-rose-700 dark:text-rose-300">{error}</span> : <span className="text-xs font-normal text-slate-500">Inches: 54, 54 1/2, 54-1/2, or 54.5</span>}</label>;
}

function storedShopInput(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const parsed = parseStoredShopDimension(value);
  return parsed.ok ? parsed.formatted.slice(0, -1) : String(value);
}

export function DoorLineWorkspace({ lines, onChange, canEdit, lifecycleStage }: {
  lines: DoorLineInput[];
  onChange: (lines: DoorLineInput[]) => void;
  canEdit: boolean;
  lifecycleStage: JobLifecycleStage;
}) {
  const [editor, setEditor] = useState<DoorLineInput>(() => defaultDoorLine('Exterior'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ripMode, setRipMode] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string; lifecycleStage: JobLifecycleStage } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [acceptedValues, setAcceptedValues] = useState<GlassGeometryValues>({});
  const [calculationStatus, setCalculationStatus] = useState<GlassCalculationStatus | 'Incomplete' | null>(null);
  const [isOverridePending, startOverrideTransition] = useTransition();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = lines.filter((line) => (line.lineStatus ?? 'Active') === 'Active');
  const archived = lines.filter((line) => line.lineStatus === 'Archived');
  const estimate = useMemo(() => calculateJ2AShopHours(lines), [lines]);
  const mode = editor.mode === 'Interior' ? 'Interior' : 'Exterior';
  const config = String(editor.config ?? 'D');
  const isGlass = mode === 'Exterior' && isGlassConfiguration(config);
  const topology = isGlass ? glassConfigurationTopology(config) : null;
  const noJamb = mode === 'Interior' && (config === 'PKT' || config === 'B.P.');
  const widths = mode === 'Interior' ? INTERIOR_WIDTHS : EXTERIOR_WIDTHS;
  const visibleMessage = message?.lifecycleStage === lifecycleStage ? message : null;
  const warnings = Array.isArray(editor.glassWarnings) ? editor.glassWarnings : [];
  const blockers = Array.isArray(editor.glassBlockers) ? editor.glassBlockers : [];

  function clearMessageTimer() {
    if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    messageTimer.current = null;
  }

  function clearWorkspaceMessage() { clearMessageTimer(); setMessage(null); }

  function showTransientMessage(next: { error: boolean; text: string }) {
    clearMessageTimer();
    setMessage({ ...next, lifecycleStage });
    messageTimer.current = setTimeout(() => { messageTimer.current = null; setMessage(null); }, 5000);
  }

  useEffect(() => () => {
    if (messageTimer.current !== null) clearTimeout(messageTimer.current);
    messageTimer.current = null;
  }, [lifecycleStage]);

  function clearCalculated(next: DoorLineInput): DoorLineInput {
    return { ...next, glassCalcStatus: isGlassConfiguration(next.config) ? 'Ready' : 'Not Needed', glassCalc: null, glassOverride: null, glassWarnings: [], glassBlockers: [], glassUnits: [], panelSidelights: [], glassWorkorderDetail: null, vendorCopyText: null };
  }

  function set(name: string, value: unknown) {
    setEditor((current) => {
      const next = { ...current, [name]: value };
      return geometryFields.has(name) && geometryChanged(current, next) ? clearCalculated(next) : next;
    });
    setFieldErrors((current) => { const next = { ...current }; delete next[name]; return next; });
    setCalculationStatus(null);
    clearWorkspaceMessage();
  }

  function setDimension(name: string, value: string) {
    set(name, value);
    const parsed = parseShopDimension(value);
    setFieldErrors((current) => {
      const next = { ...current };
      if (value.trim() && !parsed.ok) next[name] = parsed.message;
      else delete next[name];
      return next;
    });
  }

  function chooseMode(nextMode: 'Interior' | 'Exterior') {
    setEditor(defaultDoorLine(nextMode)); setEditingId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); clearWorkspaceMessage();
  }

  function chooseConfig(nextConfig: string) {
    let next = mode === 'Exterior'
      ? retainCompatibleGlassFields(editor, nextConfig, isGlassConfiguration(nextConfig) && glassConfigurationTopology(nextConfig).sidelightPositions.length ? (normalizeSidelightType(editor.sidelightType) ?? 'Glass') : null)
      : { ...editor, config: nextConfig };
    next.prep = prepChoices(mode, nextConfig)[0] ?? '';
    if (mode === 'Interior' && (nextConfig === 'PKT' || nextConfig === 'B.P.')) {
      next = { ...next, hand: '', jambWidth: '', jambType: '', hingeType: '', ripJamb: '', customSlab: 'No', customSlabWidth: '', customSlabHeight: '' };
      setRipMode(false);
    }
    setEditor(next); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); clearWorkspaceMessage();
  }

  function chooseSidelightType(value: 'Glass' | 'Panel') {
    setEditor(retainCompatibleGlassFields(editor, config, value)); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); clearWorkspaceMessage();
  }

  function resetEditor() {
    setEditor(defaultDoorLine(mode)); setEditingId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); clearWorkspaceMessage();
  }

  function calculate() {
    if (Object.values(fieldErrors).some(Boolean)) {
      clearMessageTimer(); setMessage({ error: true, text: Object.values(fieldErrors)[0], lifecycleStage }); return;
    }
    const identified = { ...editor, lineId: editor.lineId ?? editingId ?? globalThis.crypto.randomUUID() };
    const result = calculateGlassGeometry(identified);
    const presentation = calculationPresentation(identified.glassCalcStatus ?? undefined, result.status);
    setCalculationStatus(presentation.displayStatus);
    setEditor({ ...identified, glassCalcStatus: presentation.persistedStatus, glassWarnings: result.warnings, glassBlockers: result.status === 'Glass Detail Needed' ? [] : result.blockers, glassWorkorderDetail: result.workorderDetail, glassUnits: result.glassUnits, panelSidelights: result.panelSidelights, glassCalc: result.glassCalc, vendorCopyText: result.vendorCopyText, glassOverride: result.override });
    setAcceptedValues(result.glassCalc ?? {});
    if (result.status === 'Blocked' || result.status === 'Glass Detail Needed') {
      clearMessageTimer(); setMessage({ error: true, text: result.incompleteDetails[0]?.message ?? result.blockers[0]?.message ?? 'More glass detail is required.', lifecycleStage });
    } else showTransientMessage({ error: false, text: result.status === 'Warning' ? 'Calculation completed with review warnings.' : 'Glass calculation completed.' });
  }

  function commitEditor(detailNeeded = false) {
    if (Object.values(fieldErrors).some(Boolean)) {
      clearMessageTimer(); setMessage({ error: true, text: Object.values(fieldErrors)[0], lifecycleStage }); return;
    }
    const candidate = { ...editor, lineId: editingId ?? editor.lineId ?? globalThis.crypto.randomUUID(), lineStatus: 'Active' as const };
    const normalized = normalizeDoorLineInput(candidate);
    if (!normalized.ok) {
      const special = lifecycleStage === 'Confirmed Job' && editingId && active.length === 1 ? CONFIRMED_JOB_LINE_MESSAGE : Object.values(normalized.fieldErrors)[0] ?? normalized.message;
      setFieldErrors(normalized.fieldErrors);
      clearMessageTimer();
      setMessage({ error: true, text: special, lifecycleStage });
      return;
    }
    if (!canCommitGlassCalculation(normalized.value.glassCalcStatus ?? 'Ready', detailNeeded)) {
      clearMessageTimer(); setMessage({ error: true, text: 'Required glass detail is incomplete. Use Leave Glass Detail Needed to preserve the line.', lifecycleStage }); return;
    }
    if (detailNeeded && normalized.value.glassCalcStatus !== 'Glass Detail Needed') {
      clearMessageTimer(); setMessage({ error: true, text: 'Leave Glass Detail Needed is available only while required glass information is missing.', lifecycleStage }); return;
    }
    const saved = { ...candidate, ...normalized.value };
    if (editingId) onChange(lines.map((line) => line.lineId === editingId ? saved : line));
    else onChange([...lines, saved]);
    showTransientMessage({ error: false, text: editingId ? 'Door line updated. Save the job to persist it.' : 'Door line added. Save the job to persist it.' });
    setEditor(defaultDoorLine(mode)); setEditingId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null);
  }

  function edit(line: DoorLineInput) {
    const editable = structuredClone(line);
    for (const name of ['roWidth', 'roHeight', 'customSlabWidth', 'customSlabHeight', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight'] as const) editable[name] = storedShopInput(editable[name]);
    setEditor(editable); setEditingId(String(line.lineId)); setRipMode(String(line.ripJamb ?? '').toLowerCase() === 'yes'); setCalculationStatus(null);
    setFieldErrors({}); setOverrideReason(line.glassOverride?.reason ?? ''); setAcceptedValues(line.glassOverride?.acceptedValues ?? line.glassCalc ?? {}); clearWorkspaceMessage();
  }

  function duplicate(line: DoorLineInput) {
    const duplicateLine = { ...structuredClone(line), lineId: globalThis.crypto.randomUUID(), lineStatus: 'Active' as const, lineIndex: lines.length + 1, glassOverride: null, glassCalcStatus: line.glassCalcStatus === 'Manual Override' ? 'Warning' as const : line.glassCalcStatus };
    onChange([...lines, duplicateLine]); showTransientMessage({ error: false, text: 'Door line duplicated with a new identity. Any manual override requires fresh approval.' });
  }

  function adjust(lineId: unknown, delta: number) {
    const line = lines.find((item) => item.lineId === lineId); if (!line) return;
    const nextQuantity = Number(line.qty) + delta;
    if (lifecycleStage === 'Confirmed Job' && nextQuantity <= 0 && active.length === 1) { showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE }); return; }
    onChange(lines.map((item) => item.lineId === lineId ? { ...item, qty: Math.max(1, nextQuantity) } : item));
  }

  function move(lineId: unknown, delta: number) {
    const activeIds = active.map((line) => String(line.lineId)); const position = activeIds.indexOf(String(lineId)); const target = position + delta;
    if (position < 0 || target < 0 || target >= activeIds.length) return;
    const left = lines.findIndex((line) => String(line.lineId) === activeIds[position]); const right = lines.findIndex((line) => String(line.lineId) === activeIds[target]);
    const next = [...lines]; [next[left], next[right]] = [next[right], next[left]]; onChange(next.map((line, index) => ({ ...line, lineIndex: index + 1 })));
  }

  function archive(lineId: unknown) {
    if (lifecycleStage === 'Confirmed Job' && active.length === 1 && active[0]?.lineId === lineId) {
      showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE });
      return;
    }
    onChange(lines.map((line) => line.lineId === lineId ? { ...line, lineStatus: 'Archived' as const } : line));
  }

  function restore(lineId: unknown) { onChange(lines.map((line) => line.lineId === lineId ? { ...line, lineStatus: 'Active' as const } : line)); clearWorkspaceMessage(); }

  function merge() {
    const keepers = new Map<string, DoorLineInput>(); const next = lines.map((line) => ({ ...line })); let count = 0;
    for (const line of next.filter((item) => (item.lineStatus ?? 'Active') === 'Active')) {
      const key = doorLineEquivalenceKey(line); const keeper = keepers.get(key);
      if (!keeper) keepers.set(key, line); else { keeper.qty = Number(keeper.qty) + Number(line.qty); line.lineStatus = 'Merged'; count += 1; }
    }
    onChange(next); showTransientMessage({ error: false, text: count ? `Merged ${count} equivalent line${count === 1 ? '' : 's'} into the remaining active line.` : 'No equivalent active lines were found.' });
  }

  function applyOverride() {
    startOverrideTransition(async () => {
      const result = await prepareGlassOverrideAction({ line: editor, acceptedValues, reason: overrideReason });
      if (!result.ok || !result.approval) { clearMessageTimer(); setMessage({ error: true, text: result.ok ? 'Override approval was not returned.' : result.message, lifecycleStage }); return; }
      const recalculated = calculateGlassGeometry({ ...editor, glassOverride: result.approval });
      setEditor((current) => ({ ...current, glassOverride: result.approval, glassCalcStatus: recalculated.status, glassWorkorderDetail: recalculated.workorderDetail }));
      showTransientMessage({ error: false, text: 'Manual geometry override applied. Save the job to persist it.' });
    });
  }

  function removeOverride() {
    startOverrideTransition(async () => {
      const result = await removeGlassOverrideAction();
      if (!result.ok) { clearMessageTimer(); setMessage({ error: true, text: result.message, lifecycleStage }); return; }
      const recalculated = calculateGlassGeometry({ ...editor, glassOverride: null });
      setEditor((current) => ({ ...current, glassOverride: null, glassCalcStatus: recalculated.status, glassWorkorderDetail: recalculated.workorderDetail }));
      showTransientMessage({ error: false, text: 'Manual override removed. Save the job to persist it.' });
    });
  }

  async function copyVendorText() {
    try { await navigator.clipboard.writeText(String(editor.vendorCopyText)); showTransientMessage({ error: false, text: 'Vendor copy copied.' }); }
    catch { showTransientMessage({ error: true, text: 'Vendor copy could not be copied. Select and copy the preview manually.' }); }
  }

  return <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,440px)]" aria-labelledby="door-lines-heading">
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Door editor</p><h2 className="text-xl font-semibold">{editingId ? 'Edit Door Line' : 'Add Door Line'}</h2></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold dark:bg-slate-800">{isGlass ? 'J2B · Glass geometry' : 'J2A · Door line'}</span></div>
      {!canEdit ? <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">Door lines and geometry are read-only with jobs = view.</p> : <>
        <div className="mt-4 grid grid-cols-2 gap-2" aria-label="Door mode">{(['Exterior', 'Interior'] as const).map((value) => <button className={`${button} ${mode === value ? 'border-sky-700 bg-sky-700 text-white' : ''}`} key={value} onClick={() => chooseMode(value)} type="button">{value}</button>)}</div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Door Type<input className={control} onChange={(event) => set('doorType', event.target.value)} value={String(editor.doorType ?? '')}/></label>
          <label className="grid gap-1 text-sm font-semibold">Configuration<select className={control} onChange={(event) => chooseConfig(event.target.value)} value={config}>{J2A_CONFIGS[mode].map((value) => <option key={value}>{value}</option>)}{mode === 'Exterior' ? J2B_CONFIGS.map((value) => <option key={value} value={value}>{value}</option>) : null}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Width<select className={control} onChange={(event) => set('width', event.target.value)} value={String(editor.width)}>{widths.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Height<select className={control} onChange={(event) => set('height', event.target.value)} value={String(editor.height)}>{DOOR_HEIGHTS.map((value) => <option key={value}>{value}</option>)}</select></label>
          {!noJamb ? <label className="grid gap-1 text-sm font-semibold">Swing<select className={control} onChange={(event) => set('hand', event.target.value)} value={String(editor.hand ?? '')}>{mode === 'Interior' && config === 'DD' ? <option value="">No handing</option> : null}<option>LH</option><option>RH</option>{mode === 'Exterior' ? <><option>LHOUT</option><option>RHOUT</option></> : null}</select></label> : null}
          <label className="grid gap-1 text-sm font-semibold">Prep<select className={control} onChange={(event) => set('prep', event.target.value)} value={String(editor.prep ?? '')}>{prepChoices(mode, config).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Quantity<input className={control} min="1" onChange={(event) => set('qty', event.target.value)} step="1" type="number" value={String(editor.qty ?? 1)}/></label>
        </div>

        {isGlass && topology ? <section className="mt-4 grid gap-4 rounded-2xl border border-sky-200 bg-sky-50/50 p-4 dark:border-sky-900 dark:bg-sky-950/30" aria-labelledby="glass-measure-heading">
          <div><h3 className="text-lg font-bold" id="glass-measure-heading">Glass Measure</h3><p className="text-sm text-slate-600 dark:text-slate-300">Enter applicable shop geometry in inches. The inch mark remains attached to each field.</p></div>
          {topology.sidelightPositions.length ? <fieldset><legend className="text-sm font-bold">Sidelight type for the complete unit</legend><div className="mt-2 grid grid-cols-2 gap-2">{(['Glass', 'Panel'] as const).map((value) => <button className={`${button} ${normalizeSidelightType(editor.sidelightType) === value ? 'border-sky-700 bg-sky-700 text-white' : ''}`} key={value} onClick={() => chooseSidelightType(value)} type="button">{value}</button>)}</div></fieldset> : null}
          <div className="grid gap-3 sm:grid-cols-2"><DimensionInput error={fieldErrors.roWidth} label="Rough Opening Width" onValue={(value) => setDimension('roWidth', value)} required value={String(editor.roWidth ?? '')}/><DimensionInput error={fieldErrors.roHeight} label={topology.hasTransom ? 'Rough Opening Height' : 'Optional RO Height'} onValue={(value) => setDimension('roHeight', value)} required={topology.hasTransom} value={String(editor.roHeight ?? '')}/></div>
          {topology.sidelightPositions.length && normalizeSidelightType(editor.sidelightType) === 'Glass' ? <label className="grid gap-1 text-sm font-semibold">Sidelight Glass<select className={control} onChange={(event) => set('sidelightGlass', event.target.value)} value={String(editor.sidelightGlass ?? '')}><option value="">Choose glass</option><option value="CLR_SB60_K4SG">Clear</option><option value="SAT_SB60_K4SG">Satin Etch</option></select></label> : null}
          {topology.sidelightPositions.length && normalizeSidelightType(editor.sidelightType) === 'Panel' ? String(editor.material).toLowerCase() === 'wood' ? <DimensionInput error={fieldErrors.panelSidelightWidth} label={topology.sidelightPositions.length === 2 ? 'Each Sidelight Panel Width' : `${topology.sidelightPositions[0] === 'left' ? 'Left' : 'Right'} Sidelight Panel Width`} onValue={(value) => setDimension('panelSidelightWidth', value)} required value={String(editor.panelSidelightWidth ?? '')}/> : <label className="grid gap-1 text-sm font-semibold">{topology.sidelightPositions.length === 2 ? 'Shared Fiberglass Sidelight Panel Width' : `${topology.sidelightPositions[0] === 'left' ? 'Left' : 'Right'} Fiberglass Sidelight Panel Width`} *<select className={control} onChange={(event) => set('panelSidelightWidth', event.target.value)} value={String(editor.panelSidelightWidth ?? '')}><option value="">Choose width</option><option value="11 3/4">11 3/4&quot;</option><option value="13 3/4">13 3/4&quot;</option></select></label> : null}
          {topology.hasTransom ? <label className="grid gap-1 text-sm font-semibold">Transom Glass<select className={control} onChange={(event) => set('transomGlass', event.target.value)} value={String(editor.transomGlass ?? '')}><option value="">Choose glass</option><option value="CLR_SB60_K4SG">Clear</option><option value="SAT_SB60_K4SG">Satin Etch</option></select></label> : null}
          <div className="flex flex-wrap gap-2"><button className={`${button} border-sky-700 bg-sky-700 text-white`} onClick={calculate} type="button">Calculate / Recalculate</button><button className={button} onClick={() => commitEditor(true)} type="button">Leave Glass Detail Needed</button></div>
          <div className="flex flex-wrap items-center gap-2"><StatusBadge status={calculationStatus ?? editor.glassCalcStatus}/>{glassLineNeedsAttention({ ...editor, lineStatus: 'Active' }).length ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-950 dark:bg-amber-950 dark:text-amber-100">Needs Attention</span> : null}</div>
          <Issues issues={warnings} label="Review warnings"/><Issues blocker issues={blockers} label="Hard blockers"/>
          <GlassUnitDiagram line={editor}/>
          {editor.glassCalc ? <details className="rounded-xl border border-slate-300 p-3 dark:border-slate-700" open><summary className="cursor-pointer font-bold">Calculated dimensions</summary><dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(editor.glassCalc).filter(([, value]) => typeof value === 'string' && value).map(([key, value]) => <div key={key}><dt className="font-semibold">{key.replace(/([A-Z])/g, ' $1')}</dt><dd>{String(value)}</dd></div>)}</dl></details> : null}
          {editor.glassCalcStatus === 'Warning' ? <section className="grid gap-3 rounded-xl border border-violet-300 p-3 dark:border-violet-800"><h4 className="font-bold">Manual geometry override</h4><p className="text-sm">Confirm or edit the accepted values below. A reason is required and hard blockers cannot be overridden.</p><div className="grid gap-2 sm:grid-cols-2">{Object.entries(editor.glassCalc ?? {}).filter(([, value]) => typeof value === 'string' && value).map(([key, value]) => <label className="grid gap-1 text-xs font-semibold" key={key}>{key.replace(/([A-Z])/g, ' $1')}<input className={control} onChange={(event) => setAcceptedValues((current) => ({ ...current, [key]: event.target.value }))} value={String(acceptedValues[key] ?? value)}/></label>)}</div><label className="grid gap-1 text-sm font-semibold">Override Reason<textarea className={`${control} min-h-20 py-2`} onChange={(event) => setOverrideReason(event.target.value)} value={overrideReason}/></label><button className={`${button} border-violet-600 bg-violet-600 text-white`} disabled={isOverridePending || !overrideReason.trim()} onClick={applyOverride} type="button">Apply Manual Override</button></section> : null}
          {editor.glassOverride ? <section className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950"><div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status="Manual Override"/><button className={button} disabled={isOverridePending} onClick={removeOverride} type="button">Remove Override</button></div><p className="mt-2"><strong>Reason:</strong> {editor.glassOverride.reason}</p><p><strong>Approved by:</strong> {editor.glassOverride.appliedByDisplayName ?? editor.glassOverride.appliedByUserId} · {new Date(editor.glassOverride.appliedAt).toLocaleString()}</p></section> : null}
          {editor.glassWorkorderDetail ? <details className="rounded-xl border border-slate-300 p-3 dark:border-slate-700"><summary className="cursor-pointer font-bold">Work-order preview</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{editor.glassWorkorderDetail}</pre></details> : null}
          {editor.vendorCopyText && !['Blocked', 'Glass Detail Needed'].includes(String(editor.glassCalcStatus)) ? <details className="rounded-xl border border-slate-300 p-3 dark:border-slate-700"><summary className="cursor-pointer font-bold">Vendor-copy preview</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{editor.vendorCopyText}</pre><button className={`${button} mt-3`} onClick={copyVendorText} type="button">Copy Vendor Text</button></details> : null}
        </section> : null}

        <details className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="cursor-pointer font-semibold">More Details</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
          {!noJamb ? <><label className="grid gap-1 text-sm font-semibold">Jamb Width{ripMode ? <input className={control} onChange={(event) => set('jambWidth', event.target.value)} placeholder="Completed RIP size" value={String(editor.jambWidth === 'RIP' ? '' : editor.jambWidth ?? '')}/> : <select className={control} onChange={(event) => set('jambWidth', event.target.value)} value={String(editor.jambWidth ?? '')}><option>{mode === 'Exterior' ? `6-9/16"` : `4-9/16"`}</option><option>{mode === 'Exterior' ? `4-9/16"` : `6-9/16"`}</option><option>{`7-1/4"`}</option></select>}</label><label className="flex min-h-12 items-center gap-3 self-end rounded-xl border border-slate-300 px-3 dark:border-slate-600"><input checked={ripMode} onChange={(event) => { setRipMode(event.target.checked); set('ripJamb', event.target.checked ? 'Yes' : ''); if (event.target.checked) set('jambWidth', ''); }} type="checkbox"/>RIP jamb</label><label className="grid gap-1 text-sm font-semibold">Jamb Type<select className={control} onChange={(event) => set('jambType', event.target.value)} value={String(editor.jambType ?? 'Primed')}><option>Primed</option><option>Fir</option>{mode === 'Exterior' ? <><option>Smooth Composite</option><option>Textured Composite</option></> : null}</select></label><label className="grid gap-1 text-sm font-semibold">Hinge Type<select className={control} onChange={(event) => set('hingeType', event.target.value)} value={String(editor.hingeType ?? '')}><option>BB</option><option>REG</option>{mode === 'Exterior' ? <><option>BOM</option><option>NRP</option></> : null}</select></label></> : null}
          {mode === 'Exterior' ? <><label className="grid gap-1 text-sm font-semibold">Material<select className={control} onChange={(event) => set('material', event.target.value)} value={String(editor.material)}><option value="fiberglass">Fiberglass</option><option value="wood">Wood</option></select></label><label className="grid gap-1 text-sm font-semibold">Sill<input className={control} onChange={(event) => set('sill', event.target.value)} value={String(editor.sill ?? '')}/></label><label className="grid gap-1 text-sm font-semibold">Weatherstrip<input className={control} onChange={(event) => set('weatherstrip', event.target.value)} value={String(editor.weatherstrip ?? '')}/></label></> : null}
          <label className="grid gap-1 text-sm font-semibold">Custom Slab / RO<select className={control} onChange={(event) => set('customSlab', event.target.value)} value={String(editor.customSlab ?? 'No')}><option value="No">Standard</option>{!noJamb ? <option value="RO">Custom RO / Cut Down</option> : null}<option disabled={editor.material !== 'wood'} value="WoodCustom">Custom Wood Slab</option></select></label>
          {editor.customSlab === 'WoodCustom' ? <><DimensionInput error={fieldErrors.customSlabWidth} label="Custom Slab Width" onValue={(value) => setDimension('customSlabWidth', value)} required value={String(editor.customSlabWidth ?? '')}/><DimensionInput error={fieldErrors.customSlabHeight} label="Custom Slab Height" onValue={(value) => setDimension('customSlabHeight', value)} required value={String(editor.customSlabHeight ?? '')}/></> : null}
          {config === 'B.P.' ? <label className="grid gap-1 text-sm font-semibold">F.O. Height (only when cutting)<input className={control} onChange={(event) => set('roHeight', event.target.value)} value={String(editor.roHeight ?? '')}/></label> : null}
          <label className="grid gap-1 text-sm font-semibold">Door Thickness<select className={control} onChange={(event) => set('doorThickness', event.target.value)} value={String(editor.doorThickness ?? '')}><option value="">Auto</option><option>1-3/8</option><option>1-3/4</option></select></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Line Notes<textarea className={`${control} min-h-20 py-2`} onChange={(event) => set('notes', event.target.value)} value={String(editor.notes ?? '')}/></label>
        </div></details>
        <div className="mt-4 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800"><span className="font-semibold">Preview:</span> {lineTitle(editor)}</div>
        <div className="mt-4 flex flex-wrap gap-2"><button className={`${button} border-sky-700 bg-sky-700 text-white`} onClick={() => commitEditor(false)} type="button">{editingId ? 'Update Door' : 'Add Door'}</button>{editingId ? <button className={button} onClick={resetEditor} type="button">Cancel Edit</button> : null}</div>
      </>}
      {visibleMessage ? <p aria-live="polite" className={`mt-4 rounded-xl p-3 text-sm ${visibleMessage.error ? 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100' : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'}`} role="status">{visibleMessage.text}</p> : null}
    </div>

    <aside className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-widest text-slate-500">Job Lines</p><h2 className="text-xl font-semibold" id="door-lines-heading">{active.length} active · {archived.length} archived</h2></div>{canEdit ? <button className={button} onClick={merge} type="button">Merge Equivalent</button> : null}</div>
      <p className="mt-3 rounded-xl bg-slate-100 p-3 text-sm dark:bg-slate-800">Shop Hours: {estimate.shopHours ?? '—'} · {estimate.shopHoursSource ?? 'No estimate'}</p>
      <div className="mt-4 grid gap-3">{active.length ? active.map((line, index) => { const attention = glassLineNeedsAttention(line); return <article className="min-w-0 rounded-xl border border-slate-200 p-3 dark:border-slate-700" key={String(line.lineId)}><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{lineTitle(line)}</h3><StatusBadge status={line.glassCalcStatus}/></div><p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Qty {String(line.qty)} · {line.sidelightType ?? 'Door'} · {lineShopHours(line)} shop hrs{line.notes ? ` · ${line.notes}` : ''}</p>{attention.length ? <p className="mt-2 text-sm font-bold text-amber-800 dark:text-amber-200">⚠ Needs Attention</p> : null}{isGlassConfiguration(line.config) ? <><GlassUnitDiagram compact line={line}/>{line.glassWorkorderDetail ? <details className="mt-2 text-sm"><summary className="cursor-pointer font-semibold">Line details</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{line.glassWorkorderDetail}</pre>{line.glassOverride ? <p className="mt-2"><strong>Override:</strong> {line.glassOverride.reason}</p> : null}</details> : null}</> : null}{canEdit ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"><button className={button} onClick={() => adjust(line.lineId, 1)} type="button">+ Qty</button><button className={button} onClick={() => adjust(line.lineId, -1)} type="button">− Qty</button><button className={button} onClick={() => edit(line)} type="button">Edit</button><button className={button} onClick={() => duplicate(line)} type="button">Duplicate</button><button className={button} disabled={index === 0} onClick={() => move(line.lineId, -1)} type="button">Move Up</button><button className={button} disabled={index === active.length - 1} onClick={() => move(line.lineId, 1)} type="button">Move Down</button><button className={`${button} col-span-2 border-rose-300 text-rose-800 dark:text-rose-200 sm:col-span-3`} onClick={() => archive(line.lineId)} type="button">Archive / Remove</button></div> : null}</article>; }) : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No active door lines.</p>}</div>
      <details className="mt-5"><summary className="cursor-pointer font-semibold">Archived Lines ({archived.length})</summary><div className="mt-3 grid gap-3">{archived.length ? archived.map((line) => <article className="rounded-xl border border-slate-200 p-3 opacity-80 dark:border-slate-700" key={String(line.lineId)}><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{lineTitle(line)}</h3><StatusBadge status={line.glassCalcStatus}/></div><p className="mt-1 text-sm">Qty {String(line.qty)} · Archived</p>{isGlassConfiguration(line.config) ? <GlassUnitDiagram compact line={line}/> : null}{canEdit ? <button className={`${button} mt-3`} onClick={() => restore(line.lineId)} type="button">Restore Line</button> : null}</article>) : <p className="text-sm text-slate-500">No archived lines.</p>}</div></details>
    </aside>
  </section>;
}
