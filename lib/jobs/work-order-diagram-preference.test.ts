import assert from 'node:assert/strict';
import { defaultDoorLine, doorLineEquivalenceKey, mergeEquivalentActiveLines, normalizeDoorLineInput } from './door-line-contract';
import { calculatePersistedGlassDiagramLayout } from './glass-diagram-contract';
import { jobAggregateDirtySnapshot } from './job-intake-contract';
import type { NativeDoorLine } from './job-intake-types';
import { createWorkOrderRowGroup } from './work-order-document-contract';

const legacyApplicableInput = { ...defaultDoorLine('Exterior'), config: 'SD' };
delete legacyApplicableInput.includeDiagramOnWorkOrder;
const applicable = normalizeDoorLineInput(legacyApplicableInput);
assert.equal(applicable.ok, true);
assert.equal(applicable.ok && applicable.value.includeDiagramOnWorkOrder, true, 'new and legacy applicable lines default on');
const disabled = normalizeDoorLineInput({ ...defaultDoorLine('Exterior'), config: 'SD', includeDiagramOnWorkOrder: false });
assert.equal(disabled.ok && disabled.value.includeDiagramOnWorkOrder, false, 'explicit false is preserved');
const nonApplicable = normalizeDoorLineInput({ ...defaultDoorLine('Exterior'), config: 'D', includeDiagramOnWorkOrder: true });
assert.equal(nonApplicable.ok && nonApplicable.value.includeDiagramOnWorkOrder, false, 'non-applicable lines cannot retain an active preference');
assert.notEqual(
  jobAggregateDirtySnapshot({ values: {}, lines: [{ includeDiagramOnWorkOrder: true }], lifecycleStage: 'Draft' }),
  jobAggregateDirtySnapshot({ values: {}, lines: [{ includeDiagramOnWorkOrder: false }], lifecycleStage: 'Draft' }),
  'diagram preference participates in aggregate dirty state',
);

function full(core: Extract<typeof applicable, { ok: true }>['value'], lineId: string, preference: boolean): NativeDoorLine {
  return { ...core, lineId, lineIndex: lineId.endsWith('1') ? 1 : 2, lineStatus: 'Active', includeDiagramOnWorkOrder: preference, createdAt: '2026-07-22T00:00:00.000Z', updatedAt: '2026-07-22T00:00:00.000Z', createdByUserId: 'user', updatedByUserId: 'user' };
}
if (!applicable.ok) throw new Error('fixture');
const mergeOff = full(applicable.value, '00000000-0000-4000-8000-000000000001', false);
const mergeOn = full(applicable.value, '00000000-0000-4000-8000-000000000002', true);
assert.equal(doorLineEquivalenceKey(mergeOff), doorLineEquivalenceKey(mergeOn), 'preference does not prevent otherwise-equivalent lines from merging');
const merged = mergeEquivalentActiveLines([mergeOff, mergeOn]);
assert.equal(merged.lines[0].includeDiagramOnWorkOrder, true, 'merged keeper enables the diagram when either source requests it');

const glassCalc = {
  headerWidth: `75"`, slabWidth: `36"`, finalDoorHeight: `80"`, divider: `2 1/4"`,
  sidelightWidth: `14"`, sidelightHeight: `80"`, transomWidth: `75"`, transomHeight: `16"`, sidelightType: 'Glass',
};
const diagramLine = { ...mergeOn, config: 'T/SDS', glassCalc, glassCalcStatus: 'Complete' as const, glassUnits: [], glassWarnings: [], glassBlockers: [] };
const diagram = calculatePersistedGlassDiagramLayout(diagramLine);
assert.ok(diagram);
assert.ok(diagram?.parts.some((part) => part.id === 'left-sidelight'));
assert.ok(diagram?.parts.some((part) => part.id === 'right-sidelight'));
assert.ok(diagram?.parts.some((part) => part.id === 'transom'));
assert.equal(diagram?.parts.some((part) => /\d|glass/i.test(part.label ?? '')), false, 'resolved print diagram labels contain no dimensions or glass type');
for (const config of ['SD', 'DS', 'SDS', 'T/D', 'T/SDS']) {
  assert.ok(calculatePersistedGlassDiagramLayout({ ...diagramLine, config }), `${config} has a persisted-geometry diagram`);
}
const panelDiagram = calculatePersistedGlassDiagramLayout({ ...diagramLine, config: 'SD', sidelightType: 'Panel', glassCalc: { ...glassCalc, sidelightType: 'Panel', panelWidth: `13 3/4"`, panelHeight: `80"` } });
assert.ok(panelDiagram?.parts.some((part) => part.kind === 'panel'), 'panel sidelights retain their structural diagram kind');
assert.ok(createWorkOrderRowGroup(diagramLine, 'L1').diagram, 'enabled saved preference reaches the J3A row group');
assert.equal(createWorkOrderRowGroup({ ...diagramLine, includeDiagramOnWorkOrder: false }, 'L1').diagram, null, 'disabled preference reserves no diagram');
const legacy: Partial<NativeDoorLine> = { ...diagramLine };
delete legacy.includeDiagramOnWorkOrder;
assert.ok(createWorkOrderRowGroup(legacy as NativeDoorLine, 'L1').diagram, 'legacy applicable lines deterministically default on without a write');
assert.equal(calculatePersistedGlassDiagramLayout({ ...diagramLine, config: 'D' }), null);
console.log('Native Job Intake work-order diagram preference: PASS');
