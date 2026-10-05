'use client';

import { statusLabel } from '@/lib/jobs/status-presentation';
import { automaticCustomSlabRoWidth, usesAutomaticCustomSlabRoWidth } from '@/lib/jobs/non-glass-frame-cut-contract';
import { useEditedField } from './useEditedField';
import { DimensionInput } from './DimensionInput';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseGlassUnitConfiguration, resolveGlassUnitConfiguration,
  totalSidelightCount, isFrameGlassBuilderComposition, type GlassUnitComposition,
} from '@/lib/jobs/glass-unit-composition-contract';
import { calculateGlassCompositionSchematic } from '@/lib/jobs/glass-diagram-contract';
import { nextGlassBuilderDraft, reconcileGlassTopology } from '@/lib/jobs/glass-editor-contract';
import { isGlassConfiguration, automaticSidelightTBar, automaticTransomTBar, calculateGlassGeometry, normalizeGlassTypeCode, normalizeSidelightType, normalizeTBarSize, numericDimension } from '@/lib/jobs/glass-geometry-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit, type GlassDimensionAuthority } from '@/lib/jobs/glass-dimension-reconciliation-contract';
import { aggregateVendorCopy, glassResultRows } from '@/lib/jobs/glass-result-presentation';
import type { DoorLineInput, GlassTypeCode, SidelightSpecification, SidelightType } from '@/lib/jobs/job-intake-types';
import { GlassUnitDiagram } from './GlassUnitDiagram';
import { UnsavedChangesDialog } from '@/components/app-shell/UnsavedChangesGuard';
import { DEFAULT_DOUBLE_DOOR_ASTRAGAL, DOUBLE_DOOR_ASTRAGALS, type DoubleDoorAstragalType } from '@/lib/jobs/double-door-astragal-contract';

const control = 'min-h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm dark:border-slate-600 dark:bg-slate-950';
const button = 'min-h-9 rounded-md border border-slate-300 px-2 text-sm font-semibold dark:border-slate-600 disabled:cursor-not-allowed disabled:opacity-50';

function dimensionError(value: unknown): string | undefined {
  if (!String(value ?? '').trim()) return undefined;
  const parsed = numericDimension(value);
  return parsed.ok ? undefined : parsed.message;
}

function dimensionsDiffer(value: unknown, original: unknown): boolean {
  const current = numericDimension(value);
  const baseline = numericDimension(original);
  return current.ok && baseline.ok ? current.inches !== baseline.inches : String(value ?? '') !== String(original ?? '');
}

function initialComposition(line: DoorLineInput): GlassUnitComposition {
  const parsed = parseGlassUnitConfiguration(line.config);
  if (parsed.ok) return parsed.value;
  return { door: String(line.config).includes('DD') ? 'DD' : 'D', leftSidelightCount: 0, rightSidelightCount: 0, hasTransom: false, transomSections: 0 };
}

export function initialBuilderDraft(line: DoorLineInput): DoorLineInput {
  const composition = initialComposition(line);
  const withConfig = { ...structuredClone(line), config: resolveGlassUnitConfiguration(composition) };
  const savedSpecificationTBar = Array.isArray(withConfig.sidelightSpecifications)
    ? withConfig.sidelightSpecifications.map((entry) => normalizeTBarSize(entry.tBarSize)).find(Boolean) ?? null
    : null;
  const unitTBar = normalizeTBarSize(withConfig.transomTBarSize)
    ?? savedSpecificationTBar ?? '2.25';
  const sidelightSpecifications = canonicalSidelightSpecifications(withConfig).map((entry) => ({ ...entry, tBarSize: unitTBar, glassTypeCode: normalizeSidelightType(withConfig.sidelightType) === 'Panel' ? null : withConfig.sidelightSpecifications?.find((saved) => saved.side === entry.side && saved.index === entry.index)?.glassTypeCode ?? entry.glassTypeCode ?? 'CLEAR' as const }));
  const initialized = {
    ...withConfig,
    includeDiagramOnWorkOrder: isGlassConfiguration(withConfig.config) && withConfig.includeDiagramOnWorkOrder !== false,
    sidelightSpecifications,
    transomTBarSize: composition.hasTransom ? unitTBar : null,
    transomGlassTypeCode: composition.hasTransom ? normalizeGlassTypeCode(withConfig.transomGlassTypeCode ?? withConfig.transomGlass) : null,
  };
  if (sidelightSpecifications.length && initialized.roWidth) {
    const reconciled = reconcileGlassDimensionCommit(initialized, { kind: 'roWidth', value: initialized.roWidth });
    if (!reconciled.blockers.length || reconciled.sourcePatch.sidelightSpecifications) return { ...initialized, ...reconciled.sourcePatch };
  }
  return initialized;
}

export function GlassUnitBuilder({ line, comparisonBaseline = null, onCancel, onUse, onDraftChange, commitLabel = 'Use Calculation', embedded = false, showCalculationOutput = true, showCommitActions = true, onInlineChange }: {
  line: DoorLineInput;
  onInlineChange?: (line: DoorLineInput) => void;
  comparisonBaseline?: DoorLineInput | null;
  onCancel: () => void;
  onUse: (line: DoorLineInput, explicitDetailNeeded: boolean) => boolean | void;
  onDraftChange?: (line: DoorLineInput) => void;
  commitLabel?: string;
  embedded?: boolean;
  showCalculationOutput?: boolean;
  showCommitActions?: boolean;
}) {
  const inline = Boolean(onInlineChange);
  const dialog = useRef<HTMLDivElement>(null);
  const embeddedRef = useRef(embedded);
  const [baseline] = useState(() => JSON.stringify(initialBuilderDraft(line)));
  const [localDraft, setLocalDraft] = useState<DoorLineInput>(() => initialBuilderDraft(line));
  const draft = inline ? line : localDraft;
  function setDraft(action: DoorLineInput | ((current: DoorLineInput) => DoorLineInput)) {
    if (onInlineChange) {
      const next = typeof action === 'function' ? action(line) : action;
      setTransomWidthInput(null);
      onInlineChange(next);
    } else setLocalDraft(action);
  }
  const [localComposition, setComposition] = useState(() => initialComposition(line));
  const composition = inline ? initialComposition(line) : localComposition;
  const [message, setMessage] = useState('');
  const [compositionToast, setCompositionToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); }, []);
  const { handlers: fieldTracking } = useEditedField(line.lineId);
  const [confirmClose, setConfirmClose] = useState(false);
  const [transomWidthInput, setTransomWidthInput] = useState<string | null>(() => inline ? null : String(calculateGlassGeometry(initialBuilderDraft(line)).glassCalc?.transomWidth ?? ''));
  const dirty = JSON.stringify(draft) !== baseline || resolveGlassUnitConfiguration(composition) !== String(line.config);
  const dirtyRef = useRef(dirty);
  const onCancelRef = useRef(onCancel);
  const onDraftChangeRef = useRef(onDraftChange);
  const dimensionAuthority = useRef<GlassDimensionAuthority>({ kind: 'roWidth' });

  useEffect(() => {
    dirtyRef.current = dirty;
    onCancelRef.current = onCancel;
    onDraftChangeRef.current = onDraftChange;
  }, [dirty, onCancel, onDraftChange]);

  useEffect(() => {
    if (!inline) onDraftChangeRef.current?.(structuredClone(draft));
  }, [draft, inline]);

  function close() {
    if (dirty) setConfirmClose(true);
    else onCancel();
  }

  useEffect(() => {
    if (embeddedRef.current) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (dirtyRef.current) setConfirmClose(true);
        else onCancelRef.current();
      }
      if (event.key === 'Tab' && dialog.current) {
        const nodes = [...dialog.current.querySelectorAll<HTMLElement>('button,input,select,[tabindex]')].filter((node) => !node.hasAttribute('disabled') && node.tabIndex >= 0);
        if (!nodes.length) return;
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', keydown); };
  }, []);

  const comparisonComposition = comparisonBaseline ? initialComposition(comparisonBaseline) : null;
  const differs = (field: string, value: unknown) => {
    if (comparisonBaseline === null) return false;
    const original = comparisonBaseline[field] ?? (field === 'hand' ? 'LH' : '');
    // Dimension commits format inches; equivalent formatted values are unchanged.
    if (field === 'roWidth' || field === 'roHeight') {
      const currentDimension = numericDimension(value);
      const originalDimension = numericDimension(original);
      if (currentDimension.ok && originalDimension.ok) return currentDimension.inches !== originalDimension.inches;
    }
    return String(value ?? '') !== String(original);
  };
  const canonical = resolveGlassUnitConfiguration(composition);
  const projected = useMemo(() => inline ? draft : ({ ...draft, config: canonical }), [draft, canonical, inline]);
  const autoRoWidth = usesAutomaticCustomSlabRoWidth(projected);
  const calculatedRoWidth = autoRoWidth ? automaticCustomSlabRoWidth(projected) : null;
  const calculation = useMemo(() => calculateGlassGeometry(projected), [projected]);
  // Display each message once, retaining the strongest applicable severity.
  const displayedIssues = new Map<string, 'warning' | 'error'>();
  for (const issue of [...calculation.incompleteDetails, ...calculation.warnings]) displayedIssues.set(issue.message.trim(), 'warning');
  for (const issue of calculation.blockers) displayedIssues.set(issue.message.trim(), 'error');
  if (message.trim()) displayedIssues.set(message.trim(), 'error');

  function updateComposition(next: GlassUnitComposition) {
    if (inline && !isFrameGlassBuilderComposition(next)) {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
      setCompositionToast(true);
      toastTimer.current = setTimeout(() => { setCompositionToast(false); toastTimer.current = null; }, 5000);
      return;
    }
    const previousComposition = composition;
    const config = resolveGlassUnitConfiguration(next);
    if (!inline) setComposition(next);
    setDraft((current) => {
      const retained = nextGlassBuilderDraft(
      totalSidelightCount(next) > 0 && !normalizeSidelightType(current.sidelightType)
        ? { ...current, sidelightType: 'Glass' }
        : current,
      'config',
      config,
      );
      const unitTBar = normalizeTBarSize(retained.transomTBarSize)
        ?? normalizeTBarSize(retained.sidelightSpecifications?.[0]?.tBarSize) ?? '2.25';
      const nextDraft = {
        ...retained,
        ...(previousComposition.hasTransom && !next.hasTransom ? { transomGlass: null, roHeight: null } : {}),
        doubleDoorSizing: next.door === 'DD' ? retained.doubleDoorSizing : null,
        sidelightSpecifications: canonicalSidelightSpecifications({ ...retained, config }).map((entry) => ({ ...entry, tBarSize: unitTBar })),
        transomTBarSize: next.hasTransom ? unitTBar : null,
        transomGlassTypeCode: next.hasTransom && !previousComposition.hasTransom && !normalizeGlassTypeCode(retained.transomGlassTypeCode ?? retained.transomGlass) ? 'CLEAR' : retained.transomGlassTypeCode,
      };
      // A topology change resolves all dependent dimensions from the current RO,
      // not from a previously edited product width or a removed side's identity.
      dimensionAuthority.current = { kind: 'roWidth' };
      const reconciled = reconcileGlassTopology(current, nextDraft, dimensionAuthority.current);
      setTransomWidthInput(null);
      setMessage(reconciled.blockers[0]?.message ?? '');
      return reconciled.draft;
    });
  }

  function setField(name: string, value: unknown) {
    setDraft((current) => nextGlassBuilderDraft(current, name, value));
    setMessage('');
  }

  function updateUnitSidelightSpecification(patch: Partial<SidelightSpecification>) {
    setDraft((current) => {
      const specifications = canonicalSidelightSpecifications(current).map((entry) => ({ ...entry, ...patch }));
      return nextGlassBuilderDraft({ ...current, sidelightSpecifications: specifications }, 'sidelightSpecifications', specifications);
    });
    setMessage('');
  }

  function setUnitPanelConstructionNotes(value: string) {
    setDraft((current) => {
      const specifications = canonicalSidelightSpecifications(current).map((entry) => ({ ...entry, panelConstructionNotes: value }));
      return nextGlassBuilderDraft({ ...current, sidelightSpecifications: specifications }, 'sidelightSpecifications', specifications);
    });
    setMessage('');
  }

  function setUnitSidelightType(value: SidelightType) {
    setDraft((current) => {
      const unitTBar = normalizeTBarSize(current.transomTBarSize) ?? normalizeTBarSize(current.sidelightSpecifications?.[0]?.tBarSize) ?? automaticSidelightTBar(value);
      const specifications = canonicalSidelightSpecifications(current).map((entry) => {
        if (value === 'Glass') return { ...entry, tBarSize: unitTBar, glassTypeCode: entry.glassTypeCode ?? 'CLEAR' as const, panelSizeMode: null, panelConstructionNotes: null };
        const parsed = numericDimension(entry.finishedWidth);
        const standard = parsed.ok && (parsed.inches === 11.75 || parsed.inches === 13.75);
        return { ...entry, finishedWidth: parsed.ok ? entry.finishedWidth : '11 3/4', tBarSize: unitTBar, glassTypeCode: null, customGlassDescription: null, panelSizeMode: standard ? 'standard' as const : parsed.ok ? 'custom' as const : 'standard' as const };
      });
      return nextGlassBuilderDraft({ ...current, sidelightType: value, sidelightSpecifications: specifications, transomTBarSize: composition.hasTransom ? unitTBar : null }, 'sidelightSpecifications', specifications);
    });
    setMessage('');
  }

  function setUnitTBar(value: string) {
    const unitTBar = normalizeTBarSize(value);
    if (!unitTBar) return;
    setDraft((current) => {
      const specifications = canonicalSidelightSpecifications(current).map((entry) => ({ ...entry, tBarSize: unitTBar }));
      const withTBar = { ...current, sidelightSpecifications: specifications, transomTBarSize: composition.hasTransom ? unitTBar : null };
      const reconciled = reconcileGlassDimensionCommit(withTBar, { kind: 'roWidth', value: withTBar.roWidth });
      if (reconciled.blockers.length) { setMessage(reconciled.blockers[0].message); return current; }
      setMessage('');
      return nextGlassBuilderDraft({ ...withTBar, ...reconciled.sourcePatch }, 'sidelightSpecifications', reconciled.sourcePatch.sidelightSpecifications ?? specifications);
    });
  }

  function commitDimension(edit: Parameters<typeof reconcileGlassDimensionCommit>[1]) {
    setDraft((current) => {
      const reconciled = reconcileGlassDimensionCommit(current, edit, dimensionAuthority.current);
      if (reconciled.blockers.length) {
        setMessage(reconciled.blockers[0].message);
        return reconciled.sourcePatch.sidelightSpecifications
          ? nextGlassBuilderDraft({ ...current, ...reconciled.sourcePatch }, 'sidelightSpecifications', reconciled.sourcePatch.sidelightSpecifications ?? current.sidelightSpecifications)
          : current;
      }
      if (edit.kind !== 'sidelightTBar' && edit.kind !== 'roHeight') dimensionAuthority.current = edit;
      if (reconciled.calculatedGeometry.glassCalc?.transomWidth) setTransomWidthInput(String(reconciled.calculatedGeometry.glassCalc.transomWidth));
      setMessage('');
      return edit.kind === 'roHeight'
        ? { ...current, ...reconciled.sourcePatch }
        : nextGlassBuilderDraft({ ...current, ...reconciled.sourcePatch }, 'sidelightSpecifications', reconciled.sourcePatch.sidelightSpecifications ?? current.sidelightSpecifications);
    });
  }

  function setAstragal(value: DoubleDoorAstragalType) {
    setDraft((current) => {
      const next = nextGlassBuilderDraft(current, 'doubleDoorAstragal', value);
      const first = canonicalSidelightSpecifications(next)[0];
      if (!first?.finishedWidth) return next;
      const reconciled = reconcileGlassDimensionCommit(next, { kind: 'sidelightWidth', side: first.side, index: first.index, value: first.finishedWidth });
      if (reconciled.blockers.length) { setMessage(reconciled.blockers[0].message); return next; }
      setMessage('');
      return { ...next, ...reconciled.sourcePatch };
    });
  }

  function commitRoHeight(value: string) {
    const parsed = numericDimension(value);
    if (!parsed.ok) {
      setMessage('Enter a valid RO height in inches.');
      return;
    }
    setDraft((current) => nextGlassBuilderDraft(current, 'roHeight', parsed.formatted));
    setMessage('');
  }

  function commitUnitSidelightWidth(value: string) {
    const parsed = numericDimension(value);
    if (!parsed.ok) {
      setMessage('message' in parsed ? parsed.message : 'Enter a valid sidelight width.');
      return;
    }
    const standard = parsed.inches === 11.75 || parsed.inches === 13.75;
    const identity = canonicalSidelightSpecifications(draft)[0];
    if (!identity) return;
    setDraft((current) => {
      const specifications = canonicalSidelightSpecifications(current).map((entry) => ({ ...entry, finishedWidth: value, panelSizeMode: type === 'Panel' ? (standard ? 'standard' as const : 'custom' as const) : null }));
      const withWidth = { ...current, sidelightSpecifications: specifications };
      const reconciled = reconcileGlassDimensionCommit(withWidth, { kind: 'sidelightWidth', side: identity.side, index: identity.index, value }, dimensionAuthority.current);
      if (reconciled.blockers.length) { setMessage(reconciled.blockers[0].message); return current; }
      dimensionAuthority.current = { kind: 'sidelightWidth', side: identity.side, index: identity.index };
      if (reconciled.calculatedGeometry.glassCalc?.transomWidth) setTransomWidthInput(String(reconciled.calculatedGeometry.glassCalc.transomWidth));
      setMessage('');
      return nextGlassBuilderDraft({ ...withWidth, ...reconciled.sourcePatch }, 'sidelightSpecifications', reconciled.sourcePatch.sidelightSpecifications);
    });
  }

  function commitTransomWidth(value: string) {
    const parsed = numericDimension(value);
    if (!parsed.ok) {
      setMessage('message' in parsed ? parsed.message : 'Enter a valid transom width.');
      return;
    }
    commitDimension({ kind: 'transomWidth', value });
  }

  function applyConfiguration(explicitDetailNeeded: boolean) {
    const result = calculateGlassGeometry({ ...draft, config: canonical });
    if (result.status === 'Blocked' || result.status === 'Unsupported') {
      setMessage(result.blockers[0]?.message ?? result.incompleteDetails[0]?.message ?? 'Complete the required glass-unit information.');
      return;
    }
    if (result.status === 'Glass Detail Needed' && !explicitDetailNeeded) {
      setMessage('Required details are missing. Use Leave Details Needed to preserve the line.');
      return;
    }
    const committed = onUse({
      ...draft, config: canonical, glassCalcStatus: result.status, glassWarnings: result.warnings,
      glassBlockers: result.blockers, glassWorkorderDetail: result.workorderDetail, glassUnits: result.glassUnits,
      panelSidelights: result.panelSidelights, glassCalc: result.glassCalc, vendorCopyText: result.vendorCopyText,
      glassOverride: result.override, includeDiagramOnWorkOrder: draft.includeDiagramOnWorkOrder !== false,
    }, explicitDetailNeeded);
    if (committed === false) setMessage('The door line could not be committed. Review the door fields and try again.');
  }

  const type = normalizeSidelightType(draft.sidelightType);
  const sideCount = totalSidelightCount(composition);
  const specifications = canonicalSidelightSpecifications(projected);
  const diagramLayout = calculation.glassCalc
    ? undefined
    : calculateGlassCompositionSchematic({ ...projected, config: canonical });
  const resultRows = glassResultRows(projected, calculation.glassUnits, calculation.panelSidelights);
  const vendorCopy = aggregateVendorCopy(projected, calculation.glassUnits, calculation.vendorCopyText);
  const originalSpecification = comparisonBaseline ? canonicalSidelightSpecifications(comparisonBaseline)[0] : null;
  const specificationDiffers = (field: keyof SidelightSpecification) => {
    if (!comparisonBaseline) return false;
    const value = specifications[0]?.[field];
    const original = originalSpecification?.[field];
    return field === 'finishedWidth' ? dimensionsDiffer(value, original) : String(value ?? '') !== String(original ?? '');
  };
  const originalTransomWidth = comparisonBaseline ? calculateGlassGeometry(comparisonBaseline).glassCalc?.transomWidth : null;
  const transomWidthDiffers = comparisonBaseline !== null && dimensionsDiffer(transomWidthInput ?? calculation.glassCalc?.transomWidth, originalTransomWidth);

  function toggleTransom() {
    if (composition.hasTransom && (draft.transomGlass || draft.roHeight) && !window.confirm('Remove the transom and discard its entered data?')) return;
    updateComposition({ ...composition, hasTransom: !composition.hasTransom, transomSections: composition.hasTransom ? 0 : 1 });

  }
  return <div {...(inline ? {} : fieldTracking)} data-editing-fields={inline ? undefined : true} className={`glass-entry-workspace ${inline ? 'door-inline-glass min-w-0' : embedded ? 'glass-calculator-editor min-w-0' : 'app-overlay-workspace grid bg-slate-950/70 p-0 sm:p-4'}`} onMouseDown={embedded ? undefined : (event) => { if (event.target === event.currentTarget) close(); }}>
    <div aria-labelledby="glass-builder-title" aria-modal={embedded ? undefined : true} className={`glass-unit-builder grid w-full overflow-hidden bg-white dark:bg-slate-900 ${inline ? 'rounded-lg border border-slate-200' : embedded ? 'h-[calc(100vh-6rem)] rounded-lg border border-slate-200' : 'm-auto h-full max-h-[96vh] max-w-[min(1500px,98vw)] shadow-2xl sm:rounded-2xl'}`} ref={dialog} role={embedded ? undefined : 'dialog'} tabIndex={embedded ? undefined : -1}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900"><div><h2 className="text-xl font-bold" id="glass-builder-title">Glass configuration</h2><p className="font-mono text-lg font-bold text-sky-700 dark:text-sky-300">{inline ? String(draft.config) : canonical}</p></div>{!inline ? <button aria-label={embedded ? 'Reset calculation editor' : 'Close builder'} className={button} onClick={close} tabIndex={embedded ? undefined : -1} type="button">{embedded ? 'Reset' : 'Cancel'}</button> : null}</header>
      <div className="glass-builder-workspace grid min-h-0 overflow-y-auto p-2 lg:grid-cols-2 lg:gap-3">
        <section className="grid content-start gap-2">
          <div className="flex flex-wrap items-end gap-3"><div className="grid gap-1 text-sm font-semibold"><span>Unit</span><div className="flex gap-2">{(['D', 'DD'] as const).map((door) => <button aria-pressed={composition.door === door} data-comparison-different={composition.door === door && comparisonComposition !== null && comparisonComposition.door !== door || undefined} className={button} key={door} onClick={() => updateComposition({ ...composition, door })} type="button">{door === 'D' ? 'Single Door' : 'Double Door'}</button>)}</div></div>{composition.hasTransom && composition.leftSidelightCount === 1 && composition.rightSidelightCount === 1 ? <label className="grid gap-1 text-sm font-semibold">Transom Layout<select data-comparison-different={comparisonComposition?.hasTransom && comparisonComposition.leftSidelightCount === 1 && comparisonComposition.rightSidelightCount === 1 && comparisonComposition.transomSections !== composition.transomSections || undefined} className={control} onChange={(event) => updateComposition({ ...composition, transomSections: event.target.value === '3' ? 3 : 1 })} value={String(composition.transomSections ?? 1)}><option value="1">Single section</option><option value="3">Three aligned sections (TTT)</option></select></label> : null}</div>
          <div className="glass-structure-control" aria-label="Door unit configuration controls">
            <GlassUnitDiagram layout={diagramLayout} line={calculation.glassCalc ? { ...projected, glassCalc: calculation.glassCalc } : projected}/>
            <button aria-label="Add left sidelight" className="glass-structure-action glass-structure-action--left-add" disabled={composition.leftSidelightCount >= 3} onClick={() => updateComposition({ ...composition, leftSidelightCount: Math.min(3, composition.leftSidelightCount + 1) })} type="button">+</button>
            {composition.leftSidelightCount ? <button aria-label="Remove left sidelight" className="glass-structure-action glass-structure-action--left-remove" onClick={() => updateComposition({ ...composition, leftSidelightCount: Math.max(0, composition.leftSidelightCount - 1) })} type="button">−</button> : null}
            <button aria-label="Add right sidelight" className="glass-structure-action glass-structure-action--right-add" disabled={composition.rightSidelightCount >= 3} onClick={() => updateComposition({ ...composition, rightSidelightCount: Math.min(3, composition.rightSidelightCount + 1) })} type="button">+</button>
            {composition.rightSidelightCount ? <button aria-label="Remove right sidelight" className="glass-structure-action glass-structure-action--right-remove" onClick={() => updateComposition({ ...composition, rightSidelightCount: Math.max(0, composition.rightSidelightCount - 1) })} type="button">−</button> : null}
            <button aria-label={composition.hasTransom ? 'Remove transom' : 'Add transom'} className="glass-structure-action glass-structure-action--transom" onClick={toggleTransom} type="button">{composition.hasTransom ? '− Transom' : '+ Transom'}</button>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">Viewed from outside. Left and right positions are independent; each side supports up to three sidelights.</p>
        </section>
        <section className="glass-builder-fields mt-3 grid content-start gap-2 lg:mt-0">
          <div className="glass-measurements grid grid-cols-2 gap-3" aria-label="Measurements">{autoRoWidth ? <p className="grid gap-1 text-sm font-semibold">RO Width <span className="font-normal" data-testid="calculated-ro-width">{calculatedRoWidth ? calculatedRoWidth.display + ' - calculated' : 'Enter custom slab dimensions to calculate.'}</span></p> : <DimensionInput label="RO Width" inputLabel="RO Width (inches)" different={differs('roWidth', draft.roWidth)} error={dimensionError(draft.roWidth)} onBlur={(event) => commitDimension({ kind: 'roWidth', value: event.target.value })} onValue={(value) => setField('roWidth', value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} value={String(draft.roWidth ?? '')}/>}<DimensionInput label="RO Height" inputLabel="RO Height (inches)" different={differs('roHeight', draft.roHeight)} error={dimensionError(draft.roHeight)} onBlur={(event) => commitRoHeight(event.target.value)} onValue={(value) => setField('roHeight', value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitRoHeight(event.currentTarget.value); event.currentTarget.blur(); } }} value={String(draft.roHeight ?? '')}/>
            {sideCount ? <DimensionInput label="Sidelight Product Width" inputLabel="Sidelight Product Width (inches)" different={specificationDiffers('finishedWidth')} error={dimensionError(specifications[0]?.finishedWidth)} onBlur={(event) => commitUnitSidelightWidth(event.target.value)} onValue={(value) => setDraft((current) => nextGlassBuilderDraft(current, 'sidelightSpecifications', canonicalSidelightSpecifications(current).map((entry) => ({ ...entry, finishedWidth: value }))))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} value={specifications[0]?.finishedWidth ?? ''}/> : null}
            {composition.hasTransom ? <DimensionInput label="Transom Product Width" inputLabel="Transom Product Width (inches)" different={transomWidthDiffers} error={dimensionError(transomWidthInput ?? calculation.glassCalc?.transomWidth)} onBlur={(event) => { commitTransomWidth(event.target.value); if (inline) setTransomWidthInput(null); }} onValue={(value) => setTransomWidthInput(value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} value={transomWidthInput ?? String(calculation.glassCalc?.transomWidth ?? '')}/> : null}
          </div>
          {composition.door === 'DD' ? <label className="grid gap-1 text-sm font-semibold">Astragal<select data-comparison-different={(comparisonBaseline !== null && (draft.doubleDoorAstragal ?? DEFAULT_DOUBLE_DOOR_ASTRAGAL) !== (comparisonBaseline.doubleDoorAstragal ?? DEFAULT_DOUBLE_DOOR_ASTRAGAL)) || undefined} className={control} onChange={(event) => setAstragal(event.target.value as DoubleDoorAstragalType)} value={String(draft.doubleDoorAstragal ?? DEFAULT_DOUBLE_DOOR_ASTRAGAL)}>{Object.entries(DOUBLE_DOOR_ASTRAGALS).map(([value, option]) => <option key={value} value={value}>{option.label}</option>)}</select></label> : null}
          {sideCount ? <section className="grid gap-2" aria-label="Shared sidelight specification"><label className="grid gap-1 text-sm font-semibold">Sidelight Type<select data-comparison-different={(comparisonBaseline !== null && (type ?? 'Glass') !== (normalizeSidelightType(comparisonBaseline.sidelightType) ?? 'Glass')) || undefined} className={control} onChange={(event) => setUnitSidelightType(event.target.value as SidelightType)} value={type ?? 'Glass'}><option>Glass</option><option>Panel</option></select></label><label className="grid gap-1 text-sm font-semibold">Unit T-bar Size<select data-comparison-different={(comparisonBaseline !== null && String(draft.transomTBarSize ?? specifications[0]?.tBarSize ?? automaticSidelightTBar(type ?? 'Glass')) !== String(comparisonBaseline.transomTBarSize ?? originalSpecification?.tBarSize ?? automaticSidelightTBar(normalizeSidelightType(comparisonBaseline.sidelightType) ?? 'Glass'))) || undefined} className={control} onChange={(event) => setUnitTBar(event.target.value)} value={String(draft.transomTBarSize ?? specifications[0]?.tBarSize ?? automaticSidelightTBar(type ?? 'Glass'))}><option value="1.5">1-1/2&quot;</option><option value="2.25">2-1/4&quot;</option></select></label>{type === 'Glass' ? <><label className="grid gap-1 text-sm font-semibold">Glass Type<select data-comparison-different={(specificationDiffers('glassTypeCode')) || undefined} className={control} onChange={(event) => updateUnitSidelightSpecification({ glassTypeCode: event.target.value as GlassTypeCode, customGlassDescription: event.target.value === 'CUSTOM' ? specifications[0]?.customGlassDescription : null })} value={specifications[0]?.glassTypeCode ?? 'CLEAR'}><option value="CLEAR">Clear</option><option value="SATIN_ETCH">Satin Etch</option><option value="CUSTOM">Custom</option></select></label>{specifications[0]?.glassTypeCode === 'CUSTOM' ? <label className="grid gap-1 text-sm font-semibold">Custom Glass Description<input data-comparison-different={(specificationDiffers('customGlassDescription')) || undefined} className={control} onChange={(event) => updateUnitSidelightSpecification({ customGlassDescription: event.target.value })} value={specifications[0]?.customGlassDescription ?? ''}/></label> : null}</> : null}</section> : null}
          {sideCount && type === 'Panel' ? <label className="grid gap-1 text-sm font-semibold">Sidelight Panel Construction Notes<textarea data-comparison-different={(specificationDiffers('panelConstructionNotes')) || undefined} className={control} onChange={(event) => setUnitPanelConstructionNotes(event.target.value)} value={specifications[0]?.panelConstructionNotes ?? ''}/></label> : null}
          {composition.hasTransom ? <fieldset className="grid gap-3 rounded-md border border-slate-300 p-3 dark:border-slate-600"><legend className="px-2 font-bold">Transom</legend>{composition.door === 'DD' && !sideCount ? <label className="grid gap-1 text-sm font-semibold">Transom T-bar Size<select data-comparison-different={(comparisonBaseline !== null && (draft.transomTBarSize ?? automaticTransomTBar(2)) !== (comparisonBaseline.transomTBarSize ?? automaticTransomTBar(2))) || undefined} className={control} onChange={(event) => setUnitTBar(event.target.value)} value={String(draft.transomTBarSize ?? automaticTransomTBar(2))}><option value="1.5">1-1/2&quot;</option><option value="2.25">2-1/4&quot;</option></select></label> : null}<label className="grid gap-1 text-sm font-semibold">Transom Glass Type<select data-comparison-different={differs('transomGlassTypeCode', draft.transomGlassTypeCode) || undefined} className={control} onChange={(event) => setField('transomGlassTypeCode', event.target.value)} value={String(draft.transomGlassTypeCode ?? '')}><option value="">Choose glass</option><option value="CLEAR">Clear</option><option value="SATIN_ETCH">Satin Etch</option><option value="CUSTOM">Custom</option></select></label>{draft.transomGlassTypeCode === 'CUSTOM' ? <label className="grid gap-1 text-sm font-semibold">Custom Transom Glass Description<input data-comparison-different={differs('transomCustomGlassDescription', draft.transomCustomGlassDescription) || undefined} className={control} onChange={(event) => setField('transomCustomGlassDescription', event.target.value)} value={String(draft.transomCustomGlassDescription ?? '')}/></label> : null}</fieldset> : null}
          <label className="flex min-h-11 items-center gap-3 rounded-md border border-slate-300 px-3"><input data-comparison-different={comparisonBaseline !== null && (draft.includeDiagramOnWorkOrder !== false) !== (comparisonBaseline.includeDiagramOnWorkOrder !== false) || undefined} checked={draft.includeDiagramOnWorkOrder !== false} onChange={(event) => setField('includeDiagramOnWorkOrder', event.target.checked)} type="checkbox"/>Include diagram on work order</label>
          {showCalculationOutput ? <><div className="rounded-md border border-slate-200 p-3 dark:border-slate-700"><strong>Status: {statusLabel(calculation.status)}</strong>{calculation.glassCalc ? <><dl className="mt-2 grid gap-1 text-sm" aria-label="Calculated measurements"><div><dt className="inline font-semibold">Jamb legs: </dt><dd className="inline">{String(calculation.glassCalc.jambLeg)}</dd></div><div><dt className="inline font-semibold">Header / sill length: </dt><dd className="inline">{String(calculation.glassCalc.headerWidth)}</dd></div><div><dt className="inline font-semibold">Divider / T-bar size: </dt><dd className="inline">{String(calculation.glassCalc.divider)}</dd></div>{resultRows.map((row) => <div data-glass-result={row.key} key={row.key}><dt className="inline font-semibold">{row.label}: </dt><dd className="inline">{row.value}</dd></div>)}</dl></> : null}</div>
          {vendorCopy ? <details className="rounded-md border border-slate-200 p-3 dark:border-slate-700"><summary className="font-semibold">Vendor-copy preview</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{vendorCopy}</pre><button className={`${button} mt-2`} onClick={() => void navigator.clipboard.writeText(vendorCopy)} type="button">Copy Vendor Text</button></details> : null}</> : null}
          {[...displayedIssues].map(([text, severity]) => <p aria-live={severity === 'error' ? 'assertive' : 'polite'} className={`rounded-lg p-3 text-sm ${severity === 'error' ? 'bg-rose-100 text-rose-950' : 'bg-amber-100 text-amber-950'}`} key={text}>{text}</p>)}
          {!inline && calculation.override ? <p className="rounded-lg bg-violet-100 p-2 text-sm text-violet-950">Geometry Exception Approved: {calculation.override.reason}</p> : null}
        </section>
      </div>
      {!inline ? <footer className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900"><button className={button} onClick={close} type="button">{embedded ? 'Reset' : 'Cancel'}</button>{showCommitActions && calculation.status === 'Glass Detail Needed' ? <button className={`${button} bg-amber-600 text-white`} onClick={() => applyConfiguration(true)} type="button">Leave Details Needed</button> : null}{showCommitActions && ['Complete', 'Warning', 'Manual Override'].includes(calculation.status) ? <button className={`${button} bg-sky-700 text-white`} onClick={() => applyConfiguration(false)} type="button">{commitLabel}</button> : null}</footer> : null}
      {compositionToast ? <div className="glass-composition-toast pointer-events-none fixed bottom-20 left-1/2 z-50 w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg" role="status">With Glass requires at least one glass unit. Change Configuration to D or DD to remove all glass.</div> : null}
      <UnsavedChangesDialog description="The Glass Unit Builder has changes that have not been applied to this door line. Discard them?" onDiscard={() => { setConfirmClose(false); onCancel(); }} onStay={() => setConfirmClose(false)} open={confirmClose} title="Discard Glass changes?"/>
    </div>
  </div>;
}
