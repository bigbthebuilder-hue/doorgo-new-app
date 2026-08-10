'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  parseGlassUnitConfiguration, placeSingleSidelightForSwing, resolveGlassUnitConfiguration,
  totalSidelightCount, type GlassUnitComposition,
} from '@/lib/jobs/glass-unit-composition-contract';
import { calculateGlassCompositionSchematic } from '@/lib/jobs/glass-diagram-contract';
import { nextGlassBuilderDraft } from '@/lib/jobs/glass-editor-contract';
import { DOOR_HEIGHTS, EXTERIOR_WIDTHS, prepAfterHeightChange } from '@/lib/jobs/door-line-contract';
import { automaticSidelightTBar, automaticTransomTBar, calculateGlassGeometry, glassConfigurationTopology, normalizeGlassTypeCode, normalizeSidelightType, normalizeTBarSize, numericDimension } from '@/lib/jobs/glass-geometry-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit, type GlassDimensionAuthority, type SidelightIdentity } from '@/lib/jobs/glass-dimension-reconciliation-contract';
import type { DoorLineInput, GlassTypeCode, SidelightSpecification, SidelightType } from '@/lib/jobs/job-intake-types';
import { GlassUnitDiagram } from './GlassUnitDiagram';

const control = 'min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 dark:border-slate-600 dark:bg-slate-950';
const button = 'min-h-11 rounded-xl border border-slate-300 px-3 font-semibold dark:border-slate-600 disabled:cursor-not-allowed disabled:opacity-40';

function initialComposition(line: DoorLineInput): GlassUnitComposition {
  const parsed = parseGlassUnitConfiguration(line.config);
  if (parsed.ok) return parsed.value;
  return { door: String(line.config).includes('DD') ? 'DD' : 'D', leftSidelightCount: 0, rightSidelightCount: 0, hasTransom: false };
}

function initialBuilderDraft(line: DoorLineInput): DoorLineInput {
  const composition = initialComposition(line);
  const config = resolveGlassUnitConfiguration(composition);
  const withConfig = { ...structuredClone(line), config };
  const doorCount = composition.door === 'DD' ? 2 : 1;
  const savedSpecificationTBar = Array.isArray(withConfig.sidelightSpecifications)
    ? withConfig.sidelightSpecifications.map((entry) => normalizeTBarSize(entry.tBarSize)).find(Boolean) ?? null
    : null;
  const unitTBar = normalizeTBarSize(withConfig.transomTBarSize) ?? savedSpecificationTBar
    ?? (composition.hasTransom ? automaticTransomTBar(doorCount) : automaticSidelightTBar(normalizeSidelightType(withConfig.sidelightType) ?? 'Glass'));
  const sidelightSpecifications = canonicalSidelightSpecifications(withConfig).map((entry) => ({ ...entry, tBarSize: unitTBar }));
  const initialized = {
    ...withConfig,
    sidelightSpecifications,
    transomTBarSize: composition.hasTransom ? unitTBar : null,
    transomGlassTypeCode: composition.hasTransom ? normalizeGlassTypeCode(withConfig.transomGlassTypeCode ?? withConfig.transomGlass) : null,
  };
  if (sidelightSpecifications.length && initialized.roWidth) {
    const reconciled = reconcileGlassDimensionCommit(initialized, { kind: 'roWidth', value: initialized.roWidth });
    if (!reconciled.blockers.length) return { ...initialized, ...reconciled.sourcePatch };
  }
  return initialized;
}

export function GlassUnitBuilder({ line, onCancel, onUse, commitLabel = 'Use Calculation' }: {
  line: DoorLineInput;
  onCancel: () => void;
  onUse: (line: DoorLineInput, explicitDetailNeeded: boolean) => boolean | void;
  commitLabel?: string;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const [baseline] = useState(() => JSON.stringify(initialBuilderDraft(line)));
  const [draft, setDraft] = useState<DoorLineInput>(() => initialBuilderDraft(line));
  const [composition, setComposition] = useState(() => initialComposition(line));
  const [message, setMessage] = useState('');
  const [transomWidthInput, setTransomWidthInput] = useState(() => String(calculateGlassGeometry(initialBuilderDraft(line)).glassCalc?.transomWidth ?? ''));
  const dirty = JSON.stringify(draft) !== baseline || resolveGlassUnitConfiguration(composition) !== String(line.config);
  const dirtyRef = useRef(dirty);
  const onCancelRef = useRef(onCancel);
  const dimensionAuthority = useRef<GlassDimensionAuthority>({ kind: 'roWidth' });

  useEffect(() => {
    dirtyRef.current = dirty;
    onCancelRef.current = onCancel;
  }, [dirty, onCancel]);

  function close() {
    if (!dirty || window.confirm('Discard Glass Unit Builder changes?')) onCancel();
  }

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!dirtyRef.current || window.confirm('Discard Glass Unit Builder changes?')) onCancelRef.current();
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

  const canonical = resolveGlassUnitConfiguration(composition);
  const projected = useMemo(() => ({ ...draft, config: canonical }), [draft, canonical]);
  const calculation = useMemo(() => calculateGlassGeometry(projected), [projected]);

  function updateComposition(next: GlassUnitComposition) {
    const positioned = totalSidelightCount(next) === 1 ? placeSingleSidelightForSwing(next, draft.hand) : next;
    const config = resolveGlassUnitConfiguration(positioned);
    setComposition(positioned);
    setDraft((current) => {
      const retained = nextGlassBuilderDraft(
      totalSidelightCount(positioned) > 0 && !normalizeSidelightType(current.sidelightType)
        ? { ...current, sidelightType: 'Glass' }
        : current,
      'config',
      config,
      );
      return {
        ...retained,
        sidelightSpecifications: canonicalSidelightSpecifications({ ...retained, config }).map((entry) => ({ ...entry, tBarSize: normalizeTBarSize(retained.transomTBarSize) ?? normalizeTBarSize(retained.sidelightSpecifications?.[0]?.tBarSize) ?? automaticSidelightTBar(normalizeSidelightType(retained.sidelightType) ?? 'Glass') })),
        transomTBarSize: positioned.hasTransom ? normalizeTBarSize(retained.transomTBarSize) ?? normalizeTBarSize(retained.sidelightSpecifications?.[0]?.tBarSize) ?? automaticTransomTBar(positioned.door === 'DD' ? 2 : 1) : null,
      };
    });
    setMessage('');
  }

  function setField(name: string, value: unknown) {
    setDraft((current) => nextGlassBuilderDraft(current, name, value));
    setMessage('');
  }

  function updateSpecification(identity: SidelightIdentity, patch: Partial<SidelightSpecification>) {
    setDraft((current) => {
      const specifications = canonicalSidelightSpecifications(current).map((entry) => entry.side === identity.side && entry.index === identity.index ? { ...entry, ...patch } : entry);
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
      setMessage('Unit T-bar updated; dependent dimensions recalculated.');
      return nextGlassBuilderDraft({ ...withTBar, ...reconciled.sourcePatch }, 'sidelightSpecifications', reconciled.sourcePatch.sidelightSpecifications);
    });
  }

  function commitDimension(edit: Parameters<typeof reconcileGlassDimensionCommit>[1]) {
    setDraft((current) => {
      const reconciled = reconcileGlassDimensionCommit(current, edit, dimensionAuthority.current);
      if (reconciled.blockers.length) { setMessage(reconciled.blockers[0].message); return current; }
      if (edit.kind !== 'sidelightTBar' && edit.kind !== 'roHeight') dimensionAuthority.current = edit;
      if (reconciled.calculatedGeometry.glassCalc?.transomWidth) setTransomWidthInput(String(reconciled.calculatedGeometry.glassCalc.transomWidth));
      setMessage(reconciled.informationalNotices[0]?.message ?? 'Dependent dimensions recalculated.');
      return edit.kind === 'roHeight'
        ? { ...current, ...reconciled.sourcePatch }
        : nextGlassBuilderDraft({ ...current, ...reconciled.sourcePatch }, 'sidelightSpecifications', reconciled.sourcePatch.sidelightSpecifications);
    });
  }

  function commitRoHeight(value: string) {
    const parsed = numericDimension(value);
    if (!parsed.ok) {
      setMessage('Enter a valid RO height in inches.');
      return;
    }
    setDraft((current) => nextGlassBuilderDraft(current, 'roHeight', parsed.formatted));
    setMessage('RO height normalized; calculated measurements updated.');
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
      setMessage('Common sidelight product width committed; dependent dimensions recalculated.');
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

  function setHeight(value: string) {
    setDraft((current) => nextGlassBuilderDraft(
      { ...current, prep: prepAfterHeightChange('Exterior', canonical, current.prep, value) },
      'height',
      value,
    ));
    setMessage('');
  }

  function changeSwing(value: string) {
    setDraft((current) => ({ ...current, hand: value, glassCalc: null, glassOverride: null }));
    if (totalSidelightCount(composition) === 1) setComposition((current) => placeSingleSidelightForSwing(current, value));
  }

  function applyConfiguration(explicitDetailNeeded: boolean) {
    const result = calculateGlassGeometry({ ...draft, config: canonical });
    if (result.status === 'Blocked' || result.status === 'Unsupported') {
      setMessage(result.blockers[0]?.message ?? result.incompleteDetails[0]?.message ?? 'Complete the required glass-unit information.');
      return;
    }
    if (result.status === 'Glass Detail Needed' && !explicitDetailNeeded) {
      setMessage('Required glass detail is incomplete. Use Leave Glass Detail Needed to preserve the line.');
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
  const latchSide = ['LH', 'RHOUT'].includes(String(draft.hand)) ? 'right' : 'left';
  const diagramLayout = calculation.glassCalc
    ? undefined
    : calculateGlassCompositionSchematic(projected);
  return <div className="fixed inset-0 z-50 grid bg-slate-950/70 p-0 sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <div aria-labelledby="glass-builder-title" aria-modal="true" className="glass-unit-builder m-auto grid h-full max-h-[96vh] w-full max-w-[min(1500px,98vw)] overflow-hidden bg-white shadow-2xl dark:bg-slate-900 sm:rounded-2xl" ref={dialog} role="dialog" tabIndex={-1}>
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900"><div><h2 className="text-xl font-bold" id="glass-builder-title">Exterior Glass Unit Builder</h2><p className="font-mono text-lg font-bold text-sky-700 dark:text-sky-300">{canonical}</p></div><button aria-label="Close builder" className={button} onClick={close} tabIndex={-1} type="button">Cancel</button></header>
      <div className="grid min-h-0 overflow-y-auto p-3 lg:grid-cols-2 lg:gap-4">
        <section className="grid content-start gap-4">
          <div className="grid grid-cols-2 gap-2"><button className={button} onClick={() => updateComposition({ ...composition, door: 'D' })} type="button">Single Door</button><button className={button} onClick={() => updateComposition({ ...composition, door: 'DD' })} type="button">Double Door</button></div>
          <button className={button} onClick={() => {
            if (composition.hasTransom && (draft.transomGlass || draft.roHeight) && !window.confirm('Remove the transom and discard its entered data?')) return;
            updateComposition({ ...composition, hasTransom: !composition.hasTransom });
            if (composition.hasTransom) setDraft((current) => ({ ...current, transomGlass: null, roHeight: null }));
          }} type="button">{composition.hasTransom ? '− Remove Transom' : '+ Add Transom Above'}</button>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-slate-100 p-4 dark:bg-slate-800">
            <div className="grid gap-2 text-center"><strong>Left: {composition.leftSidelightCount}</strong><button className={button} disabled={sideCount === 0 && latchSide !== 'left'} onClick={() => updateComposition({ ...composition, leftSidelightCount: Math.min(3, composition.leftSidelightCount + 1) })} type="button">+ Left</button><button className={button} disabled={!composition.leftSidelightCount} onClick={() => updateComposition({ ...composition, leftSidelightCount: Math.max(0, composition.leftSidelightCount - 1) })} type="button">− Left</button></div>
            <div className="rounded-lg border-2 border-slate-500 px-8 py-16 font-bold">{composition.door}</div>
            <div className="grid gap-2 text-center"><strong>Right: {composition.rightSidelightCount}</strong><button className={button} disabled={sideCount === 0 && latchSide !== 'right'} onClick={() => updateComposition({ ...composition, rightSidelightCount: Math.min(3, composition.rightSidelightCount + 1) })} type="button">+ Right</button><button className={button} disabled={!composition.rightSidelightCount} onClick={() => updateComposition({ ...composition, rightSidelightCount: Math.max(0, composition.rightSidelightCount - 1) })} type="button">− Right</button></div>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Viewed from outside. The first sidelight stays on the latch side; multi-sidelight arrangements remain explicit.</p>
          <GlassUnitDiagram layout={diagramLayout} line={calculation.glassCalc ? { ...projected, glassCalc: calculation.glassCalc } : projected}/>
        </section>
        <section className="mt-5 grid content-start gap-3 lg:mt-0">
          <label className="grid gap-1 font-semibold">Swing<select className={control} onChange={(event) => changeSwing(event.target.value)} value={String(draft.hand ?? 'LH')}><option>LH</option><option>RH</option><option>LHOUT</option><option>RHOUT</option></select></label>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 font-semibold">Slab Width<select className={control} onChange={(event) => setField('width', event.target.value)} value={String(draft.width ?? '')}>{EXTERIOR_WIDTHS.map((value) => <option key={value}>{value}</option>)}</select></label><label className="grid gap-1 font-semibold">Slab Height<select className={control} onChange={(event) => setHeight(event.target.value)} value={String(draft.height ?? '')}>{DOOR_HEIGHTS.map((value) => <option key={value}>{value}</option>)}</select></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 font-semibold">RO Width (inches)<input className={control} onBlur={(event) => commitDimension({ kind: 'roWidth', value: event.target.value })} onChange={(event) => setField('roWidth', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} value={String(draft.roWidth ?? '')}/></label><label className="grid gap-1 font-semibold">RO Height (inches)<input className={control} onBlur={(event) => commitRoHeight(event.target.value)} onChange={(event) => setField('roHeight', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commitRoHeight(event.currentTarget.value); event.currentTarget.blur(); } }} value={String(draft.roHeight ?? '')}/></label></div>
          {sideCount ? <section className="grid gap-3" aria-label="Sidelight specifications"><label className="grid gap-1 font-semibold">Sidelight Type<select className={control} onChange={(event) => setUnitSidelightType(event.target.value as SidelightType)} value={type ?? 'Glass'}><option>Glass</option><option>Panel</option></select></label><label className="grid gap-1 font-semibold">Unit T-bar Size<select className={control} onChange={(event) => setUnitTBar(event.target.value)} value={String(draft.transomTBarSize ?? specifications[0]?.tBarSize ?? automaticSidelightTBar(type ?? 'Glass'))}><option value="1.5">1-1/2 inch</option><option value="2.25">2-1/4 inch</option></select></label><label className="grid gap-1 font-semibold">Sidelight Product Width (inches)<input className={control} onBlur={(event) => commitUnitSidelightWidth(event.target.value)} onChange={(event) => setDraft((current) => nextGlassBuilderDraft(current, 'sidelightSpecifications', canonicalSidelightSpecifications(current).map((entry) => ({ ...entry, finishedWidth: event.target.value }))))} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} value={specifications[0]?.finishedWidth ?? ''}/></label><h3 className="font-bold">Sidelight positions</h3>{specifications.map((specification) => { const identity = { side: specification.side, index: specification.index } as const; const positionType = type ?? 'Glass'; return <fieldset className="grid gap-3 rounded-xl border border-slate-300 p-3 dark:border-slate-600" key={`${specification.side}:${specification.index}`}><legend className="px-2 font-semibold">{specification.side === 'left' ? 'Left' : 'Right'} sidelight {specification.index}</legend>
{positionType === 'Glass' ? <><label className="grid gap-1 font-semibold">Glass Type<select className={control} onChange={(event) => updateSpecification(identity, { glassTypeCode: event.target.value as GlassTypeCode, customGlassDescription: event.target.value === 'CUSTOM' ? specification.customGlassDescription : null })} value={specification.glassTypeCode ?? ''}><option value="">Choose glass</option><option value="CLEAR">Clear</option><option value="SATIN_ETCH">Satin Etch</option><option value="CUSTOM">Custom</option></select></label>{specification.glassTypeCode === 'CUSTOM' ? <label className="grid gap-1 font-semibold">Custom Glass Description<input className={control} onChange={(event) => updateSpecification(identity, { customGlassDescription: event.target.value })} value={specification.customGlassDescription ?? ''}/></label> : null}</> : null}</fieldset>; })}</section> : null}
          {sideCount && type === 'Panel' ? <label className="grid gap-1 font-semibold">Sidelight Panel Construction Notes<textarea className={control} onChange={(event) => setUnitPanelConstructionNotes(event.target.value)} value={specifications[0]?.panelConstructionNotes ?? ''}/></label> : null}
          {composition.hasTransom ? <fieldset className="grid gap-3 rounded-xl border border-slate-300 p-3 dark:border-slate-600"><legend className="px-2 font-bold">Transom</legend><label className="grid gap-1 font-semibold">Transom Glass Type<select className={control} onChange={(event) => setField('transomGlassTypeCode', event.target.value)} value={String(draft.transomGlassTypeCode ?? '')}><option value="">Choose glass</option><option value="CLEAR">Clear</option><option value="SATIN_ETCH">Satin Etch</option><option value="CUSTOM">Custom</option></select></label>{draft.transomGlassTypeCode === 'CUSTOM' ? <label className="grid gap-1 font-semibold">Custom Transom Glass Description<input className={control} onChange={(event) => setField('transomCustomGlassDescription', event.target.value)} value={String(draft.transomCustomGlassDescription ?? '')}/></label> : null}<label className="grid gap-1 font-semibold">Transom Product Width (inches)<input className={control} onBlur={(event) => commitTransomWidth(event.target.value)} onChange={(event) => setTransomWidthInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} value={transomWidthInput}/></label></fieldset> : null}
          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-slate-300 px-3"><input checked={draft.includeDiagramOnWorkOrder !== false} onChange={(event) => setField('includeDiagramOnWorkOrder', event.target.checked)} type="checkbox"/>Include diagram on work order</label>
          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><strong>Status: {calculation.status}</strong>{calculation.glassCalc ? <><dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm" aria-label="Calculated measurements">{specifications[0]?.finishedWidth ? <div><dt className="font-semibold">Sidelight Product Width</dt><dd>{specifications[0].finishedWidth}</dd></div> : null}{calculation.glassUnits.filter((unit) => /sidelight/i.test(unit.position)).map((unit) => <div key={`${unit.position}:glass-size`}><dt className="font-semibold">{unit.position} Glass Order Size</dt><dd>{unit.width} × {unit.height}</dd></div>)}{calculation.glassCalc.transomWidth ? <div><dt className="font-semibold">Transom Product Size</dt><dd>{String(calculation.glassCalc.transomWidth)} × {String(calculation.glassCalc.transomHeight)}</dd></div> : null}</dl><pre className="mt-2 whitespace-pre-wrap text-xs">{calculation.workorderDetail}</pre></> : null}</div>
          {calculation.vendorCopyText ? <details className="rounded-xl border border-slate-200 p-3 dark:border-slate-700"><summary className="font-semibold">Vendor-copy preview</summary><pre className="mt-2 whitespace-pre-wrap text-xs">{calculation.vendorCopyText}</pre><button className={`${button} mt-2`} onClick={() => void navigator.clipboard.writeText(calculation.vendorCopyText)} type="button">Copy Vendor Text</button></details> : null}
          {[...calculation.incompleteDetails, ...calculation.warnings, ...calculation.blockers].map((issue, index) => <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-950" key={`${issue.code}:${issue.message}:${index}`}>{issue.message}</p>)}
          {draft.glassOverride ? <p className="rounded-lg bg-violet-100 p-2 text-sm text-violet-950">Manual Override: {draft.glassOverride.reason}</p> : null}
          {message ? <p aria-live="assertive" className="rounded-lg bg-rose-100 p-3 text-rose-950">{message}</p> : null}
        </section>
      </div>
      <footer className="sticky bottom-0 z-10 flex justify-end gap-3 border-t border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-900"><button className={button} onClick={close} type="button">Cancel</button>{calculation.status === 'Glass Detail Needed' ? <button className={`${button} bg-amber-600 text-white`} onClick={() => applyConfiguration(true)} type="button">Leave Glass Detail Needed</button> : null}{['Complete', 'Warning', 'Manual Override'].includes(calculation.status) ? <button className={`${button} bg-sky-700 text-white`} onClick={() => applyConfiguration(false)} type="button">{commitLabel}</button> : null}</footer>
    </div>
  </div>;
}
