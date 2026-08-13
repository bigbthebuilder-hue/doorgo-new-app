'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import { calculateGlassGeometry } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';
import { GlassUnitBuilder } from './GlassUnitBuilder';
import { GlassUnitDiagram } from './GlassUnitDiagram';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { glassResultRows } from '@/lib/jobs/glass-result-presentation';

const initialLine = (): DoorLineInput => ({
  ...defaultDoorLine('Exterior'),
  config: 'SD', roWidth: '60', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG',
  sidelightSpecifications: [], includeDiagramOnWorkOrder: true,
});

export function StandaloneGlassCalculator() {
  const [line, setLine] = useState<DoorLineInput>(initialLine);
  const [editorKey, setEditorKey] = useState(0);
  const [actionsTarget, setActionsTarget] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setActionsTarget(document.getElementById('glass-calculator-bottom-actions')));
    return () => window.cancelAnimationFrame(frame);
  }, []);
  const result = calculateGlassGeometry(line);
  const resultRows = glassResultRows(line, result.glassUnits, result.panelSidelights);
  const printable = ['Complete', 'Warning', 'Manual Override'].includes(result.status);
  const actions = <div className="glass-calculator-actions flex flex-wrap justify-end gap-1.5">
    {printable ? <button className="app-button app-button-primary" onClick={() => window.print()} type="button">Print</button> : null}
    <button className="app-button app-button-secondary" disabled title="A calculation-specific recipient and message contract has not been approved." type="button">Send unavailable</button>
  </div>;

  return <div className="min-w-0">
    {actionsTarget ? createPortal(actions, actionsTarget) : <ContextBottomBar actions={actions} label="Glass Calculator actions" status={<span>{result.status}</span>}/>}
    <GlassUnitBuilder embedded key={editorKey} line={structuredClone(line)} onCancel={() => setEditorKey((value) => value + 1)} onDraftChange={setLine} onUse={() => true} showCommitActions={false}/>
    <div className="glass-calculator-results">
      <section className="glass-calculator-print" aria-label="Glass Calculation printout">
        <header><Image alt="DoorGo" height={48} src="/brand/doorgo-mark.svg" width={48}/><div><strong>DoorGo</strong><h1>Glass Calculation</h1></div><p className="ml-auto font-semibold">{result.status}</p></header>
        <h2>Configuration</h2>
        <GlassUnitDiagram line={{ ...line, glassCalc: result.glassCalc }}/>
        <dl aria-label="Glass calculation inputs"><div><dt>Configuration</dt><dd>{line.config}</dd></div><div><dt>Swing</dt><dd>{line.hand ?? 'Not selected'}</dd></div><div><dt>Slab size</dt><dd>{String(line.width ?? '—')} × {String(line.height ?? '—')}</dd></div><div><dt>Rough opening</dt><dd>{String(line.roWidth ?? '—')} × {String(line.roHeight ?? '—')}</dd></div><div><dt>Structure</dt><dd>{line.sidelightType ?? 'Door only'}</dd></div><div><dt>T-bar</dt><dd>{String(line.transomTBarSize ?? 'Not applicable')}</dd></div></dl>
        <h2>Calculated measurements</h2>
        {result.glassCalc ? <dl>{resultRows.map((row) => <div key={`print:${row.key}`}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl> : <p>Calculation is incomplete.</p>}
        {[...result.incompleteDetails, ...result.warnings, ...result.blockers].length ? <><h2>Warnings and status</h2>{[...result.incompleteDetails, ...result.warnings, ...result.blockers].map((issue, index) => <p key={`print:${issue.code}:${issue.message}:${index}`}>{issue.message}</p>)}</> : null}
      </section>
    </div>
  </div>;
}
