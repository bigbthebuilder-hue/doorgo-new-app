'use client';

import { changeSupplyType, isSlabOnly, preparationDisplay } from '../../lib/jobs/slab-only-contract';
import { intakeDraftReady, intakeChangeText, type IntakeChange, type IntakeMutation } from '@/lib/jobs/mobile-intake';
import { MobileIntakeSection, usePhoneIntake } from './MobileIntakeSection';
import { showsMagCatch } from '@/lib/jobs/interior-dd-presentation';
import { customSlabAxis, hasCustomSlabAxis, selectSlabAxis, type SlabAxis } from '@/lib/jobs/slab-sizing-contract';
import { statusLabel, hasVisibleStatus } from '@/lib/jobs/status-presentation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useEditedField } from './useEditedField';
import { DimensionInput } from './DimensionInput';
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
import { reconcileGlassDoorSetupChange } from '@/lib/jobs/glass-dimension-reconciliation-contract';
import { HINGE_COLOR_OPTIONS, hingeTypeAfterModeChange, hingeTypeOptions, normalizeHingeColor } from '@/lib/jobs/hinge-contract';
import type { DoorLineInput, GlassCalculationStatus, GlassIssue, JobLifecycleStage } from '@/lib/jobs/job-intake-types';
import { GlassUnitBuilder, initialBuilderDraft } from './GlassUnitBuilder';
import { GlassUnitDiagram } from './GlassUnitDiagram';
import { importedLineRenderKey } from '@/lib/jobs/legacy-transfer-review-presentation';
import { changeSizingMode, newIntakeDoor, createNewDoorSession, isSameDoorMode, newDoorFromSession, rememberNewDoor, duplicateDoorLine, lastActiveDoorBaseline, replaceDoorLineById } from '@/lib/jobs/door-line-editor-state';
import { CUSTOM_DD_REQUIRED, customDoubleDoorSlabs, PATIO_DOOR_PRESETS, patioSizingAvailable, withPatioPreset } from '@/lib/jobs/double-door-sizing-contract';
import { SILL_CHOICES, sillChoice, withSillChoice, type SillChoice, normalizeConstruction, isFourSideJamb } from '@/lib/jobs/construction-contract';
import { usesCustomRo } from '@/lib/jobs/custom-ro-contract';
import { calculateNonGlassFrameCut, usesAutomaticCustomSlabRoWidth } from '@/lib/jobs/non-glass-frame-cut-contract';
import { hasDoubleDoorCore, DEFAULT_DOUBLE_DOOR_ASTRAGAL, DOUBLE_DOOR_ASTRAGALS, type DoubleDoorAstragalType, normalizeDoubleDoorAstragal } from '@/lib/jobs/double-door-astragal-contract';

const control = 'min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950';
const button = 'min-h-9 rounded-md border border-slate-300 px-2 text-sm font-semibold dark:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50';
const geometryFields = new Set(['sill', 'construction', 'doubleDoorSizing', 'doubleDoorAstragal', 'config', 'width', 'height', 'customSlab', 'customSlabWidth', 'customSlabHeight', 'hand', 'roWidth', 'roHeight', 'material', 'sidelightType', 'sidelightGlass', 'transomGlass', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight']);

function lineTitle(line: DoorLineInput): string {
  if (isSlabOnly(line)) return [line.mode, line.doorType || 'TBD', `${line.width} × ${line.height}`, 'SLAB ONLY', line.hand].filter(Boolean).join(' · ');
  const custom = customDoubleDoorSlabs(line.doubleDoorSizing);
  if (custom) return [line.mode, line.doorType || 'TBD', line.config, `Active: ${formatShopDimension(custom.activeWidth)} x ${formatShopDimension(custom.height)}; Inactive: ${formatShopDimension(custom.inactiveWidth)} x ${formatShopDimension(custom.height)}`, line.hand, line.jambWidth].filter(Boolean).join(' | ');
  if (line.doubleDoorSizing?.kind === 'patio') {
    const preset = PATIO_DOOR_PRESETS[line.doubleDoorSizing.preset];
    return [line.mode, line.doorType || 'TBD', `Patio Door Replacement / ${line.doubleDoorSizing.preset}'`, `2 @ ${formatShopDimension(preset.activeWidth)} x ${formatShopDimension(preset.height)}`, line.hand, line.jambWidth].filter(Boolean).join(' | ');
  }
  return [line.mode, line.doorType || 'TBD', `${line.width} × ${line.height}`, line.config, line.hand, line.jambWidth].filter(Boolean).join(' · ');
}

function savedLineTitle(line: DoorLineInput): string {
  if (isSlabOnly(line)) return [line.mode, line.doorType || 'TBD', `${line.width} × ${line.height}`, 'SLAB ONLY', line.hand].filter(Boolean).join(' · ');
  const noJamb = line.config === 'PKT' || line.config === 'B.P.';
  const display = noJamb ? { ...line, hand: null, jambWidth: null } : line;
  if (!line.doubleDoorSizing && hasCustomSlabAxis(line)) {
    return lineTitle({ ...display, width: customSlabAxis(line, 'width') ? line.customSlabWidth || 'Not entered' : line.width, height: customSlabAxis(line, 'height') ? line.customSlabHeight || 'Not entered' : line.height });
  }
  return lineTitle(display);
}

function savedLineSelections(line: DoorLineInput): string {
  if (isSlabOnly(line)) return ['SLAB ONLY', preparationDisplay(line), line.hand].filter(Boolean).join(' · ');
  const noJamb = line.config === 'PKT' || line.config === 'B.P.';
  const topology = isGlassConfiguration(line.config) ? glassConfigurationTopology(line.config) : null;
  return [
    line.mode === 'Exterior' && line.material ? 'Material: ' + (line.material === 'fiberglass' ? 'Fiberglass' : line.material === 'wood' ? 'Wood' : line.material) : '',
    !noJamb ? 'Sill: ' + sillChoice(line) : '',
    showsMagCatch(line) ? 'Mag Catch' : hasDoubleDoorCore(line.config) ? 'Astragal: ' + DOUBLE_DOOR_ASTRAGALS[normalizeDoubleDoorAstragal(line.doubleDoorAstragal)].label : '',
    topology && topology.sidelightPositions.length > 0 && line.sidelightType ? 'Sidelight Type: ' + line.sidelightType : '',
  ].filter(Boolean).join(' | ');
}

function savedGlassDetails(line: DoorLineInput): string {
  return (line.glassWorkorderDetail ?? '').split('\nMANUAL OVERRIDE')[0].trim();
}

function statusTone(status: unknown): string {
  if (status === 'Blocked') return 'bg-rose-100 text-rose-900 dark:bg-rose-950 dark:text-rose-100';
  if (status === 'Warning' || status === 'Glass Detail Needed' || status === 'Incomplete') return 'bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-100';
  if (status === 'Manual Override') return 'bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100';
  return 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100';
}

function StatusBadge({ status }: { status: unknown }) {
  if (!hasVisibleStatus(status)) return null;
  const label = statusLabel(status);
  return <span aria-label={`Calculation status: ${label}`} className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone(status)}`}>{label}</span>;
}

function Issues({ label, issues, blocker = false }: { label: string; issues: GlassIssue[]; blocker?: boolean }) {
  if (!issues.length) return null;
  return <section aria-label={label} className={`rounded-xl border p-3 ${blocker ? 'border-rose-400 bg-rose-50 text-rose-950 dark:bg-rose-950 dark:text-rose-100' : 'border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950 dark:text-amber-100'}`}><p className="font-bold">{blocker ? '⛔' : '⚠'} {label}</p><ul className="mt-1 list-disc pl-5 text-sm">{issues.map((entry, index) => <li key={`${entry.code}:${entry.message}:${index}`}>{entry.message}</li>)}</ul></section>;
}

function lineShopHours(line: DoorLineInput): string {
  return String(calculateJ2AShopHours([{ ...line, lineStatus: 'Active' }]).shopHours ?? '—');
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

const doorLabelFields = [
  { name: 'doorId', label: 'Door ID' },
  { name: 'productCode', label: 'Product Code' },
  { name: 'doorSlabSku', label: 'Door Slab SKU (Optional)' },
] as const;

export function DoorLineWorkspace({ lines, onChange, onUnappliedChange, canEdit, hingeColor = '', onHingeColorChange, lifecycleStage, calculationOnly = false, onDraftChange, onPersistLines, savePending = false, lastSavedChange, onLineMutation }: {
  onLineMutation?: (mutation: IntakeMutation) => void;
  onPersistLines?: (lines: DoorLineInput[], mutation: IntakeMutation) => Promise<boolean>;
  savePending?: boolean;
  lastSavedChange?: (IntakeChange & { lineId: string }) | null;
  calculationOnly?: boolean;
  onDraftChange?: (line: DoorLineInput) => void;
  lines: DoorLineInput[];
  onChange: (lines: DoorLineInput[]) => void;
  onUnappliedChange?: (dirty: boolean) => void;
  canEdit: boolean;
  hingeColor?: string;
  onHingeColorChange?: (value: string) => void;
  lifecycleStage: JobLifecycleStage;
}) {
  const phone = usePhoneIntake();
  const mutationLock = useRef(false);
  const draftLineId = useRef<string | null>(null);
  const lastCompletedSubmission = useRef<string | undefined>(undefined);
  const inputPane = useRef<HTMLDivElement>(null);
  const [mobilePending, setMobilePending] = useState(false);
  const busy = savePending || mobilePending;
  const [newDoorSession, setNewDoorSession] = useState(createNewDoorSession);
  const [editor, setEditor] = useState<DoorLineInput>(() => calculationOnly ? defaultDoorLine('Exterior') : newIntakeDoor(newDoorSession, lines));
  const [editorBaseline, setEditorBaseline] = useState(() => JSON.stringify(editor));
  const [editingLineId, setEditingLineId] = useState<string | null>(null);
  const priorDoor = lastActiveDoorBaseline(lines);
  const [priorHingeColor, setPriorHingeColor] = useState(hingeColor);
  const [editHingeColor, setEditHingeColor] = useState(hingeColor);
  const comparisonBaseline: DoorLineInput | null = calculationOnly ? null : editingLineId !== null ? JSON.parse(editorBaseline) : priorDoor;
  const activeModeKey = JSON.stringify([priorDoor?.lineId, priorDoor?.mode]);
  const [previousActiveModeKey, setPreviousActiveModeKey] = useState(activeModeKey);
  if (previousActiveModeKey !== activeModeKey) {
    setPreviousActiveModeKey(activeModeKey);
    if (!calculationOnly && editingLineId === null && (!priorDoor || JSON.stringify(editor) === editorBaseline)) {
      const next = newIntakeDoor(newDoorSession, lines);
      setEditor(next); setEditorBaseline(JSON.stringify(next));
    }
  }
  const comparisonValues = comparisonBaseline;
  const differs = (field: string) => {
    if (!comparisonValues) return false;
    if (field === 'sill') return sillChoice(editor) !== sillChoice(comparisonValues);
    if (field === 'hingeColor') return hingeColor !== (editingLineId !== null ? editHingeColor : priorHingeColor);
    if (['roWidth', 'roHeight', 'customSlabWidth', 'customSlabHeight'].includes(field)) return storedShopInput(editor[field]) !== storedShopInput(comparisonValues[field]);
    const fallback = ({ jambType: 'Primed', hingeType: 'REG', customSlab: 'No' } as Record<string, string>)[field] ?? '';
    return String(editor[field] ?? fallback) !== String(comparisonValues[field] ?? fallback);
  };
  const { handlers: fieldTracking, clearRecentEdit } = useEditedField(editingLineId);
  const [workspacePane, setWorkspacePane] = useState<'input' | 'lines'>('input');
  const [ripMode, setRipMode] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string; lifecycleStage: JobLifecycleStage } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [overrideReason, setOverrideReason] = useState('');
  const [, setCalculationStatus] = useState<GlassCalculationStatus | 'Incomplete' | null>(null);
  const [explicitGlassDetailNeeded, setExplicitGlassDetailNeeded] = useState(false);
  const [isOverridePending, startOverrideTransition] = useTransition();
  useEffect(() => { onDraftChange?.(editor); }, [editor, onDraftChange]);
  const approvalEditor = useRef(editor);
  useEffect(() => { approvalEditor.current = editor; }, [editor]);
  const messageTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const active = lines.filter((line) => (line.lineStatus ?? 'Active') === 'Active');
  const archived = lines.filter((line) => line.lineStatus === 'Archived');
  const estimate = useMemo(() => calculateJ2AShopHours(lines), [lines]);
  const modeSelected = editor.mode === 'Interior' || editor.mode === 'Exterior';
  const mode = editor.mode === 'Interior' ? 'Interior' : 'Exterior';
  const config = String(editor.config ?? 'D');
  const isGlass = mode === 'Exterior' && isGlassConfiguration(config);
  const staffConfiguration = isGlass ? 'With Glass' : config;
  const patio = editor.doubleDoorSizing?.kind === 'patio' ? editor.doubleDoorSizing.preset : null;
  const customDD = hasDoubleDoorCore(config) && hasCustomSlabAxis(editor);
  const customSizing = editor.doubleDoorSizing?.kind === 'custom-slabs' ? editor.doubleDoorSizing : null;
  const slabOnly = isSlabOnly(editor);
  const noJamb = slabOnly || mode === 'Interior' && (config === 'PKT' || config === 'B.P.');
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
    if (name === 'doorType' || name === 'hingeType' || name === 'sill') setNewDoorSession(rememberNewDoor(newDoorSession, name === 'sill' ? withSillChoice(editor, value as SillChoice) : { ...editor, [name]: value }, editingLineId));
    if (geometryFields.has(name) && (name !== 'sill' || geometryChanged(editor, withSillChoice(editor, value as SillChoice)))) setExplicitGlassDetailNeeded(false);
    setEditor((current) => {
      const next = name === 'sill' ? withSillChoice(current, value as SillChoice) : name === 'customSlab' ? changeSizingMode(current, value as 'No' | 'WoodCustom' | 'RO') : { ...current, [name]: value, ...(name === 'prep' ? { prepSource: 'manual' as const, slabDrilling: null } : {}) };
      if (name === 'doubleDoorSizing' && next.doubleDoorSizing?.kind === 'custom-slabs') next.customSlab = 'WoodCustom';
      return geometryFields.has(name) && geometryChanged(current, next) ? clearCalculated(reconcileGlassDoorSetupChange(current, next)) : next;
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

  function setSizeAxis(axis: SlabAxis, value: string) {
    if (hasDoubleDoorCore(config) || (noJamb && !slabOnly)) { if (axis === 'height') setHeight(value); else set('width', value); return; }
    setEditor((current) => clearCalculated(reconcileGlassDoorSetupChange(current, selectSlabAxis(current, axis, value))));
    if (axis === 'height' && value !== 'Custom') setHeight(value);
    setFieldErrors({}); setExplicitGlassDetailNeeded(false); setCalculationStatus(null); clearWorkspaceMessage();
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
    setNewDoorSession(rememberNewDoor(newDoorSession, { ...editor, height: value }, editingLineId));
    setEditor((current) => clearCalculated(reconcileGlassDoorSetupChange(current, {
      ...current,
      height: value,
      prep: isSlabOnly(current) ? current.prep : prepAfterHeightChange(current.mode === 'Interior' ? 'Interior' : 'Exterior', String(current.config), current.prep, value, current.prepSource),
    })));
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
    if (busy || mutationLock.current) return;
    if (isSameDoorMode(editor, nextMode)) return;
    if (!confirmsGlassDiscard()) return;
    const nextSession = rememberNewDoor(newDoorSession, editor, editingLineId);
    setNewDoorSession(editingLineId === null ? { ...nextSession, mode: nextMode } : nextSession);
    setEditor((current) => {
      const defaults = editingLineId === null ? newDoorFromSession(nextSession, nextMode) : defaultDoorLine(nextMode);
      const automatic = current.prepSource === 'automatic' || (current.mode !== 'Exterior' && current.mode !== 'Interior');
      return { ...defaults, supplyType: current.supplyType, slabPreparation: current.slabPreparation, slabDrilling: current.slabDrilling, framePreparation: current.framePreparation, ...(isSlabOnly(current) ? { hand: current.hand } : {}), prep: automatic ? defaults.prep : current.prep, prepSource: automatic ? 'automatic' : 'manual', lineId: current.lineId, lineIndex: current.lineIndex, lineStatus: current.lineStatus, qty: current.qty, notes: current.notes, doorId: current.doorId, productCode: current.productCode, doorSlabSku: current.doorSlabSku, individualDoorIds: current.individualDoorIds, ...(editingLineId !== null ? { doorType: current.doorType, hingeType: hingeTypeAfterModeChange(nextMode, 'D', current.hingeType) } : {}) };
    }); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
  }

  function chooseStaffConfiguration(value: string) {
    if (value === 'With Glass') {
      const next = retainCompatibleGlassFields(patio ? withPatioPreset(editor, null) : editor, 'SD', 'Glass');
      if (!isGlassConfiguration(editor.config)) next.includeDiagramOnWorkOrder = true;
      setEditor(initialBuilderDraft(next));
      setFieldErrors({}); setOverrideReason(''); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
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
    next.prep = isSlabOnly(editor) ? editor.prep : prepAfterHeightChange(mode, nextConfig, editor.prepSource === 'automatic' ? '' : editor.prep, editor.height, editor.prepSource);
    if (!slabOnly && mode === 'Interior' && (nextConfig === 'PKT' || nextConfig === 'B.P.')) {
      next = { ...next, sill: null, construction: 'standard', hand: '', jambWidth: '', jambType: '', hingeType: '', ripJamb: '', customSlab: 'No', customSlabWidth: '', customSlabHeight: '' };
      setRipMode(false);
    }
    setEditor(nextApplicable ? initialBuilderDraft(next) : next); setFieldErrors({}); setOverrideReason(''); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
  }

  function choosePatio(preset: '5' | '6' | null) {
    setEditor((current) => clearCalculated(withPatioPreset(current, preset)));
    setFieldErrors({}); setCalculationStatus(null); clearWorkspaceMessage();
  }

  function focusPhoneDoor() {
    if (!phone || !onPersistLines) return;
    requestAnimationFrame(() => {
      inputPane.current?.scrollIntoView({ block: 'start' });
      inputPane.current?.querySelector<HTMLInputElement>('[data-label-field="doorId"] input')?.focus({ preventScroll: true });
    });
  }

  function labelInput({ name, label }: typeof doorLabelFields[number]) {
    return <label className="grid gap-1 text-sm font-semibold" key={name} data-label-field={name}>{label}<input className={control}
              onChange={(event) => editingLineId === null ? set(name, event.target.value) : changeDoorLabelField(editingLineId, name, event.target.value)}
              value={String(editor[name] ?? '')}/></label>;
  }

  function resetEditor() {
    draftLineId.current = null;
    clearRecentEdit();
    const next = calculationOnly ? newDoorFromSession(newDoorSession) : newIntakeDoor(newDoorSession, lines); setEditor(next); setEditorBaseline(JSON.stringify(next)); setEditingLineId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setCalculationStatus(null); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
  }

  function commitEditor(detailNeeded = explicitGlassDetailNeeded, submittedEditor: DoorLineInput = editor, persist = false): boolean {
    if (busy || mutationLock.current) return false;
    if (persist && !intakeDraftReady(submittedEditor, editorBaseline, lastCompletedSubmission.current, editingLineId !== null)) {
      showTransientMessage({ error: true, text: 'That door is already saved. Enter the next opening or use Duplicate previous for an identical door.' });
      return false;
    }
    if (submittedEditor.mode !== 'Exterior' && submittedEditor.mode !== 'Interior') {
      setFieldErrors({ mode: 'Choose Exterior or Interior before adding a door.' }); return false;
    }
    if (submittedEditor === editor && Object.values(fieldErrors).some(Boolean)) {
      clearMessageTimer(); setMessage({ error: true, text: Object.values(fieldErrors)[0], lifecycleStage }); return false;
    }
    const candidate = { ...submittedEditor, lineId: submittedEditor.lineId ?? (draftLineId.current ??= globalThis.crypto.randomUUID()), lineStatus: 'Active' as const };
    const normalized = normalizeDoorLineInput(candidate);
    if (!normalized.ok) {
      const special = lifecycleStage === 'Confirmed Job' && editingLineId !== null && active.length === 1 ? CONFIRMED_JOB_LINE_MESSAGE : Object.values(normalized.fieldErrors)[0] ?? normalized.message;
      setFieldErrors(normalized.fieldErrors);
      clearMessageTimer();
      setMessage({ error: true, text: special, lifecycleStage });
      return false;
    }
    if (!canCommitGlassCalculation(normalized.value.glassCalcStatus ?? 'Ready', detailNeeded)) {
      clearMessageTimer(); setMessage({ error: true, text: 'Required details are missing. Use Leave Details Needed to preserve the line.', lifecycleStage }); return false;
    }
    if (detailNeeded && normalized.value.glassCalcStatus !== 'Glass Detail Needed') {
      clearMessageTimer(); setMessage({ error: true, text: 'Leave Details Needed is available only while required information is missing.', lifecycleStage }); return false;
    }
    const saved = { ...candidate, ...normalized.value };
    clearRecentEdit();
    setPriorHingeColor(hingeColor);
    const nextLines = editingLineId !== null ? replaceDoorLineById(lines, editingLineId, saved) : [...lines, saved];
    const finish = () => {
      if (persist) lastCompletedSubmission.current = JSON.stringify(submittedEditor);
      draftLineId.current = null;
      const nextSession = rememberNewDoor(newDoorSession, submittedEditor, editingLineId);
      setNewDoorSession(nextSession);
      const nextEditor = newIntakeDoor(nextSession, nextLines); setEditor(nextEditor); setEditorBaseline(JSON.stringify(nextEditor)); setEditingLineId(null); setRipMode(false); setFieldErrors({}); setOverrideReason(''); setCalculationStatus(null); setExplicitGlassDetailNeeded(false);
      focusPhoneDoor();
    };
    if (persist && onPersistLines) {
      persistMobile(nextLines, { lineId: String(saved.lineId), kind: editingLineId ? 'updated' : 'added', before: editingLineId ? Number(lines.find(line => line.lineId === editingLineId)?.qty) : null, quantity: Number(saved.qty) }, finish);
      return false;
    }
    onLineMutation?.({ lineId: String(saved.lineId), kind: editingLineId ? 'updated' : 'added', before: editingLineId ? Number(lines.find(line => line.lineId === editingLineId)?.qty) : null, quantity: Number(saved.qty) });
    onChange(nextLines);
    showTransientMessage({ error: false, text: editingLineId !== null ? 'Door line updated. Save the job to persist it.' : 'Door line added. Save the job to persist it.' });
    finish();
    return true;
  }

  function edit(line: DoorLineInput) {
    if (!canChangeAnotherLine()) return;
    if (typeof line.lineId !== 'string' || !line.lineId) { showTransientMessage({ error: true, text: 'This door line has no stable identity. Reload and review the job.' }); return; }
    clearRecentEdit();
    setNewDoorSession(rememberNewDoor(newDoorSession, editor, editingLineId));
    setEditHingeColor(hingeColor);
    const editable = isGlassConfiguration(line.config) ? initialBuilderDraft(line) : structuredClone(line);
    for (const name of ['roWidth', 'roHeight', 'customSlabWidth', 'customSlabHeight', 'panelSidelightWidth', 'sidelightMeasurementLeft', 'sidelightMeasurementRight'] as const) editable[name] = storedShopInput(editable[name]);
    setEditor(editable); setEditorBaseline(JSON.stringify(editable)); setEditingLineId(line.lineId); setRipMode(String(line.ripJamb ?? '').toLowerCase() === 'yes'); setCalculationStatus(null);
    setFieldErrors({}); setOverrideReason(line.glassOverride?.reason ?? ''); setExplicitGlassDetailNeeded(false); clearWorkspaceMessage();
    setWorkspacePane('input'); focusPhoneDoor();
  }

  function changeDoorLabelField(lineId: unknown, name: typeof doorLabelFields[number]['name'], value: string) {
    const change = { [name]: value || null };
    onChange(lines.map((line) => line.lineId === lineId ? { ...line, ...change } : line));
    if (editingLineId !== null && editingLineId === lineId) {
      setEditor((current) => ({ ...current, ...change }));
      setEditorBaseline((current) => JSON.stringify({ ...JSON.parse(current), ...change }));
    }
  }

  function changeIndividualDoorId(lineId: unknown, index: number, value: string) {
    const line = lines.find((item) => item.lineId === lineId);
    if (!line) return;
    const ids = [...(line.individualDoorIds ?? [])];
    while (ids.length <= index) ids.push('');
    ids[index] = value;
    const change = { individualDoorIds: ids };
    onChange(lines.map((item) => item.lineId === lineId ? { ...item, ...change } : item));
    if (editingLineId === lineId) {
      setEditor((current) => ({ ...current, ...change }));
      setEditorBaseline((current) => JSON.stringify({ ...JSON.parse(current), ...change }));
    }
  }

  function persistMobile(nextLines: DoorLineInput[], mutation: IntakeMutation, after?: () => void) {
    if (!onPersistLines || mutationLock.current || busy) return;
    mutationLock.current = true; setMobilePending(true); clearWorkspaceMessage();
    void onPersistLines(nextLines, mutation).then(ok => { if (ok) after?.(); })
      .catch(() => { setMessage({ error: true, text: 'Save was interrupted. Input is retained; reopen the job to check before retrying.', lifecycleStage }); })
      .finally(() => { mutationLock.current = false; setMobilePending(false); });
  }

  function canChangeAnotherLine() {
    if (busy || mutationLock.current) return false;
    if (phone && onPersistLines && JSON.stringify(editor) !== editorBaseline) {
      showTransientMessage({ error: true, text: 'Update or cancel the current door before changing another line.' });
      setWorkspacePane('input'); return false;
    }
    return true;
  }

  function duplicate(line: DoorLineInput) {
    if (!canChangeAnotherLine()) return;
    const duplicateLine = duplicateDoorLine(line, globalThis.crypto.randomUUID(), lines.length + 1);
    setPriorHingeColor(hingeColor);
    if (phone && onPersistLines) { persistMobile([...lines, duplicateLine], { lineId: String(duplicateLine.lineId), kind: 'added', before: null, quantity: Number(duplicateLine.qty) }, () => showTransientMessage({ error: false, text: 'Door duplicated and saved. Any geometry exception requires fresh approval.' })); return; }
    onLineMutation?.({ lineId: String(duplicateLine.lineId), kind: 'added', before: null, quantity: Number(duplicateLine.qty) });
    onChange([...lines, duplicateLine]); showTransientMessage({ error: false, text: 'Door line duplicated with a new identity. Any manual override requires fresh approval.' });
  }

  function adjust(lineId: unknown, delta: number) {
    if (!canChangeAnotherLine()) return;
    const line = lines.find((item) => item.lineId === lineId); if (!line) return;
    const nextQuantity = Number(line.qty) + delta;
    if (lifecycleStage === 'Confirmed Job' && nextQuantity <= 0 && active.length === 1) { showTransientMessage({ error: true, text: CONFIRMED_JOB_LINE_MESSAGE }); return; }
    const quantity = Math.max(1, nextQuantity);
    if (quantity === Number(line.qty)) return;
    const nextLines = lines.map(item => item.lineId === lineId ? { ...item, qty: quantity } : item);
    if (phone && onPersistLines) { persistMobile(nextLines, { lineId: String(lineId), kind: 'quantity', before: Number(line.qty), quantity }); return; }
    onLineMutation?.({ lineId: String(lineId), kind: 'quantity', before: Number(line.qty), quantity });
    onChange(nextLines);
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
      const result = await prepareGlassOverrideAction({ line: editor, acceptedValues: calculateGlassGeometry({ ...editor, glassOverride: null }).glassCalc ?? {}, reason: overrideReason });
      if (approvalEditor.current !== editor) return;
      if (!result.ok || !result.approval) { clearMessageTimer(); setMessage({ error: true, text: result.ok ? 'Override approval was not returned.' : result.message, lifecycleStage }); return; }
      const recalculated = calculateGlassGeometry({ ...editor, glassOverride: result.approval });
      setEditor((current) => ({ ...current, glassOverride: result.approval, glassCalcStatus: recalculated.status, glassWorkorderDetail: recalculated.workorderDetail }));
      showTransientMessage({ error: false, text: 'Geometry exception approved. Save the job to persist it.' });
    });
  }

  function removeOverride() {
    startOverrideTransition(async () => {
      const result = await removeGlassOverrideAction();
      if (approvalEditor.current !== editor) return;
      if (!result.ok) { clearMessageTimer(); setMessage({ error: true, text: result.message, lifecycleStage }); return; }
      const recalculated = calculateGlassGeometry({ ...editor, glassOverride: null });
      setEditor((current) => ({ ...current, glassOverride: null, glassCalcStatus: recalculated.status, glassWorkorderDetail: recalculated.workorderDetail }));
      showTransientMessage({ error: false, text: 'Geometry exception approval removed. Save the job to persist it.' });
    });
  }

  return <section className="door-line-workbench grid min-w-0 gap-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)]" aria-labelledby={calculationOnly ? undefined : "door-lines-heading"} aria-label={calculationOnly ? "Calculator door editor" : undefined} data-server-intake={Boolean(onPersistLines) || undefined} data-calculation-only={calculationOnly || undefined} data-workspace-pane={workspacePane}>
    {lastSavedChange ? <div className="mobile-last-saved" role="status"><strong>Last saved</strong> · {intakeChangeText(lastSavedChange)}</div> : null}
    {!calculationOnly ? <div aria-label="Door workspace view" className="door-workspace-switcher" role="group">
      <button aria-controls="door-input-pane" aria-pressed={workspacePane === 'input'} onClick={() => setWorkspacePane('input')} type="button">Door Input</button>
      <button aria-controls="job-lines-pane" aria-pressed={workspacePane === 'lines'} onClick={() => setWorkspacePane('lines')} type="button">Job Lines ({active.length})</button>
    </div> : null}
    <div {...fieldTracking} data-editing-fields className="door-input-pane min-w-0 rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900" id="door-input-pane" ref={inputPane}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div><p className="text-[10px] font-bold uppercase leading-3 tracking-wide text-slate-500">Door editor</p><h2 className="text-base font-semibold leading-6">{calculationOnly ? 'Door Setup' : editingLineId !== null ? 'Edit Door Line' : 'Add Door Line'}</h2></div>
        {canEdit ? <div className="inline-flex w-fit shrink-0 rounded-md border border-slate-300 p-0.5 dark:border-slate-600" aria-label="Door mode" role="group">{(['Exterior', 'Interior'] as const).map((value) => <button aria-pressed={modeSelected && mode === value} className={`${button} min-h-12 px-5 text-base border-transparent ${modeSelected && mode === value ? 'bg-sky-700 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}`} key={value} onClick={() => chooseMode(value)} type="button">{value}</button>)}</div> : null}
      </div>
      <fieldset disabled={busy} className="door-editor-controls contents"><legend className="sr-only">Door specifications</legend>
      {!canEdit ? <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">Door lines and geometry are read-only with jobs = view.</p> : <>
        {!modeSelected ? <p id="door-mode-required" className="mt-2 text-sm font-semibold text-amber-800 dark:text-amber-200" role="status">Choose Exterior or Interior before adding a door.</p> : <>
        <label className="mt-2 grid gap-1 text-sm font-semibold">Supply<select className={control} value={slabOnly ? 'slab-only' : 'prehung'} onChange={event => { setEditor(current => changeSupplyType(current, event.target.value as 'prehung' | 'slab-only')); setFieldErrors({}); clearWorkspaceMessage(); }}><option value="prehung">Prehung / Complete Door</option><option value="slab-only">Slab Only</option></select></label>
        {slabOnly ? <p className="text-xs">Frame specifications are retained but do not apply. Swing and preparation are optional. Enter reviewed Shop Hours for slab work.</p> : null}
        {phone && onPersistLines && !calculationOnly ? doorLabelFields.filter(field => field.name === 'doorId').map(labelInput) : null}
        <div className="door-primary-grid mt-2 grid gap-2 sm:grid-cols-3 2xl:grid-cols-4">
          <label className="door-field-type grid gap-1 text-sm font-semibold">Door Type<input data-comparison-different={differs('doorType') || undefined} className={control} onChange={(event) => set('doorType', event.target.value)} value={String(editor.doorType ?? '')}/></label>
          {mode === 'Exterior'
            ? <label className="grid gap-1 text-sm font-semibold">Configuration<span className="flex min-w-0 gap-1"><select className={control} onChange={(event) => chooseStaffConfiguration(event.target.value)} data-comparison-different={differs('config') || undefined} value={staffConfiguration}><option value="D">D</option><option value="DD">DD</option>{!slabOnly ? <option value="With Glass">With Glass</option> : isGlass ? <option value="With Glass" disabled>Choose D or DD</option> : null}</select></span></label>
            : <label className="grid gap-1 text-sm font-semibold">Configuration<select className={control} onChange={(event) => chooseConfig(event.target.value)} data-comparison-different={differs('config') || undefined} value={config}>{J2A_CONFIGS[mode].map((value) => <option key={value}>{value}</option>)}</select></label>}
          {!slabOnly && patioSizingAvailable(editor) ? <label className="grid gap-1 text-sm font-semibold">DD Sizing<select className={control} onChange={(event) => choosePatio(event.target.value === "standard" ? null : event.target.value as "5" | "6")} value={patio ?? "standard"}><option value="standard">Standard DD</option><option value="5">Patio Door Replacement / 5&apos;</option><option value="6">Patio Door Replacement / 6&apos;</option></select></label> : null}
          {patio ? <p className="text-sm">Factory slabs: 2 @ {formatShopDimension(PATIO_DOOR_PRESETS[patio].activeWidth)} x {formatShopDimension(PATIO_DOOR_PRESETS[patio].height)}. Reference opening: {PATIO_DOOR_PRESETS[patio].referenceWidth}&quot; x 80&quot;.</p> : <>
          <label className="door-field-width grid gap-1 text-sm font-semibold">Width<select data-comparison-different={differs('width') || (comparisonValues !== null && customSlabAxis(editor, 'width') !== customSlabAxis(comparisonValues, 'width')) || undefined} className={control} onChange={(event) => setSizeAxis('width', event.target.value)} value={!hasDoubleDoorCore(config) && customSlabAxis(editor, 'width') ? 'Custom' : String(editor.width)}>{widths.map((value) => <option key={value}>{value}</option>)}{(!noJamb || slabOnly) && !hasDoubleDoorCore(config) && editor.material === 'wood' ? <option value="Custom">Custom&#8230;</option> : null}</select></label>
          <label className="door-field-height grid gap-1 text-sm font-semibold">Height<select data-comparison-different={differs('height') || (comparisonValues !== null && customSlabAxis(editor, 'height') !== customSlabAxis(comparisonValues, 'height')) || undefined} className={control} onChange={(event) => setSizeAxis('height', event.target.value)} value={!hasDoubleDoorCore(config) && customSlabAxis(editor, 'height') ? 'Custom' : String(editor.height)}>{DOOR_HEIGHTS.map((value) => <option key={value}>{value}</option>)}{(!noJamb || slabOnly) && !hasDoubleDoorCore(config) && editor.material === 'wood' ? <option value="Custom">Custom&#8230;</option> : null}</select></label>
          {!hasDoubleDoorCore(config) && customSlabAxis(editor, 'width') ? <DimensionInput different={differs('customSlabWidth')} error={fieldErrors.customSlabWidth} label="Actual slab width" onValue={(value) => setDimension('customSlabWidth', value)} required value={String(editor.customSlabWidth ?? '')}/> : null}
          {!hasDoubleDoorCore(config) && customSlabAxis(editor, 'height') ? <DimensionInput different={differs('customSlabHeight')} error={fieldErrors.customSlabHeight} label="Actual slab height" onValue={(value) => setDimension('customSlabHeight', value)} required value={String(editor.customSlabHeight ?? '')}/> : null}
          </>}
          {!noJamb || slabOnly ? <label className="door-field-swing grid gap-1 text-sm font-semibold">Swing<select data-comparison-different={differs('hand') || undefined} className={control} onChange={(event) => setSwing(event.target.value)} value={String(editor.hand ?? '')}>{slabOnly ? <option value="">Not specified</option> : mode === 'Interior' && config === 'DD' ? <option value="">No handing</option> : null}<option>LH</option><option>RH</option>{mode === 'Exterior' || normalizeConstruction(editor.construction) === 'low-profile-quarter-sill' ? <><option>LHOUT</option><option>RHOUT</option></> : null}</select></label> : null}
          {!slabOnly && mode === 'Exterior' && config === 'DD' ? <label className="grid gap-1 text-sm font-semibold">Astragal<select className={control} onChange={(event) => set('doubleDoorAstragal', event.target.value as DoubleDoorAstragalType)} value={String(editor.doubleDoorAstragal ?? DEFAULT_DOUBLE_DOOR_ASTRAGAL)}>{Object.entries(DOUBLE_DOOR_ASTRAGALS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label> : null}
          <label className="door-field-prep grid gap-1 text-sm font-semibold">Prep<select data-comparison-different={differs('prep') || undefined} className={control} onChange={(event) => set('prep', event.target.value)} value={String(editor.prep ?? '')}>{!slabOnly && !prepChoices(mode, config).includes(String(editor.prep ?? '')) ? <option value={String(editor.prep ?? '')} disabled>Choose preparation</option> : null}{slabOnly ? <><option value="">Not specified</option><option value="MTM">MTM — Machine to Match</option></> : null}{prepChoices(mode, config).map((value) => <option key={value} value={value}>{mode === 'Exterior' ? ({ STD: 'Double Drill', SINGLE: 'Single Drill', MULTI: 'Multipoint' }[value] ?? value) : value}</option>)}</select></label>
          {slabOnly && editor.prep === 'MTM' ? <label className="grid gap-1 text-sm font-semibold">Drilling (Optional)<select className={control} value={String(editor.slabDrilling ?? '')} onChange={event => set('slabDrilling', event.target.value)}><option value="">Not specified</option>{prepChoices(mode, config).map(value => <option key={value} value={value}>{preparationDisplay({ prep: value })}</option>)}</select></label> : null}
          <label className="door-field-quantity grid gap-1 text-sm font-semibold">Quantity<input data-comparison-different={differs('qty') || undefined} className={control} min="1" onChange={(event) => set('qty', event.target.value)} step="1" type="number" value={String(editor.qty ?? 1)}/></label>
        </div>

        <div className="door-production-grid mt-2 grid gap-2 border-t border-slate-200 pt-2 sm:grid-cols-3 2xl:grid-cols-4" aria-label="Door production configuration">
          {!noJamb ? <><MobileIntakeSection enabled={Boolean(onPersistLines)} title="Jamb" summary={String(editor.jambWidth ?? '')} invalid={Boolean(fieldErrors.jambWidth)}><label className="grid gap-1 text-sm font-semibold">Jamb Width<select aria-label="Jamb Width" className={control} onChange={(event) => { const rip = event.target.value === 'RIP'; setRipMode(rip); set('ripJamb', rip ? 'Yes' : ''); set('jambWidth', rip ? '' : event.target.value); }} data-comparison-different={differs('jambWidth') || undefined} value={ripMode ? 'RIP' : String(editor.jambWidth ?? '')}>{jambWidthChoices(mode).map((value) => <option key={value} value={value}>{value}</option>)}<option value="RIP">RIP jamb</option></select>{ripMode ? <><span className="text-xs font-semibold">Rip to</span><input data-comparison-different={differs('jambWidth') || undefined} aria-label="Rip to" className={control} onChange={(event) => set('jambWidth', event.target.value)} placeholder="Completed RIP size" value={String(editor.jambWidth === 'RIP' ? '' : editor.jambWidth ?? '')}/></> : null}</label><label className="grid gap-1 text-sm font-semibold">Jamb Type<select data-comparison-different={differs('jambType') || undefined} className={control} onChange={(event) => set('jambType', event.target.value)} value={String(editor.jambType ?? 'Primed')}><option>Primed</option><option>Fir</option>{mode === 'Exterior' ? <><option>Smooth Composite</option><option>Textured Composite</option></> : null}</select></label></MobileIntakeSection><MobileIntakeSection enabled={Boolean(onPersistLines)} title="Hinges" invalid={Boolean(fieldErrors.hingeType)} summary={String(editor.hingeType ?? '')}><label className="grid gap-1 text-sm font-semibold">Hinge Type<select data-comparison-different={differs('hingeType') || undefined} className={control} onChange={(event) => set('hingeType', event.target.value)} value={String(editor.hingeType ?? 'REG')}>{hingeTypeOptions(mode).map((value) => <option key={value} value={value}>{value}</option>)}</select></label><label className="grid gap-1 text-sm font-semibold">Hinge Color<select className={control} disabled={!canEdit || !onHingeColorChange} onChange={(event) => onHingeColorChange?.(event.target.value)} data-comparison-different={differs('hingeColor') || undefined} value={hingeColor}>{!normalizeHingeColor(hingeColor).ok ? <option disabled value={hingeColor}>Invalid saved value — choose a valid finish</option> : null}{HINGE_COLOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label></MobileIntakeSection></> : null}
          {mode === 'Exterior' ? <MobileIntakeSection enabled={Boolean(onPersistLines)} title={slabOnly ? 'Material' : 'Material & weatherstrip'} invalid={Boolean(fieldErrors.material)} summary={String(editor.material ?? '')}><label className="grid gap-1 text-sm font-semibold">Material<select data-comparison-different={differs('material') || undefined} className={control} onChange={(event) => set('material', event.target.value)} value={String(editor.material)}><option value="fiberglass">Fiberglass</option><option value="wood">Wood</option></select></label>{!slabOnly ? <label className="grid gap-1 text-sm font-semibold">Weatherstrip<input data-comparison-different={differs('weatherstrip') || undefined} className={control} onChange={(event) => set('weatherstrip', event.target.value)} value={String(editor.weatherstrip ?? '')}/></label> : null}</MobileIntakeSection> : null}
          {!noJamb ? <MobileIntakeSection enabled={Boolean(onPersistLines)} title="Sill" invalid={Boolean(fieldErrors.construction)} summary={sillChoice(editor)}><label className="grid gap-1 text-sm font-semibold">Sill<select data-comparison-different={differs('sill') || undefined} className={control} onChange={(event) => set('sill', event.target.value)} value={sillChoice(editor)}>{SILL_CHOICES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label></MobileIntakeSection> : null}
          <MobileIntakeSection enabled={Boolean(onPersistLines)} title="Sizing adjustments & thickness" summary={String(editor.customSlab ?? 'No')} invalid={Boolean(fieldErrors.roWidth || fieldErrors.roHeight || fieldErrors.doubleDoorSizing)}>
          {!patio ? <fieldset className="flex flex-wrap items-center gap-2 text-sm"><legend className="font-semibold">Sizing Adjustments</legend>{([['WoodCustom', 'Custom Slab'], ['RO', 'Fit to RO']] as const).filter(([value]) => (value !== 'RO' || !slabOnly) && (value !== 'WoodCustom' || hasDoubleDoorCore(config))).map(([value, label]) => {
            const enabled = value === 'WoodCustom' ? hasCustomSlabAxis(editor) : editor.customSlab === 'RO';
            return <button key={value} role="switch" aria-label={label} aria-checked={enabled} data-comparison-different={differs('customSlab') || undefined} disabled={!enabled && (value === 'RO' ? noJamb : !hasDoubleDoorCore(config) && editor.material !== 'wood')} className={button + (enabled ? ' border-sky-700 bg-sky-700 text-white' : '')} onClick={() => set('customSlab', enabled ? 'No' : value)} type="button">{label} <span className="text-xs font-bold">{enabled ? 'ON' : 'OFF'}</span></button>;
          })}</fieldset> : null}
          {customDD ? <>
            {([['activeWidth', 'Active Slab Width'], ['inactiveWidth', 'Inactive Slab Width'], ['height', 'Slab Height']] as const).map(([field, label]) => <DimensionInput key={field} label={label} required value={String(customSizing?.[field] ?? '')} onValue={(value) => set('doubleDoorSizing', { kind: 'custom-slabs', activeWidth: customSizing?.activeWidth ?? '', inactiveWidth: customSizing?.inactiveWidth ?? '', height: customSizing?.height ?? '', [field]: value })}/>)}
            {!customDoubleDoorSlabs(customSizing) ? <p className="text-xs text-amber-800" role="status">{CUSTOM_DD_REQUIRED}</p> : null}
          </> : null}
          {!slabOnly && config === 'B.P.' ? <label className="grid gap-1 text-sm font-semibold">F.O. Height (only when cutting)<input data-comparison-different={differs('roHeight') || undefined} className={control} onChange={(event) => set('roHeight', event.target.value)} value={String(editor.roHeight ?? '')}/></label> : null}
          <label className="grid gap-1 text-sm font-semibold">Door Thickness<select data-comparison-different={differs('doorThickness') || undefined} className={control} onChange={(event) => set('doorThickness', event.target.value)} value={String(editor.doorThickness ?? '')}><option value="">Auto</option><option>1-3/8</option><option>1-3/4</option></select></label>
        {!slabOnly && usesCustomRo(editor) ? <div className="contents" aria-label="Custom RO dimensions">
          <DimensionInput error={fieldErrors.roWidth} label="RO Width" onValue={(value) => setDimension('roWidth', value)} value={String(editor.roWidth ?? '')}/>
          <DimensionInput error={fieldErrors.roHeight} label="RO Height" onValue={(value) => setDimension('roHeight', value)} value={String(editor.roHeight ?? '')}/>
        </div> : null}
        </MobileIntakeSection></div>
        {isGlass && !slabOnly ? <GlassUnitBuilder key={editingLineId ?? 'new-door'} embedded line={editor} comparisonBaseline={comparisonBaseline?.mode === 'Exterior' && isGlassConfiguration(comparisonBaseline.config) ? comparisonBaseline : null} onInlineChange={(next) => { setEditor(next); setFieldErrors({}); setCalculationStatus(null); clearWorkspaceMessage(); }} onCancel={resetEditor} onUse={(next, detailNeeded) => commitEditor(detailNeeded, next)} showCommitActions={false}/> : null}
        {!calculationOnly && isGlass && (glassPresentation.glassCalcStatus === 'Warning' || glassPresentation.glassOverride) ? <section aria-label="Geometry Exception" className="mt-2 grid gap-2 rounded-md border border-violet-300 bg-violet-50 p-2 text-sm">
          {glassPresentation.glassOverride ? <>
            <div className="flex flex-wrap items-center justify-between gap-2"><strong>Geometry Exception Approved</strong><button className={button} disabled={isOverridePending} onClick={removeOverride} type="button">Remove Approval</button></div>
            <p><strong>Reason:</strong> {glassPresentation.glassOverride.reason}</p>
            <p><strong>Approved by:</strong> {glassPresentation.glassOverride.appliedByDisplayName ?? glassPresentation.glassOverride.appliedByUserId} | {new Date(glassPresentation.glassOverride.appliedAt).toLocaleString()}</p>
          </> : <>
            <h4 className="font-bold">Geometry Exception</h4>
            <p>Approve DoorGo&apos;s calculated result despite the warning. Approval does not change dimensions.</p>
            <Issues issues={glassPresentation.glassWarnings ?? []} label="Geometry warning"/>
            <p className="whitespace-pre-line">{calculateGlassGeometry({ ...editor, glassOverride: null }).workorderDetail}</p>
            <label className="grid gap-1 font-semibold">Approval Reason<textarea className={control} onChange={(event) => setOverrideReason(event.target.value)} value={overrideReason}/></label>
            <button className={button} disabled={isOverridePending || !overrideReason.trim()} onClick={applyOverride} type="button">Approve Exception</button>
          </>}
        </section> : null}

        {!slabOnly ? <CustomRoSummary line={editor}/> : null}
          {!calculationOnly && !(phone && onPersistLines) ? doorLabelFields.filter(field => field.name === 'doorId').map(labelInput) : null}
          <MobileIntakeSection enabled={Boolean(onPersistLines)} title="Codes & notes" summary={editor.notes ? 'Notes entered' : 'Optional'}>
          {!calculationOnly ? doorLabelFields.filter(field => field.name !== 'doorId').map(labelInput) : null}
          <label className="door-line-notes grid gap-1 text-sm font-semibold sm:col-span-3 2xl:col-span-4">Line Notes<textarea className={`${control} door-line-notes-control h-10 min-h-10 resize-y py-1.5`} onChange={(event) => set('notes', event.target.value)} rows={2} value={String(editor.notes ?? '')}/></label>
          </MobileIntakeSection>
        </>}
        <div className="door-input-local-footer mt-2">
          <div className="door-input-preview text-xs"><span className="font-semibold">Preview:</span> {modeSelected ? lineTitle(editor) : 'Choose a designation to begin.'}</div>
          {!calculationOnly ? <div className="door-input-local-actions desktop-intake-actions flex flex-wrap gap-2">{isGlass && glassPresentation.glassCalcStatus === 'Glass Detail Needed' ? <button className={`${button} border-amber-600`} onClick={() => commitEditor(true)} type="button">Leave Details Needed</button> : null}<button className={`${button} border-sky-700 bg-sky-700 text-white`} disabled={!modeSelected} aria-describedby={!modeSelected ? "door-mode-required" : undefined} onClick={() => commitEditor()} type="button">{editingLineId !== null ? 'Update Door' : 'Add Door'}</button>{editingLineId !== null ? <button className={button} onClick={resetEditor} type="button">Cancel Edit</button> : null}</div> : null}
          {phone && onPersistLines && !calculationOnly ? <div className="mobile-intake-actions"><button className="app-button app-button-primary" disabled={busy || !modeSelected || !intakeDraftReady(editor, editorBaseline, undefined, editingLineId !== null)} onClick={() => commitEditor(false, editor, true)} type="button">{busy ? 'Saving door…' : editingLineId ? 'Update Door & Next' : 'Add Door & Next'}</button>{isGlass && glassPresentation.glassCalcStatus === 'Glass Detail Needed' ? <button type="button" className="app-button" disabled={busy} onClick={() => commitEditor(true, editor, true)}>Leave Details Needed</button> : null}<small className="mobile-save-hint">{intakeDraftReady(editor, editorBaseline, undefined, editingLineId !== null) ? 'Saves this door and current job changes.' : 'Enter the next opening, or use Duplicate previous for an identical door.'}</small>{editingLineId ? <button type="button" className="app-button" onClick={resetEditor}>Cancel Edit</button> : null}<button className="app-button" type="button" onClick={() => setWorkspacePane('lines')}>Doors ({active.reduce((sum, line) => sum + Number(line.qty), 0)})</button>{priorDoor && editingLineId === null ? <button className="app-button" disabled={busy} type="button" onClick={() => duplicate(priorDoor)}>Duplicate previous</button> : null}</div> : null}
        </div>
      </>}
      {visibleMessage ? <p aria-live="polite" className={`mt-4 rounded-xl p-3 text-sm ${visibleMessage.error ? 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100' : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100'}`} role="status">{visibleMessage.text}</p> : null}
      </fieldset>
    </div>

    {!calculationOnly ? <aside className="job-lines-pane min-w-0 rounded-lg border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-900" id="job-lines-pane">
      <div className="flex flex-wrap items-center justify-between gap-1.5"><div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Job Lines</p><h2 className="text-base font-semibold" id="door-lines-heading">{active.length} active · {archived.length} archived</h2></div>{canEdit ? <button className={button} disabled={busy} onClick={merge} type="button">Merge Equivalent</button> : null}</div>
      <p className="mt-1.5 rounded bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">Shop Hours: {estimate.shopHours ?? '—'} · {estimate.shopHoursSource ?? 'No estimate'}</p>
      <fieldset disabled={busy} className="contents"><div className="mt-2 grid gap-2">{active.length ? active.map((line, index) => { const presentedLine = withDerivedGlassGeometry(line); const attention = glassLineNeedsAttention(presentedLine); return <article data-last-saved={lastSavedChange && lastSavedChange.lineId === line.lineId && lastSavedChange.quantity === Number(line.qty) || undefined} data-editing={editingLineId !== null && line.lineId === editingLineId || undefined} className="job-line-card min-w-0 rounded-md border border-slate-200 p-2 dark:border-slate-700" key={importedLineRenderKey(line, index)}><div className="flex flex-wrap items-start justify-between gap-1"><h3 className="line-clamp-2 text-sm font-semibold leading-tight">{savedLineTitle(line)}</h3><StatusBadge status={presentedLine.glassCalcStatus}/></div><p className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-300" title={line.notes ?? undefined}>{`Qty ${String(line.qty)} · Est. shop hours: ${lineShopHours(line)}${line.notes ? ` · ${line.notes}` : ''}`}</p>
        {lastSavedChange && lastSavedChange.lineId === line.lineId && lastSavedChange.quantity === Number(line.qty) ? <p className="mobile-card-change">Last updated · {intakeChangeText(lastSavedChange)}</p> : null}
        {line.doorId ? <p className="mobile-card-door-id">{line.doorId}</p> : null}
        <div className="mobile-quantity-controls"><strong>Qty {String(line.qty)}</strong>{canEdit ? <><button type="button" aria-label={`Decrease quantity for ${line.doorId || 'line ' + line.lineIndex}`} disabled={busy || Number(line.qty) <= 1} onClick={() => adjust(line.lineId, -1)}>−</button><button type="button" aria-label={`Increase quantity for ${line.doorId || 'line ' + line.lineIndex}`} disabled={busy} onClick={() => adjust(line.lineId, 1)}>+</button></> : null}</div>
        {attention.length && !hasVisibleStatus(presentedLine.glassCalcStatus) ? <p className="mt-1 text-xs font-bold text-amber-800 dark:text-amber-200">⚠ Needs Attention</p> : null}
        <MobileIntakeSection enabled={Boolean(onPersistLines)} title="Identifiers & details" summary={line.doorId || undefined}>
        {doorLabelFields.map(({ name, label }) => canEdit ? (
          <label className="mt-1 grid gap-1 text-xs font-semibold" key={name} data-label-field={name}>{label}<input className={control}
            onChange={(event) => changeDoorLabelField(line.lineId, name, event.target.value)} value={line[name] ?? ''}/></label>
        ) : line[name] ? <p className="mt-1 text-xs" key={name}>{label}: {line[name]}</p> : null)}
        <details className="mt-1 text-sm"><summary>Individual Door IDs</summary>
          <p>Blank uses the shared Door ID. IDs beyond the current quantity are retained for later reuse.</p>
          {Array.from({ length: Math.min(500, Math.max(Number(line.qty) || 1, line.individualDoorIds?.length ?? 0)) }, (_, copy) => <label className="flex gap-2" key={copy}>
            Copy {copy + 1}{copy >= Number(line.qty) ? ' (retained)' : ''}<input aria-label={`Copy ${copy + 1} Door ID`} className="min-w-0 rounded border px-1" disabled={!canEdit} onChange={(event) => changeIndividualDoorId(line.lineId, copy, event.target.value)} placeholder={line.doorId || undefined} value={line.individualDoorIds?.[copy] ?? ''}/>
          </label>)}
        </details>
        {savedLineSelections(line) ? <p className="mt-0.5 text-xs">{savedLineSelections(line)}</p> : null}{isGlassConfiguration(line.config) ? <div className="job-line-glass-summary"><GlassUnitDiagram compact line={presentedLine}/>{presentedLine.glassWorkorderDetail ? <details className="text-xs"><summary className="cursor-pointer font-semibold">Line details</summary><pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs">{savedGlassDetails(presentedLine)}</pre>{presentedLine.glassOverride ? <p className="mt-1"><strong>Geometry Exception Approved:</strong> {presentedLine.glassOverride.reason}</p> : null}</details> : null}</div> : null}{!isSlabOnly(line) && !isGlassConfiguration(line.config) && (isFourSideJamb(line) || usesCustomRo(line) || usesAutomaticCustomSlabRoWidth(line) || line.doubleDoorSizing?.kind === 'custom-slabs') ? <details className="text-xs"><summary className="cursor-pointer font-semibold">Line details</summary><CustomRoSummary line={line}/></details> : null}</MobileIntakeSection>{canEdit ? <div className="job-line-actions mt-1.5 flex flex-wrap gap-1"><button className={button} onClick={() => adjust(line.lineId, 1)} type="button">+ Qty</button><button className={button} onClick={() => adjust(line.lineId, -1)} type="button">− Qty</button><button className={button} onClick={() => edit(line)} type="button">Edit</button><button className={button} onClick={() => duplicate(line)} type="button">Duplicate</button><MobileIntakeSection enabled={Boolean(onPersistLines)} title="More actions"><button className={button} disabled={index === 0} onClick={() => move(line.lineId, -1)} type="button">Move Up</button><button className={button} disabled={index === active.length - 1} onClick={() => move(line.lineId, 1)} type="button">Move Down</button><button className={`${button} border-rose-400 text-rose-800 dark:text-rose-200`} onClick={() => archive(line.lineId)} type="button">Archive / Remove</button></MobileIntakeSection></div> : null}</article>; }) : <p className="rounded-md border border-dashed border-slate-300 p-3 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">No active door lines.</p>}</div>
      </fieldset>{onPersistLines && canEdit ? <div className="mobile-intake-actions"><button type="button" className="app-button app-button-primary" onClick={() => { if (!canChangeAnotherLine()) return; resetEditor(); setWorkspacePane('input'); focusPhoneDoor(); }}>Add new door</button></div> : null}
      <details className="mt-5"><summary className="cursor-pointer font-semibold">Archived Lines ({archived.length})</summary><div className="mt-3 grid gap-3">{archived.length ? archived.map((line, index) => <article className="rounded-xl border border-slate-200 p-3 opacity-80 dark:border-slate-700" key={importedLineRenderKey(line, index)}><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-semibold">{lineTitle(line)}</h3><StatusBadge status={line.glassCalcStatus}/></div><p className="mt-1 text-sm">Qty {String(line.qty)} · Archived</p>{isGlassConfiguration(line.config) ? <GlassUnitDiagram compact line={line}/> : null}{canEdit ? <button className={`${button} mt-3`} disabled={busy} onClick={() => restore(line.lineId)} type="button">Restore Line</button> : null}</article>) : <p className="text-sm text-slate-500">No archived lines.</p>}</div></details>
    </aside> : null}
  </section>;
}
