'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  DOOR_HEIGHTS, EXTERIOR_WIDTHS, INTERIOR_WIDTHS, J2A_CONFIGS,
  CONFIRMED_JOB_LINE_MESSAGE, calculateJ2AShopHours, defaultDoorLine,
  doorLineEquivalenceKey, jambWidthChoices, normalizeDoorLineInput, prepAfterHeightChange, prepChoices,
} from '@/lib/jobs/door-line-contract';
import {
  calculateGlassGeometry, geometryChanged, glassConfigurationTopology, glassLineNeedsAttention,
  isGlassConfiguration, normalizeSidelightType, retainCompatibleGlassFields, withDerivedGlassGeometry,
} from '@/lib/jobs/glass-geometry-contract';
import { prepareGlassOverrideAction, removeGlassOverrideAction } from '@/lib/jobs/job-intake-actions';
import { formatShopDimension, parseShopDimension, parseStoredShopDimension } from '@/lib/jobs/dimension-contract';
import { canCommitGlassCalculation } from '@/lib/jobs/glass-editor-contract';
import { HINGE_COLOR_OPTIONS, hingeTypeAfterModeChange, hingeTypeOptions, normalizeHingeColor } from '@/lib/jobs/hinge-contract';
import type { DoorLineInput, GlassCalculationStatus, GlassGeometryValues, GlassIssue, JobLifecycleStage } from '@/lib/jobs/job-intake-types';
import { GlassUnitBuilder, initialBuilderDraft } from './GlassUnitBuilder';
import { GlassUnitDiagram } from './GlassUnitDiagram';
import { importedLineRenderKey } from '@/lib/jobs/legacy-transfer-review-presentation';
import { changeSizingMode, createNewDoorSession, isSameDoorMode, newDoorFromSession, rememberNewDoor, duplicateDoorLine, replaceDoorLineById } from '@/lib/jobs/door-line-editor-state';
import { CUSTOM_DD_REQUIRED, customDoubleDoorSlabs, PATIO_DOOR_PRESETS, patioSizingAvailable, withPatioPreset } from '@/lib/jobs/double-door-sizing-contract';
import { CONSTRUCTIONS, normalizeConstruction, isFourSideJamb } from '@/lib/jobs/construction-contract';
import { usesCustomRo } from '@/lib/jobs/custom-ro-contract';
import { calculateNonGlassFrameCut, usesAutomaticCustomSlabRoWidth } from '@/lib/jobs/non-glass-frame-cut-contract';
import { hasDoubleDoorCore, DEFAULT_DOUBLE_DOOR_ASTRAGAL, DOUBLE_DOOR_ASTRAGALS, type DoubleDoorAstragalType } from '@/lib/jobs/double-door-astragal-contract';

const control = 'min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950';
const button = 'min-h-9 rounded-md border border-slate-300 px-2 text-sm font-semibold dark:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50';
const geometryFields = new Set(['construction', 'doubleDoorSizing', 'doubleDoorAstragal', 'config', 'width', 'height', 'customSlab', 'customSlabWidth', 'customSlabHeight', 'hand', 'roWidth', 'roHeight', 'material', 'sidelightType', 'sidelightGlass', 'transomGlass', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight']);

function lineTitle(line: DoorLineInput): string {
  const custom = customDoubleDoorSlabs(line.doubleDoorSizing);
  if (custom) return [line.mode, line.doorType || 'TBD', line.config, `Active: ${formatShopDimension(custom.activeWidth)} x ${formatShopDimension(custom.height)}; Inactive: ${formatShopDimension(custom.inactiveWidth)} x ${formatShopDimension(custom.height)}`, line.hand, line.jambWidth].filter(Boolean).join(' | ');
  if (line.doubleDoorSizing?.kind === 'patio') {
    const preset = PATIO_DOOR_PRESETS[line.doubleDoorSizing.preset];
    return [line.mode, line.doorType || 'TBD', `Patio Door Replacement / ${line.doubleDoorSizing.preset}'`, `2 @ ${formatShopDimension(preset.activeWidth)} x ${formatShopDimension(preset.height)}`, line.hand, line.jambWidth].filter(Boolean).join(' | ');
  }
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
  return <section aria-label={label} className={`rounded-xl border p-3 ${blocker ? 'border-rose-400 bg-rose-50 text-rose-950 dark:bg-rose-950 dark:text-rose-100' : 'border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`}><p className="font-bold">{blocker ? '⛔' : '⚠'} {label}</p><ul className="mt-1 list-disc pl-5 text-sm">{issues.map((entry, index) => <li key={`${entry.code}:${entry.message}:${index}`}>{entry.message}</li>)}</ul></section>;
}

function lineShopHours(line: DoorLineInput): string {
  return String(calculateJ2AShopHours([{ ...line, lineStatus: 'Active' }]).shopHours ?? '—');
}

function DimensionInput({ different, label, required = false, value, error, onValue }: { different?: boolean; label: string; required?: boolean; value: string; error?: string; onValue: (value: string) => void }) {
  return <label className="grid gap-1 text-sm font-semibold">{label}{required ? ' *' : ''}<span className="relative block"><input data-comparison-different={different || undefined} aria-invalid={Boolean(error)} aria-label={`${label}, inches`} className={`${control} pr-9 font-mono`} inputMode="decimal" onChange={(event) => onValue(event.target.value)} placeholder="54 or 54 1/2" value={value}/><span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base font-bold">&quot;</span></span>{error ? <span className="text-xs text-rose-700 dark:text-rose-300">{error}</span> : <span className="text-xs font-normal text-slate-500">Inches: 54, 54 1/2, 54-1/2, or 54.5</span>}</label>;
}

function CustomRoSummary({ line }: { line: DoorLineInput }) {
  if (!isFourSideJamb(line) && !usesCustomRo(line) && !usesAutomaticCustomSlabRoWidth(line) && line.doubleDoorSizing?.kind !== 'custom-slabs') return null;
  const result = calculateNonGlassFrameCut(line);
  return <section aria-label={usesCustomRo(line) ? 'Custom RO sizing' : 'Custom slab sizing'} className="mt-1.5 grid gap-1 text-sm leading-snug [&>section]:rounded-md [&>section]:p-2">
    {result.detailLines.length ? <p>{result.detailLines.join(' | ')}</p> : null}
    <Issues issues={result.warnings} label="Cut-down instructions / review"/>
    <Issues blocker issues={result.blockers} label={usesCustomRo(line) ? 'RO sizing blockers' : 'Custom slab sizing blockers'}/>
  </section>;
}

function storedShopInput(value: unknown): string {
  if (value === null || value === undefined || String(value).trim() === '') return '';
  const parsed = parseStoredShopDimension(value);
  return parsed.ok ? parsed.formatted.slice(0, -1) : String(value);
}

export function DoorLineWorkspace({ lines, onChange, onUnappliedChange, canEdit, hingeColor = '', onHingeColorChange, lifecycleStage }: {
  lines: DoorLineInput[];
  onChange: (lines: DoorLineInput[]) => void;
  onUnappliedChange?: (dirty: boolean) => void;
  canEdit: boolean;
  hingeColor?: string;
  onHingeColorChange?: (value: string) => void;
  lifecycleStage: JobLifecycleStage;
}) {
  const newDoorSession = useRef(createNewDoorSession());
  const [editor, setEditor] = useState<DoorLineInput>(() => defaultDoorLine('Exterior'));
  const [editorBaseline, setEditorBaseline] = useState(() => JSON.stringify(defaultDoorLine('Exterior')));
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const [workspacePane, setWorkspacePane] = useState<'input' | 'lines'>('input');
  const [ripMode, setRipMode] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string; lifecycleStage: JobLifecycleStage } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [acceptedValues, setAcceptedValues] = useState<GlassGeometryValues>({});
  const [, setCalculationStatus] = useState<GlassCalculationStatus | 'Incomplete' | null>(null);
  const [explicitGlassDetailNeeded, setExplicitGlassDetailNeeded] = useState(false);
  const [isOverridePending, startOverrideTransition] = useTransition();
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = lines.filter((line) => (line.lineStatus ?? 'Active') === 'Active');
  const archived = lines.filter((line) => line.lineStatus === 'Archived');
  const estimate = useMemo(() => calculateJ2AShopHours(lines), [lines]);
  const mode = editor.mode === 'Interior' ? 'Interior' : 'Exterior';
  const config = String(editor.config ?? 'D');
  const isGlass = mode === 'Exterior' && isGlassConfiguration(config);
  const staffConfiguration = isGlass ? 'With Glass' : config;
  const patio = editor.doubleDoorSizing?.kind === 'patio' ? editor.doubleDoorSizing.preset : null;
  const customDD = hasDoubleDoorCore(config) && (editor.customSlab === 'WoodCustom' || editor.customSlab === 'Yes');
  const customSizing = editor.doubleDoorSizing?.kind === 'custom-slabs' ? editor.doubleDoorSizing : null;
  const noJamb = mode === 'Interior' && (config === 'PKT' || config === 'B.P.');
  const widths = mode === 'Interior' ? INTERIOR_WIDTHS : EXTERIOR_WIDTHS;
  const visibleMessage = message?.lifecycleStage === lifecycleStage ? message : null;
  const glassPresentation = isGlass ? withDerivedGlassGeometry(editor) : editor;

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

  useEffect(() => {
    onUnappliedChange?.(JSON.stringify(editor) !== editorBaseline);
  }, [editor, editorBaseline, onUnappliedChange]);

  useEffect(() => () => onUnappliedChange?.(false), [onUnappliedChange]);

  function clearCalculated(next: DoorLineInput): DoorLineInput {
    return { ...next, glassCalcStatus: isGlassConfiguration(next.config) ? 'Ready' : 'Not Needed', glassCalc: null, glassOverride: null, glassWarnings: [], glassBlockers: [], glassUnits: [], panelSidelights: [], glassWorkorderDetail: null, vendorCopyText: null };
  }

  function set(name: string, value: unknown) {
    if (name === 'doorType' || name === 'hingeType' || name === 'construction') newDoorSession.current = rememberNewDoor(newDoorSession.current, { ...editor, [name]: value }, editingLineId);
    if (geometryFields.has(name)) setExplicitGlassDetailNeeded(false);
    setEditor((current) => {
      const next = name === 'customSlab' ? changeSizingMode(current, value as 'No' | 'WoodCustom' | 'RO') : { ...current, [name]: value };
      return geometryFields.has(name) && geometryChanged(current, next) ? clearCalculated(next) : next;
    });
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      if (name === 'customSlab') { delete next.roWidth; delete next.roHeight; }
      return next;
    });
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

  function setHeight(value: string) {
    newDoorSession.current = rememberNewDoor(newDoorSession.current, { ...editor, height: value }, editingLineId);
    setEditor((current) => clearCalculated({
      ...current,
      height: value,
      prep: prepAfterHeightChange(current.mode === 'Interior' ? 'Interior' : 'Exterior', String(current.config), current.prep, value),
    }));
    setExplicitGlassDetailNeeded(false);
    setCalculationStatus(null);
    clearWorkspaceMessage();
  }

  function setSwing(value: string) {
    setExplicitGlassDetailNeeded(false);
    set('hand', value);
  }

  function confirmsGlassDiscard(): boolean {
    const hasData = isGlassConfiguration(editor.config) && Boolean(
      editor.roWidth || editor.roHeight || editor.glassCalc || editor.glassUnits?.length ||
      editor.panelSidelights?.length || editor.transomGlass || editor.sidelightGlass || editor.glassOverride,
    );
    return !hasData || window.confirm('Discard the configured sidelights, transom, RO and calculated glass data?');
  }

  function chooseMode(nextMode: 'Interior' | 'Exterior') {
    if (isSameDoorMode(editor, nextMode)) return;
    if (!confirmsGlassDiscard()) return;
    newDoorSession.current = rememberNewDoor(newDoorSession.current, editor, editingLineId);
    if (editingLineId === null) newDoorSession.current = { ...newDoorSession.current, mode: nextMode };
    setEditor((current) => {
      const defaults = editingLineId === null ? newDoorFromSession(newDoorSession.current, nextMode) : defaultDoorLine(nextMode);
      return { ...defaults, lineId: current.lineId, lineIndex: current.lineIndex, lineStatus: current.lineStatus, qty: current.qty, notes: current.notes, ...(editingLineId !== null ? { doorType: current.doorType, hingeType: hingeTypeAfterModeChange(nextMode, 'D', current.hingeType) } : {}) };
    }); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
  }

  function chooseStaffConfiguration(value: string) {
    if (value === 'With Glass') {
      const next = retainCompatibleGlassFields(patio ? withPatioPreset(editor, null) : editor, 'SD', 'Glass');
      setEditor(initialBuilderDraft(next));
      setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
      return;
    }
    chooseConfig(value);
  }

  function chooseConfig(nextConfig: string) {
    if (isGlassConfiguration(config) && !isGlassConfiguration(nextConfig) && !confirmsGlassDiscard()) return;
    const previouslyApplicable = mode === 'Exterior' && isGlassConfiguration(config);
    const nextApplicable = mode === 'Exterior' && isGlassConfiguration(nextConfig);
    let next = mode === 'Exterior'
      ? retainCompatibleGlassFields(editor, nextConfig, isGlassConfiguration(nextConfig) && glassConfigurationTopology(nextConfig).sidelightPositions.length ? (normalizeSidelightType(editor.sidelightType) ?? 'Glass') : null)
      : { ...editor, config: nextConfig };
    next.includeDiagramOnWorkOrder = nextApplicable ? (previouslyApplicable ? editor.includeDiagramOnWorkOrder !== false : true) : false;
    next.prep = prepChoices(mode, nextConfig)[0] ?? '';
    if (mode === 'Interior' && (nextConfig === 'PKT' || nextConfig === 'B.P.')) {
      next = { ...next, hand: '', jambWidth: '', jambType: '', hingeType: '', ripJamb: '', customSlab: 'No', customSlabWidth: '', customSlabHeight: '' };
      setRipMode(false);
    }
    setEditor(nextApplicable ? initialBuilderDraft(next) : next); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
  }

  function choosePatio(preset: '5' | '6' | null) {
    setEditor((current) => clearCalculated(withPatioPreset(current, preset)));
    setFieldErrors({}); setCalculationStatus(null); clearWorkspaceMessage();
  }

  function resetEditor() {
    const next = newDoorFromSession(newDoorSession.current); setEditor(next); setEditorBaseline(JSON.stringify(next)); setEditingLineId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
  }

  function commitEditor(detailNeeded = explicitGlassDetailNeeded, submittedEditor: DoorLineInput = editor): boolean {
    if (submittedEditor === editor && Object.values(fieldErrors).some(Boolean)) {
      clearMessageTimer(); setMessage({ error: true, text: Object.values(fieldErrors)[0], lifecycleStage }); return false;
    }
    const candidate = { ...submittedEditor, lineId: submittedEditor.lineId ?? globalThis.crypto.randomUUID(), lineStatus: 'Active' as const };
    const normalized = normalizeDoorLineInput(candidate);
    if (!normalized.ok) {
      const special = lifecycleStage === 'Confirmed Job' && editingLineId !== null && active.length === 1 ? CONFIRMED_JOB_LINE_MESSAGE : Object.values(normalized.fieldErrors)[0] ?? normalized.message;
      setFieldErrors(normalized.fieldErrors);
      clearMessageTimer();
      setMessage({ error: true, text: special, lifecycleStage });
      return false;
    }
    if (!canCommitGlassCalculation(normalized.value.glassCalcStatus ?? 'Ready', detailNeeded)) {
      clearMessageTimer(); setMessage({ error: true, text: 'Required glass detail is incomplete. Use Leave Glass Detail Needed to preserve the line.', lifecycleStage }); return false;
    }
    if (detailNeeded && normalized.value.glassCalcStatus !== 'Glass Detail Needed') {
      clearMessageTimer(); setMessage({ error: true, text: 'Leave Glass Detail Needed is available only while required glass information is missing.', lifecycleStage }); return false;
    }
    const saved = { ...candidate, ...normalized.value };
    if (editingLineId !== null) onChange(replaceDoorLineById(lines, editingLineId, saved));
    else onChange([...lines, saved]);
    showTransientMessage({ error: false, text: editingLineId !== null ? 'Door line updated. Save the job to persist it.' : 'Door line added. Save the job to persist it.' });
    newDoorSession.current = rememberNewDoor(newDoorSession.current, submittedEditor, editingLineId);
    const nextEditor = newDoorFromSession(newDoorSession.current); setEditor(nextEditor); setEditorBaseline(JSON.stringify(nextEditor)); setEditingLineId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setAcceptedValues({}); setCalculationStatus(null); setExplicitGlassDetailNeeded(false);
    return true;
  }

  function edit(line: DoorLineInput) {
    if (typeof line.lineId !== 'string' || !line.lineId) { showTransientMessage({ error: true, text: 'This door line has no stable identity. Reload and review the job.' }); return; }
    newDoorSession.current = rememberNewDoor(newDoorSession.current, editor, editingLineId);
    const editable = isGlassConfiguration(line.config) ? initialBuilderDraft(line) : structuredClone(line);
    for (const name of ['roWidth', 'roHeight', 'customSlabWidth', 'customSlabHeight', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight'] as const) editable[name] = storedShopInput(editable[name]);
    setEditor(editable); setEditorBaseline(JSON.stringify(editable)); setEditingLineId(line.lineId); setRipMode(String(line.ripJamb ?? '').toLowerCase() === 'yes'); setCalculationStatus(null);
    setFieldErrors({}); setOverrideReason(line.glassOverride?.reason ?? ''); setAcceptedValues(line.glassOverride?.acceptedValues ?? line.glassCalc ?? {}); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
    setWorkspacePane('input');
  }

  function duplicate(line: DoorLineInput) {
    const duplicateLine = duplicateDoorLine(line, globalThis.crypto.randomUUID(), lines.length + 1);
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
      if (!keeper) keepers.set(key, line); else { keeper.qty = Number(keeper.qty) + Number(line.qty); keeper.includeDiagramOnWorkOrder = keeper.includeDiagramOnWorkOrder !== false || line.includeDiagramOnWorkOrder !== false; line.lineStatus = 'Merged'; count += 1; }
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

  return <section className="door-line-workbench grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]" aria-labelledby="door-lines-heading" data-workspace-pane={workspacePane}>
    <div aria-label="Door workspace view" className="door-workspace-switcher" role="group">
      <button aria-controls="door-input-pane" aria-pressed={workspacePane === 'input'} onClick={() => setWorkspacePane('input')} type="button">Door Input</button>
      <button aria-controls="job-lines-pane" aria-pressed={workspacePane === 'lines'} onClick={() => setWorkspacePane('lines')} type="button">Job Lines ({active.length})</button>
    </div>
    <div className="door-input-pane min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900" id="door-input-pane">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div><p className="text-[10px] font-bold uppercase leading-3 tracking-wide text-slate-500">Door editor</p><h2 className="text-base font-semibold leading-6">{editingLineId !== null ? 'Edit Door Line' : 'Add Door Line'}</h2></div>
        {canEdit ? <div className="inline-flex w-fit shrink-0 rounded-md border border-slate-300 p-0.5 dark:border-slate-600" aria-label="Door mode" role="group">{(['Exterior', 'Interior'] as const).map((value) => <button aria-pressed={mode === value} className={`${button} border-transparent ${mode === value ? 'bg-sky-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`} key={value} onClick={() => chooseMode(value)} type="button">{value}</button>)}</div> : null}
      </div>
      {!canEdit ? <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">Door lines and geometry are read-only with jobs = view.</p> : <>
        <div className="door-primary-grid mt-2 grid gap-2 sm:grid-cols-3 2xl:grid-cols-4">
          <label className="grid gap-1 text-sm font-semibold">Door Type<input className={control} onChange={(event) => set('doorType', event.target.value)} value={String(editor.doorType ?? '')}/></label>
          {mode === 'Exterior'
            ? <label className="grid gap-1 text-sm font-semibold">Configuration<span className="flex min-w-0 gap-1"><select className={control} onChange={(event) => chooseStaffConfiguration(event.target.value)} value={staffConfiguration}><option value="D">D</option><option value="DD">DD</option><option value="With Glass">With Glass</option></select></span></label>
            : <label className="grid gap-1 text-sm font-semibold">Configuration<select className={control} onChange={(event) => chooseConfig(event.target.value)} value={config}>{J2A_CONFIGS[mode].map((value) => <option key={value}>{value}</option>)}</select></label>}
          {patioSizingAvailable(editor) ? <label className="grid gap-1 text-sm font-semibold">DD Sizing<select className={control} onChange={(event) => choosePatio(event.target.value === "standard" ? null : event.target.value as "5" | "6")} value={patio ?? "standard"}><option value="standard">Standard DD</option><option value="5">Patio Door Replacement / 5&apos;</option><option value="6">Patio Door Replacement / 6&apos;</option></select></label> : null}
          {patio ? <p className="text-sm">Factory slabs: 2 @ {formatShopDimension(PATIO_DOOR_PRESETS[patio].activeWidth)} x {formatShopDimension(PATIO_DOOR_PRESETS[patio].height)}. Reference opening: {PATIO_DOOR_PRESETS[patio].referenceWidth}&quot; x 80&quot;.</p> : <>
          <label className="grid gap-1 text-sm font-semibold">Width<select className={control} onChange={(event) => set('width', event.target.value)} value={String(editor.width)}>{widths.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Height<select className={control} onChange={(event) => setHeight(event.target.value)} value={String(editor.height)}>{DOOR_HEIGHTS.map((value) => <option key={value}>{value}</option>)}</select></label>
          </>}
          {!noJamb ? <label className="grid gap-1 text-sm font-semibold">Swing<select className={control} onChange={(event) => setSwing(event.target.value)} value={String(editor.hand ?? '')}>{mode === 'Interior' && config === 'DD' ? <option value="">No handing</option> : null}<option>LH</option><option>RH</option>{mode === 'Exterior' || normalizeConstruction(editor.construction) === 'low-profile-quarter-sill' ? <><option>LHOUT</option><option>RHOUT</option></> : null}</select></label> : null}
          {mode === 'Exterior' && config === 'DD' ? <label className="grid gap-1 text-sm font-semibold">Astragal<select className={control} onChange={(event) => set('doubleDoorAstragal', event.target.value as DoubleDoorAstragalType)} value={String(editor.doubleDoorAstragal ?? DEFAULT_DOUBLE_DOOR_ASTRAGAL)}>{Object.entries(DOUBLE_DOOR_ASTRAGALS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label> : null}
          <label className="grid gap-1 text-sm font-semibold">Prep<select className={control} onChange={(event) => set('prep', event.target.value)} value={String(editor.prep ?? '')}>{prepChoices(mode, config).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Quantity<input className={control} min="1" onChange={(event) => set('qty', event.target.value)} step="1" type="number" value={String(editor.qty ?? 1)}/></label>
        </div>

        <div className="door-production-grid mt-2 grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3 2xl:grid-cols-4" aria-label="Door production configuration">
          {!noJamb ? <><label className="grid gap-1 text-sm font-semibold">Jamb Width<select aria-label="Jamb Width" className={control} onChange={(event) => { const rip = event.target.value === 'RIP'; setRipMode(rip); set('ripJamb', rip ? 'Yes' : ''); set('jambWidth', rip ? '' : event.target.value); }} value={ripMode ? 'RIP' : String(editor.jambWidth ?? '')}>{jambWidthChoices(mode).map((value) => <option key={value} value={value}>{value}</option>)}<option value="RIP">RIP jamb</option></select>{ripMode ? <><span className="text-xs font-semibold">Rip to</span><input aria-label="Rip to" className={control} onChange={(event) => set('jambWidth', event.target.value)} placeholder="Completed RIP size" value={String(editor.jambWidth === 'RIP' ? '' : editor.jambWidth ?? '')}/></> : null}</label><label className="grid gap-1 text-sm font-semibold">Jamb Type<select className={control} onChange={(event) => set('jambType', event.target.value)} value={String(editor.jambType ?? 'Primed')}><option>Primed</option><option>Fir</option>{mode === 'Exterior' ? <><option>Smooth Composite</option><option>Textured Composite</option></> : null}</select></label><label className="grid gap-1 text-sm font-semibold">Hinge Type<select className={control} onChange={(event) => set('hingeType', event.target.value)} value={String(editor.hingeType ?? 'REG')}>{hingeTypeOptions(mode).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">Hinge Color<select className={control} disabled={!canEdit || !onHingeColorChange} onChange={(event) => onHingeColorChange?.(event.target.value)} value={hingeColor}>{!normalizeHingeColor(hingeColor).ok ? <option disabled value={hingeColor}>Invalid saved value — choose a valid finish</option> : null}{HINGE_COLOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></> : null}
          {mode === 'Exterior' ? <><label className="grid gap-1 text-sm font-semibold">Material<select className={control} onChange={(event) => set('material', event.target.value)} value={String(editor.material)}><option value="fiberglass">Fiberglass</option><option value="wood">Wood</option></select></label><label className="grid gap-1 text-sm font-semibold">Sill<input className={control} onChange={(event) => set('sill', event.target.value)} value={String(editor.sill ?? '')}/></label><label className="grid gap-1 text-sm font-semibold">Weatherstrip<input className={control} onChange={(event) => set('weatherstrip', event.target.value)} value={String(editor.weatherstrip ?? '')}/></label></> : null}
          {!noJamb ? <label className="grid gap-1 text-sm font-semibold">Construction<select className={control} onChange={(event) => set('construction', event.target.value)} value={normalizeConstruction(editor.construction)}>{Object.entries(CONSTRUCTIONS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label> : null}
          {!patio ? <fieldset className="flex flex-wrap items-center gap-2 text-sm"><legend className="font-semibold">Sizing Adjustments</legend>{([['WoodCustom', 'Custom Slab'], ['RO', 'Fit to RO']] as const).map(([value, label]) => {
            const enabled = value === 'WoodCustom' ? editor.customSlab === 'WoodCustom' || editor.customSlab === 'Yes' : editor.customSlab === 'RO';
            return <button key={value} role="switch" aria-label={label} aria-checked={enabled} disabled={!enabled && (value === 'RO' ? noJamb : !hasDoubleDoorCore(config) && editor.material !== 'wood')} className={button + (enabled ? ' border-sky-700 bg-sky-700 text-white' : '')} onClick={() => set('customSlab', enabled ? 'No' : value)} type="button">{label} <span className="text-xs font-bold">{enabled ? 'ON' : 'OFF'}</span></button>;
          })}</fieldset> : null}
          {customDD ? <>
            {([['activeWidth', 'Active Slab Width'], ['inactiveWidth', 'Inactive Slab Width'], ['height', 'Slab Height']] as const).map(([field, label]) => <DimensionInput key={field} label={label} required value={String(customSizing?.[field] ?? '')} onValue={(value) => set('doubleDoorSizing', { kind: 'custom-slabs', activeWidth: customSizing?.activeWidth ?? '', inactiveWidth: customSizing?.inactiveWidth ?? '', height: customSizing?.height ?? '', [field]: value })}/>)}
            {!customDoubleDoorSlabs(customSizing) ? <p className="text-xs text-amber-800" role="status">{CUSTOM_DD_REQUIRED}</p> : null}
          </> : null}
          {!patio && !customDD && editor.customSlab === 'WoodCustom' ? <><DimensionInput error={fieldErrors.customSlabWidth} label="Custom Slab Width" onValue={(value) => setDimension('customSlabWidth', value)} required value={String(editor.customSlabWidth ?? '')}/><DimensionInput error={fieldErrors.customSlabHeight} label="Custom Slab Height" onValue={(value) => setDimension('customSlabHeight', value)} required value={String(editor.customSlabHeight ?? '')}/></> : null}
          {config === 'B.P.' ? <label className="grid gap-1 text-sm font-semibold">F.O. Height (only when cutting)<input className={control} onChange={(event) => set('roHeight', event.target.value)} value={String(editor.roHeight ?? '')}/></label> : null}
          <label className="grid gap-1 text-sm font-semibold">Door Thickness<select className={control} onChange={(event) => set('doorThickness', event.target.value)} value={String(editor.doorThickness ?? '')}><option value="">Auto</option><option>1-3/8</option><option>1-3/4</option></select></label>
        {usesCustomRo(editor) ? <div className="contents" aria-label="Custom RO dimensions">
          <DimensionInput error={fieldErrors.roWidth} label="RO Width" onValue={(value) => setDimension('roWidth', value)} value={String(editor.roWidth ?? '')}/>
          <DimensionInput error={fieldErrors.roHeight} label="RO Height" onValue={(value) => setDimension('roHeight', value)} value={String(editor.roHeight ?? '')}/>
        </div> : null}
        </div>
        {isGlass ? <GlassUnitBuilder key={editingLineId ?? 'new-door'} embedded line={editor} onInlineChange={(next) => { setEditor(next); setFieldErrors({}); setCalculationStatus(null); clearWorkspaceMessage(); }} onCancel={resetEditor} onUse={(next, detailNeeded) => commitEditor(detailNeeded, next)} showCommitActions={false}/> : null}
        {isGlass && (glassPresentation.glassCalcStatus === 'Warning' || editor.glassOverride) ? <section className="mt-2 grid gap-1.5 rounded-md border border-sky-200 bg-sky-50/50 p-2 dark:border-sky-900 dark:bg-sky-950/30">
          {glassPresentation.glassCalcStatus === 'Warning' ? <section className="grid gap-3 rounded-xl border border-violet-300 p-3 dark:border-violet-800"><h4 className="font-bold">Manual geometry override</h4><p className="text-sm">Confirm or edit the accepted values below. A reason is required and hard blockers cannot be overridden.</p><div className="grid gap-2 sm:grid-cols-2">{Object.entries(glassPresentation.glassCalc ?? {}).filter(([, value]) => typeof value === 'string' && value).map(([key, value]) => <label className="grid gap-1 text-xs font-semibold" key={key}>{key.replace(/([A-Z])/g, ' $1')}<input className={control} onChange={(event) => setAcceptedValues((current) => ({ ...current, [key]: event.target.value }))} value={String(acceptedValues[key] ?? value)}/></label>)}</div><label className="grid gap-1 text-sm font-semibold">Override Reason<textarea className={`${control} min-h-20 py-2`} onChange={(event) => setOverrideReason(event.target.value)} value={overrideReason}/></label><button className={`${button} border-violet-600 bg-violet-600 text-white`} disabled={isOverridePending || !overrideReason.trim()} onClick={applyOverride} type="button">Apply Manual Override</button></section> : null}
          {editor.glassOverride ? <section className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-sm dark:border-violet-800 dark:bg-violet-950"><div className="flex flex-wrap items-center justify-between gap-2"><StatusBadge status="Manual Override"/><button className={button} disabled={isOverridePending} onClick={removeOverride} type="button">Remove Override</button></div><p className="mt-2"><strong>Reason:</strong> {editor.glassOverride.reason}</p><p><strong>Approved by:</strong> {editor.glassOverride.appliedByDisplayName ?? editor.glassOverride.appliedByUserId} · {new Date(editor.glassOverride.appliedAt).toLocaleString()}</p></section> : null}
        </section> : null}

        <CustomRoSummary line={editor}/>
          <label className="door-line-notes grid gap-1 text-sm font-semibold sm:col-span-3 2xl:col-span-4">Line Notes<textarea className={`${control} door-line-notes-control h-10 min-h-10 resize-y py-1.5`} onChange={(event) => set('notes', event.target.value)} rows={2} value={String(editor.notes ?? '')}/></label>
        <div className="door-input-local-footer mt-2">
          <div className="door-input-preview text-xs"><span className="font-semibold">Preview:</span> {lineTitle(editor)}</div>
          <div className="door-input-local-actions flex flex-wrap gap-2">{isGlass && glassPresentation.glassCalcStatus === 'Glass Detail Needed' ? <button className={`${button} border-amber-600`} onClick={() => commitEditor(true)} type="button">Leave Glass Detail Needed</button> : null}<button className={`${button} border-sky-700 bg-sky-700 text-white`} onClick={() => commitEditor()} type="button">{editingLineId !== null ? 'Update Door' : 'Add Door'}</button>{editingLineId !== null ? <button className={button} onClick={resetEditor} type="button">Cancel Edit</button> : null}</div>
        </div>
      </>}
      {visibleMessage ? <p aria-live="polite" className={`mt-4 rounded-xl p-3 text-sm ${visibleMessage.error ? 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100' : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'}`} role="status">{visibleMessage.text}</p> : null}
    </div>

    <aside className="job-lines-pane min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900" id="job-lines-pane">
      <div className="flex flex-wrap items-center justify-between gap-1.5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Job Lines</p><h2 className="text-base font-semibold" id="door-lines-heading">{active.length} active · {archived.length} archived</h2></div>{canEdit ? <button className={button} onClick={merge} type="button">Merge Equivalent</button> : null}</div>
      <p className="mt-1.5 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">Shop Hours: {estimate.shopHours ?? '—'} · {estimate.shopHoursSource ?? 'No estimate'}</p>
      <div className="mt-2 grid gap-2">{active.length ? active.map((line, index) => { const presentedLine = withDerivedGlassGeometry(line); const attention = glassLineNeedsAttention(presentedLine); return <article className="job-line-card min-w-0 rounded-md border border-slate-200 p-2 dark:border-slate-700" key={importedLineRenderKey(line, index)}><div className="flex flex-wrap items-start justify-between gap-1"><h3 className="line-clamp-2 text-sm font-semibold leading-tight">{lineTitle(line)}</h3><StatusBadge status={presentedLine.glassCalcStatus}/></div><p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300" title={line.notes ?? undefined}>{`Qty ${String(line.qty)} · ${line.sidelightType ?? 'Door'} · ${lineShopHours(line)} shop hrs${line.notes ? ` · ${line.notes}` : ''}`}</p>{attention.length ? <p className="mt-1 text-xs font-bold text-amber-800 dark:text-amber-200">⚠ Needs Attention</p> : null}{isGlassConfiguration(line.config) ? <div className="job-line-glass-summary"><GlassUnitDiagram compact line={presentedLine}/>{presentedLine.glassWorkorderDetail ? <details className="text-xs"><summary className="cursor-pointer font-semibold">Line details</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{presentedLine.glassWorkorderDetail}</pre>{presentedLine.glassOverride ? <p className="mt-1"><strong>Override:</strong> {presentedLine.glassOverride.reason}</p> : null}</details> : null}</div> : null}<CustomRoSummary line={line}/>{canEdit ? <div className="job-line-actions mt-1.5 flex flex-wrap gap-1"><button className={button} onClick={() => adjust(line.lineId, 1)} type="button">+ Qty</button><button className={button} onClick={() => adjust(line.lineId, -1)} type="button">− Qty</button><button className={button} onClick={() => edit(line)} type="button">Edit</button><button className={button} onClick={() => duplicate(line)} type="button">Duplicate</button><button className={button} disabled={index === 0} onClick={() => move(line.lineId, -1)} type="button">Move Up</button><button className={button} disabled={index === active.length - 1} onClick={() => move(line.lineId, 1)} type="button">Move Down</button><button className={`${button} border-rose-400 text-rose-800 dark:text-rose-200`} onClick={() => archive(line.lineId)} type="button">Archive / Remove</button></div> : null}</article>; }) : <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No active door lines.</p>}</div>
      <details className="mt-5"><summary className="cursor-pointer font-semibold">Archived Lines ({archived.length})</summary><div className="mt-3 grid gap-3">{archived.length ? archived.map((line, index) => <article className="rounded-xl border border-slate-200 p-3 opacity-80 dark:border-slate-700" key={importedLineRenderKey(line, index)}><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{lineTitle(line)}</h3><StatusBadge status={line.glassCalcStatus}/></div><p className="mt-1 text-sm">Qty {String(line.qty)} · Archived</p>{isGlassConfiguration(line.config) ? <GlassUnitDiagram compact line={line}/> : null}{canEdit ? <button className={`${button} mt-3`} onClick={() => restore(line.lineId)} type="button">Restore Line</button> : null}</article>) : <p className="text-sm text-slate-500">No archived lines.</p>}</div></details>
    </aside>
  </section>;
}
