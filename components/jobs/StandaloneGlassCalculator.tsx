'use client';

import { useState } from 'react';
import Image from 'next/image';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import { calculateGlassGeometry } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';
import { GlassUnitBuilder } from './GlassUnitBuilder';
import { GlassUnitDiagram } from './GlassUnitDiagram';

const initialLine = (): DoorLineInput => ({
  ...defaultDoorLine('Exterior'),
  config: 'SD', roWidth: '60', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG',
  sidelightSpecifications: [], includeDiagramOnWorkOrder: true,
});

export function StandaloneGlassCalculator() {
  const [line, setLine] = useState<DoorLineInput>(initialLine);
  const [editorKey, setEditorKey] = useState(0);
  const result = calculateGlassGeometry(line);
  const printable = ['Complete', 'Warning', 'Manual Override'].includes(result.status);
  return <div className="grid min-w-0 gap-2 xl:grid-cols-[minmax(38rem,1.6fr)_minmax(20rem,.8fr)]">
    <GlassUnitBuilder defaultEmptyTransomGlassToClear embedded key={editorKey} line={structuredClone(line)} onCancel={() => setEditorKey((value) => value + 1)} onDraftChange={setLine} onUse={() => true} showCalculationOutput={false} showCommitActions={false}/>
    <aside className="glass-calculator-results min-w-0 self-start rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:sticky xl:top-[5.25rem] dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2"><div><h2 className="text-base font-semibold">Current calculation</h2><p className="text-xs text-slate-500">Review the current unit measurements and output.</p></div><span className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{result.status}</span></div>
      <div className="glass-calculator-actions mt-2 flex flex-wrap gap-1.5">
        {printable ? <button className="app-button app-button-primary" onClick={() => window.print()} type="button">Print</button> : null}
        <button className="app-button app-button-secondary" disabled title="A calculation-specific recipient and message contract has not been approved." type="button">Send unavailable</button>
      </div>
      {result.glassCalc ? <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs" aria-label="Live calculated measurements">
        <Result label="Jamb legs" value={result.glassCalc.jambLeg}/><Result label="Header / sill / T-bar" value={result.glassCalc.headerWidth}/><Result label="Minimum RO width" value={result.glassCalc.minimumRoWidth}/>{result.glassCalc.transomWidth ? <Result label="Transom product size" value={`${String(result.glassCalc.transomWidth)} × ${String(result.glassCalc.transomHeight)}`}/> : null}
        {result.glassUnits.map((unit) => <Result key={`${unit.position}:${unit.width}:${unit.height}`} label={`${unit.position} glass`} value={`${unit.width} × ${unit.height} · ${unit.glassType}`}/>)}
      </dl> : <p className="mt-2 text-xs text-amber-800">Complete the required dimensions to produce output.</p>}
      {[...result.incompleteDetails, ...result.warnings, ...result.blockers].map((issue, index) => <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" key={`${issue.code}:${issue.message}:${index}`}>{issue.message}</p>)}
      {result.vendorCopyText ? <details className="mt-3 rounded-md border border-slate-200 p-2 text-xs"><summary className="cursor-pointer font-semibold">Vendor-copy preview</summary><pre className="mt-2 whitespace-pre-wrap">{result.vendorCopyText}</pre></details> : null}
      <section className="glass-calculator-print" aria-label="Glass Calculation printout">
        <header><Image alt="DoorGo" height={48} src="/brand/doorgo-mark.svg" width={48}/><div><strong>DoorGo</strong><h1>Glass Calculation</h1></div><p className="ml-auto font-semibold">{result.status}</p></header>
        <h2>Configuration</h2>
        <GlassUnitDiagram line={{ ...line, glassCalc: result.glassCalc }}/>
        <dl aria-label="Glass calculation inputs"><div><dt>Configuration</dt><dd>{line.config}</dd></div><div><dt>Swing</dt><dd>{line.hand ?? 'Not selected'}</dd></div><div><dt>Slab size</dt><dd>{String(line.width ?? '—')} × {String(line.height ?? '—')}</dd></div><div><dt>Rough opening</dt><dd>{String(line.roWidth ?? '—')} × {String(line.roHeight ?? '—')}</dd></div><div><dt>Structure</dt><dd>{line.sidelightType ?? 'Door only'}</dd></div><div><dt>T-bar</dt><dd>{String(line.transomTBarSize ?? 'Not applicable')}</dd></div></dl>
        <h2>Calculated measurements</h2>
        {result.workorderDetail ? <pre>{result.workorderDetail}</pre> : <p>Calculation is incomplete.</p>}
        {[...result.incompleteDetails, ...result.warnings, ...result.blockers].length ? <><h2>Warnings and status</h2>{[...result.incompleteDetails, ...result.warnings, ...result.blockers].map((issue, index) => <p key={`print:${issue.code}:${issue.message}:${index}`}>{issue.message}</p>)}</> : null}
      </section>
    </aside>
  </div>;
}

function Result({ label, value }: { label: string; value: unknown }) {
  return <div className="border-b border-slate-100 pb-1"><dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt><dd className="font-semibold text-slate-900">{String(value)}</dd></div>;
}
