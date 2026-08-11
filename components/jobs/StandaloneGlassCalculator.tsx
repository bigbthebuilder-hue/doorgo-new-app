'use client';

import { useState } from 'react';
import Image from 'next/image';
import { defaultDoorLine } from '@/lib/jobs/door-line-contract';
import { calculateGlassGeometry } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';
import { GlassUnitBuilder } from './GlassUnitBuilder';

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
    <GlassUnitBuilder embedded key={editorKey} commitLabel="Update Result" line={structuredClone(line)} onCancel={() => setEditorKey((value) => value + 1)} onUse={(next) => { setLine(next); return true; }}/>
    <aside className="glass-calculator-results min-w-0 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-2"><div><h2 className="text-base font-semibold">Current calculation</h2><p className="text-xs text-slate-500">Shared authoritative glass geometry · not saved to a job</p></div><span className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800">{result.status}</span></div>
      <div className="glass-calculator-actions mt-2 flex flex-wrap gap-1.5">
        {printable ? <button className="app-button app-button-primary" onClick={() => window.print()} type="button">Print</button> : null}
        <button className="app-button app-button-secondary" disabled title="A calculation-specific recipient and message contract has not been approved." type="button">Send unavailable</button>
        <button className="app-button app-button-secondary" onClick={() => document.querySelector<HTMLElement>('.glass-calculator-editor input, .glass-calculator-editor select')?.focus()} type="button">Edit Calculation</button>
      </div>
      {result.workorderDetail ? <pre className="mt-2 whitespace-pre-wrap rounded-md bg-slate-50 p-2 text-xs dark:bg-slate-950">{result.workorderDetail}</pre> : <p className="mt-2 text-xs text-amber-800">Complete the required dimensions to produce output.</p>}
      {[...result.incompleteDetails, ...result.warnings, ...result.blockers].map((issue, index) => <p className="mt-1 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900" key={`${issue.code}:${issue.message}:${index}`}>{issue.message}</p>)}
      <section className="glass-calculator-print" aria-label="Glass Calculation printout"><Image alt="DoorGo" height={48} src="/brand/doorgo-mark.svg" width={48}/><h1>Glass Calculation</h1><p>Status: {result.status}</p>{result.workorderDetail ? <pre>{result.workorderDetail}</pre> : null}</section>
    </aside>
  </div>;
}
