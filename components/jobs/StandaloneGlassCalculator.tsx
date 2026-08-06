'use client';

import { useState } from 'react';
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
  const [open, setOpen] = useState(true);
  const result = calculateGlassGeometry(line);
  return <>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-xl font-semibold">Current calculation</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">This calculator uses the same editor and shared geometry contract as native and imported jobs. It does not save a job.</p>
      <p className="mt-4 font-semibold">Status: {result.status}</p>
      {result.workorderDetail ? <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs dark:bg-slate-950">{result.workorderDetail}</pre> : null}
      <button className="mt-4 min-h-11 rounded-xl bg-sky-700 px-5 font-semibold text-white" onClick={() => setOpen(true)} type="button">Edit Glass Calculation</button>
    </section>
    {open ? <GlassUnitBuilder line={structuredClone(line)} onCancel={() => setOpen(false)} onUse={(next) => { setLine(next); setOpen(false); }}/>: null}
  </>;
}
