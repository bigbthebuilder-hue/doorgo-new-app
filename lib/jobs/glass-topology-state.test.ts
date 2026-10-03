import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit } from './glass-dimension-reconciliation-contract';
import { nextGlassBuilderDraft, reconcileGlassTopology, canCommitGlassCalculation } from './glass-editor-contract';
import { calculateGlassGeometry, withDerivedGlassGeometry, normalizeGlassDomainFields, applyManualGeometryOverride } from './glass-geometry-contract';
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

// Current inputs win even when an older record retains complete cached results.
const source: DoorLineInput = { ...defaultDoorLine('Exterior'), lineId: 'stale-fixture', config: 'T/SD', roWidth: '60', roHeight: '96', sidelightType: 'Glass', sidelightGlass: 'Clear', transomGlass: 'Clear', includeDiagramOnWorkOrder: true };
const complete = { ...source, ...normalizeGlassDomainFields(source) };
assert.equal(complete.glassCalcStatus, 'Complete');
const warning = { ...source, config: 'SD', roHeight: '84' };
const approval = applyManualGeometryOverride({ line: warning, acceptedValues: calculateGlassGeometry(warning).glassCalc!, reason: 'Historical approval', accessLevel: 'use', actorUserId: 'tester', appliedAt: '2026-10-02T00:00:00Z' });
for (const patch of [{ roWidth: '' }, { roHeight: '' }, { sidelightGlass: null, glass: null }]) {
  const stale = { ...complete, ...patch, glassOverride: approval };
  const before = structuredClone(stale);
  const current = withDerivedGlassGeometry(stale);
  assert.equal(current.glassCalcStatus, 'Glass Detail Needed');
  assert.equal(current.glassCalc, null);
  assert.deepEqual(current.glassUnits, []);
  assert.deepEqual(current.panelSidelights, []);
  assert.deepEqual(current.glassWarnings, []);
  assert.deepEqual(current.glassBlockers, []);
  assert.equal(current.vendorCopyText, null);
  assert.equal(current.glassOverride, null);
  assert.match(current.glassWorkorderDetail!, /DETAILS NEEDED/);
  assert.deepEqual(stale, before, 'presentation must not mutate stored inputs or audit history');
  const group = createWorkOrderRowGroup({ ...stale, lineIndex: 1 } as NativeDoorLine, null);
  assert.equal(group.primaryRow.status, 'Glass Detail Needed');
  assert.equal(group.diagram, null);
  assert.ok(group.detailRows.every(row => row.kind !== 'frame'));
  const document = { rowGroups: [group], validationIssues: [] } as unknown as WorkOrderDocument;
  assert.throws(() => assertWorkOrderPreflight(document, false), /acknowledged/);
  assert.doesNotThrow(() => assertWorkOrderPreflight(document, true));
  const normalized = normalizeDoorLineInput(stale);
  assert.ok(normalized.ok);
  assert.equal(normalized.value.glassCalcStatus, 'Glass Detail Needed');
  assert.equal(canCommitGlassCalculation(normalized.value.glassCalcStatus!, false), false);
  assert.equal(canCommitGlassCalculation(normalized.value.glassCalcStatus!, true), true);
}
const partial = { ...complete, roWidth: '62', transomGlassTypeCode: 'CUSTOM' as const, transomCustomGlassDescription: null };
const partialResult = calculateGlassGeometry(partial);
assert.equal(partialResult.status, 'Glass Detail Needed');
assert.ok(partialResult.glassCalc);
assert.deepEqual(withDerivedGlassGeometry(partial).glassCalc, partialResult.glassCalc);
assert.notDeepEqual(partialResult.glassCalc, complete.glassCalc);
const changed = { ...complete, roWidth: '62' };
assert.equal(withDerivedGlassGeometry(changed).glassCalcStatus, 'Complete');
assert.deepEqual(withDerivedGlassGeometry(changed).glassCalc, calculateGlassGeometry(changed).glassCalc);
const metadata = { ...complete, config: 'T/SDDS', roWidth: '', doubleDoorSizing: { kind: 'custom-slabs' as const, activeWidth: '35', inactiveWidth: '35', height: '79' } };
assert.deepEqual(normalizeGlassDomainFields(metadata).glassCalc, { doubleDoorSizing: metadata.doubleDoorSizing });
assert.equal(withDerivedGlassGeometry(metadata).glassCalc, null);
assert.deepEqual(withDerivedGlassGeometry(metadata).doubleDoorSizing, metadata.doubleDoorSizing);
console.log('Fresh incomplete, partial, complete, metadata and preserved audit presentation: PASS');
