'use client';

import { useState } from 'react';
import '@/app/globals.css';
import { GlassUnitBuilder } from '@/components/jobs/GlassUnitBuilder';
import { GlassUnitDiagram } from '@/components/jobs/GlassUnitDiagram';
import { replaceDoorLineAtIndex } from '@/lib/jobs/door-line-editor-state';
import { glassLineNeedsAttention } from '@/lib/jobs/glass-geometry-contract';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';

const importedLine: DoorLineInput = {
  mode: 'Exterior', doorType: 'NON-PRODUCTION TEST', config: 'T/DS', width: `3'0"`, height: `6'8"`,
  hand: 'RHOUT', prep: 'MULTI', jambWidth: `6-9/16"`, jambType: 'Primed', sill: 'STD', weatherstrip: 'WHT',
  hingeType: 'BB', qty: 1, material: 'fiberglass', roWidth: '54', roHeight: '98', sidelightType: 'Glass',
  sidelightGlass: 'CLR_SB60_K4SG', transomGlass: 'CLR_SB60_K4SG', includeDiagramOnWorkOrder: true,
  lineIndex: 1, lineStatus: 'Active', glassCalcStatus: 'Glass Detail Needed', glassWarnings: [], glassBlockers: [],
  glassUnits: [], panelSidelights: [], glassCalc: null, glassOverride: null, glassWorkorderDetail: null, vendorCopyText: null,
};

function GlassBuilderHarness({ initialLine }: { initialLine: DoorLineInput }) {
  const [lines, setLines] = useState<DoorLineInput[]>([structuredClone(initialLine)]);
  const [editor, setEditor] = useState<DoorLineInput>(() => structuredClone(initialLine));
  const [builderOpen, setBuilderOpen] = useState(true);
  const line = lines[0];
  const attention = glassLineNeedsAttention(line);
  return <section>
    <div data-testid="light-diagram"><GlassUnitDiagram line={editor}/></div>
    <div className="dark" data-testid="dark-diagram"><GlassUnitDiagram line={editor}/></div>
    <p data-testid="saved-status">{String(line.glassCalcStatus)}</p>
    <p data-testid="attention-count">{attention.length}</p>
    <p data-testid="unit-count">{line.glassUnits?.length ?? 0}</p>
    <button onClick={() => { setEditor(structuredClone(lines[0])); setBuilderOpen(true); }} type="button">Reopen Glass Builder</button>
    <button onClick={() => setLines((current) => replaceDoorLineAtIndex(current, 0, { ...editor, lineId: editor.lineId ?? 'local-import-line' }))} type="button">Update Door</button>
    {builderOpen ? <GlassUnitBuilder commitLabel={line.lineId ? 'Save Door Changes' : 'Add Door to Order'} line={structuredClone(editor)} onCancel={() => setBuilderOpen(false)} onUse={(next) => { const saved = { ...next, lineId: next.lineId ?? 'local-import-line' }; setEditor(saved); setLines((current) => replaceDoorLineAtIndex(current, 0, saved)); setBuilderOpen(false); return true; }}/>: null}
  </section>;
}

export function ImportedGlassBuilderHarness() {
  return <GlassBuilderHarness initialLine={importedLine}/>;
}

export function DirectDimensionGlassBuilderHarness() {
  return <GlassBuilderHarness initialLine={{ ...importedLine, config: 'T/SDS', hand: 'LH', roWidth: '71', roHeight: '96', sidelightType: 'Glass', sidelightGlass: null, sidelightSpecifications: [] }}/>;
}
