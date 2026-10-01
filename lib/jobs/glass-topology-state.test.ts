import assert from 'node:assert/strict';
import { defaultDoorLine } from './door-line-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit } from './glass-dimension-reconciliation-contract';
import { nextGlassBuilderDraft, reconcileGlassTopology } from './glass-editor-contract';
import { calculateGlassGeometry, withDerivedGlassGeometry } from './glass-geometry-contract';
import { createWorkOrderRowGroup, type WorkOrderDocument } from './work-order-document-contract';
import { assertWorkOrderPreflight } from './work-order-preflight-contract';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

function single(roWidth: string): DoorLineInput {
  const input = { ...defaultDoorLine('Exterior'), config: 'SDS', roWidth, sidelightGlass: 'CLEAR' };
  const sidelightSpecifications = canonicalSidelightSpecifications(input);
  const result = reconcileGlassDimensionCommit({ ...input, sidelightSpecifications }, { kind: 'roWidth', value: roWidth });
  return { ...input, ...result.sourcePatch };
}

const roomy = single('110');
// Recreated positional placeholders must inherit the existing shared specification.
const rebuilt = nextGlassBuilderDraft(roomy, 'config', 'SDDS');
rebuilt.sidelightSpecifications = canonicalSidelightSpecifications(rebuilt).map((entry) => ({ ...entry, glassTypeCode: null }));
const double = reconcileGlassTopology(roomy, rebuilt, { kind: 'roWidth' });
assert.deepEqual(double.draft.sidelightSpecifications?.map((entry) => entry.glassTypeCode), ['CLEAR', 'CLEAR']);
assert.equal(double.draft.roWidth, roomy.roWidth);
assert.equal(calculateGlassGeometry(double.draft).status, 'Complete');
assert.notEqual(double.draft.sidelightSpecifications?.[0].finishedWidth, roomy.sidelightSpecifications?.[0].finishedWidth);

const satin = { ...roomy, sidelightSpecifications: roomy.sidelightSpecifications!.map((entry) => ({ ...entry, glassTypeCode: 'SATIN_ETCH' as const })) };
assert.deepEqual(reconcileGlassTopology(satin, rebuilt, { kind: 'roWidth' }).draft.sidelightSpecifications?.map((entry) => entry.glassTypeCode), ['SATIN_ETCH', 'SATIN_ETCH']);

const narrow = single('60');
const staleDouble = nextGlassBuilderDraft(narrow, 'config', 'SDDS');
const impossible = reconcileGlassTopology(narrow, staleDouble, { kind: 'roWidth' });
assert.equal(impossible.draft.roWidth, narrow.roWidth);
assert.equal(impossible.blockers[0].code, 'nonpositive_sidelight_width');
assert.notEqual(impossible.draft.sidelightSpecifications?.[0].finishedWidth, narrow.sidelightSpecifications?.[0].finishedWidth);
for (const line of [staleDouble, impossible.draft]) {
  const result = calculateGlassGeometry(line);
  assert.equal(result.status, 'Blocked');
  assert.equal(result.glassCalc, null);
  assert.deepEqual(result.glassUnits, []);
  assert.equal(result.vendorCopyText, '');
  const presented = withDerivedGlassGeometry({ ...line, glassCalcStatus: 'Complete' as const, glassCalc: calculateGlassGeometry(narrow).glassCalc });
  assert.equal(presented.glassCalcStatus, 'Blocked');
  assert.equal(presented.glassCalc, null, 'fresh blockers replace cached valid presentation');
  const group = createWorkOrderRowGroup({ ...line, lineIndex: 1, lineId: 'topology-fixture' } as NativeDoorLine, null);
  assert.equal(group.primaryRow.status, 'Blocked');
  assert.throws(() => assertWorkOrderPreflight({ rowGroups: [group], validationIssues: [] } as unknown as WorkOrderDocument, true), /blocked/);
}

const restored = reconcileGlassTopology(impossible.draft, { ...impossible.draft, config: 'SDS', doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '36', inactiveWidth: '36', height: '79' } }, { kind: 'roWidth' });
assert.equal(restored.draft.doubleDoorSizing, null);
assert.equal(restored.draft.roWidth, narrow.roWidth);
assert.equal(calculateGlassGeometry(restored.draft).status, 'Complete');
assert.deepEqual(restored.draft.sidelightSpecifications, narrow.sidelightSpecifications);

const manual = reconcileGlassDimensionCommit(impossible.draft, { kind: 'sidelightWidth', side: 'left', index: 1, value: '12' });
assert.equal(manual.calculatedGeometry.status, 'Complete');
assert.notEqual(manual.sourcePatch.roWidth, narrow.roWidth);
assert.deepEqual(manual.sourcePatch.sidelightSpecifications?.map((entry) => entry.finishedWidth), ['12"', '12"']);
console.log('Glass topology state and blocked preflight: PASS');
