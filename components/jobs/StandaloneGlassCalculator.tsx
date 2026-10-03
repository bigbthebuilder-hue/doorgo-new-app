'use client';

import { statusLabel } from '@/lib/jobs/status-presentation';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { calculateNonGlassFrameCut, type NonGlassFrameCutValues } from '@/lib/jobs/non-glass-frame-cut-contract';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import { calculateGlassGeometry, normalizeTBarSize } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';
import { DoorLineWorkspace } from './DoorLineWorkspace';
import { sillChoice } from '@/lib/jobs/construction-contract';
import { GlassUnitDiagram } from './GlassUnitDiagram';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { glassResultRows } from '@/lib/jobs/glass-result-presentation';
import { isFrameGlassConfiguration } from '@/lib/jobs/glass-unit-composition-contract';
import { DOUBLE_DOOR_ASTRAGALS, hasDoubleDoorCore, normalizeDoubleDoorAstragal } from '@/lib/jobs/double-door-astragal-contract';

const initialLine = (): DoorLineInput => defaultDoorLine('Exterior');
const noLines: DoorLineInput[] = [];
const ignoreLines = () => {};

export function StandaloneGlassCalculator() {
  const [line, setLine] = useState<DoorLineInput>(initialLine);
  const [hingeColor, setHingeColor] = useState('');
  const [editorKey, setEditorKey] = useState(0);
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setActionsTarget(document.getElementById('glass-calculator-bottom-actions')));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const hasGlass = isFrameGlassConfiguration(line.config);
  const result = calculateGlassGeometry(line);
  const doorResult = hasGlass ? null : calculateNonGlassFrameCut(line);
  const doorPrintable = doorResult?.status === 'Complete' && doorResult.values !== null
    && !doorResult.values.widthReviewRequired && doorResult.blockers.length === 0;
  const reportStatus = doorResult
    ? doorResult.blockers.length || doorResult.values?.widthReviewRequired ? 'Blocked'
      : doorResult.status === 'Complete' && doorResult.warnings.length ? 'Warning' : doorResult.status
    : result.status;
  const reportTitle = hasGlass ? 'Glass Calculation' : 'Door Calculation';
  const reportIssues = doorResult
    ? [...doorResult.warnings, ...doorResult.blockers, ...(doorResult.missingFields.length ? [{ code: 'missing_dimensions', message: 'Complete the required door dimensions.' }] : [])]
    : [...result.incompleteDetails, ...result.warnings, ...result.blockers];
  const doorValues = doorPrintable ? doorResult?.values : null;
  const doorDimensions: [keyof NonGlassFrameCutValues, string][] = [
    ['activeLeafWidth', 'Active slab width'], ['inactiveLeafWidth', 'Inactive slab width'],
    ['jambLeg', 'Jamb legs'], ['headerWidth', 'Header length'], ['sillOrThresholdWidth', 'Sill / threshold length'],
    ['frameWidth', 'Frame width'], ['frameHeight', 'Frame height'], ['doubleDoorCoreWidth', 'Double-door core width'],
    ['clearOpeningWidth', 'Clear opening width'], ['clearOpeningHeight', 'Clear opening height'],
    ['recommendedRoWidth', 'Recommended RO width'], ['recommendedRoHeight', 'Recommended RO height'],
    ['minimumRoWidth', 'Minimum RO width'], ['minimumRoHeight', 'Minimum RO height'],
    ['cutDown', 'Height cut-down'], ['widthCutDown', 'Width cut-down'], ['finishedOpeningHeight', 'Finished opening height'],
  ];
  const resultRows = glassResultRows(line, result.glassUnits, result.panelSidelights);
  const printable = hasGlass ? result.blockers.length === 0 && ['Complete', 'Warning', 'Manual Override'].includes(result.status) : doorPrintable;
  const selectedTBar = isFrameGlassConfiguration(line.config)
    ? normalizeTBarSize(line.transomTBarSize) ?? line.sidelightSpecifications?.map((entry) => normalizeTBarSize(entry.tBarSize)).find(Boolean) ?? null
    : null;
  const selectedAstragal = hasDoubleDoorCore(line.config) ? DOUBLE_DOOR_ASTRAGALS[normalizeDoubleDoorAstragal(line.doubleDoorAstragal)].label : null;
  const actions = <div className="glass-calculator-actions flex flex-wrap justify-end gap-1.5">
    <button className="app-button app-button-primary disabled:cursor-not-allowed disabled:opacity-50" disabled={!printable} onClick={() => { if (printable) window.print(); }} type="button">Print</button>
    <button className="app-button" onClick={() => { setLine(initialLine()); setHingeColor(''); setEditorKey((value) => value + 1); }} type="button">Reset</button>
  </div>;

  return <div className="standalone-glass-workspace min-w-0">
    {actionsTarget ? createPortal(actions, actionsTarget) : <ContextBottomBar actions={actions} label="Glass Calculator actions" status={<span>{statusLabel(reportStatus)}</span>}/>}
    <DoorLineWorkspace key={editorKey} calculationOnly canEdit lifecycleStage="Draft" lines={noLines} onChange={ignoreLines} onDraftChange={setLine} hingeColor={hingeColor} onHingeColorChange={setHingeColor}/>
    <div className="glass-calculator-results">
      <section className="glass-calculator-print" aria-label={reportTitle + ' printout'}>
        <header><Image alt="DoorGo" height={48} src="/brand/doorgo-mark.svg" width={48}/><div><strong>DoorGo</strong><h1>{reportTitle}</h1></div><p className="ml-auto font-semibold">{statusLabel(reportStatus)}</p></header>
        <h2>Configuration</h2>
        {hasGlass && printable ? <GlassUnitDiagram line={{ ...line, glassCalc: result.glassCalc }}/> : null}
        <dl aria-label={reportTitle + ' inputs'}><div><dt>Door mode</dt><dd>{line.mode}</dd></div><div><dt>Jamb Width</dt><dd>{line.jambWidth || 'Not applicable'}</dd></div><div><dt>Configuration</dt><dd>{line.config}</dd></div><div><dt>Swing</dt><dd>{line.hand ?? 'Not selected'}</dd></div><div><dt>Material</dt><dd>{line.material}</dd></div><div><dt>Sill</dt><dd>{sillChoice(line)}</dd></div><div><dt>Sizing</dt><dd>{line.doubleDoorSizing?.kind === 'patio' ? 'Patio Door Replacement / ' + line.doubleDoorSizing.preset + "'" : line.customSlab === 'RO' ? 'Fit to RO' : line.customSlab === 'WoodCustom' || line.customSlab === 'Yes' ? 'Custom Slab' : 'Standard'}</dd></div><div><dt>Slab size</dt><dd>{String(line.width ?? '—')} × {String(line.height ?? '—')}</dd></div>{hasGlass || line.roWidth ? <div><dt>RO Width</dt><dd>{String(result.glassCalc?.roWidth || line.roWidth || 'Not entered')}</dd></div> : null}{line.roHeight ? <div><dt>RO Height</dt><dd>{String(line.roHeight)}</dd></div> : null}{hasGlass ? <div><dt>Structure</dt><dd>{line.sidelightType ?? 'Door only'}</dd></div> : null}{selectedAstragal ? <div><dt>Astragal</dt><dd>{selectedAstragal}</dd></div> : null}{hasGlass ? <div><dt>T-bar</dt><dd>{selectedTBar ?? 'Not applicable'}</dd></div> : null}</dl>
        <h2>Calculated measurements</h2>
        {doorValues ? <dl>
          <div><dt>Actual slab</dt><dd>{doorValues.actualSlabWidth.display} &times; {doorValues.actualSlabHeight.display}</dd></div>
          <div><dt>Final slab</dt><dd>{doorValues.finalSlabWidth.display} &times; {doorValues.finalSlabHeight.display}</dd></div>
          {doorDimensions.map(([key, label]) => {
            const value = doorValues[key];
            return value && typeof value === 'object' && 'display' in value ? <div key={key}><dt>{label}</dt><dd>{value.display}</dd></div> : null;
          })}
        </dl> : hasGlass && printable && result.glassCalc ? <dl><div><dt>Actual slab</dt><dd>{String(result.glassCalc.slabWidth)} &times; {String(result.glassCalc.slabHeight)}</dd></div>{result.glassCalc.activeLeafWidth ? <div><dt>Active / inactive slab widths</dt><dd>{String(result.glassCalc.activeLeafWidth)} / {String(result.glassCalc.inactiveLeafWidth)}</dd></div> : null}<div><dt>Jamb legs</dt><dd>{String(result.glassCalc.jambLeg)}</dd></div><div><dt>Header / sill / T-bar</dt><dd>{String(result.glassCalc.headerWidth)} / {String(result.glassCalc.divider)}</dd></div>{resultRows.map((row) => <div key={`print:${row.key}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : reportIssues.length ? null : <p>{statusLabel(reportStatus)}</p>}
        {reportIssues.length ? <><h2>Warnings and status</h2>{reportIssues.map((issue, index) => <p key={`print:${issue.code}:${issue.message}:${index}`}>{issue.message}</p>)}</> : null}
      </section>
    </div>
  </div>;
}
