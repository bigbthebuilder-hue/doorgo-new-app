import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { canonicalSidelightSpecifications, reconcileGlassDimensionCommit, reconcileGlassDoorSetupChange } from './glass-dimension-reconciliation-contract';
import { calculateGlassGeometry, numericDimension, withDerivedGlassGeometry } from './glass-geometry-contract';
import { selectSlabAxis } from './slab-sizing-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

function fixture(config = 'T/SD', roWidth = '60', panel = false): DoorLineInput {
  const line: DoorLineInput = { ...defaultDoorLine('Exterior'), lineId: 'horizontal', lineIndex: 1, config, roWidth, roHeight: config.includes('T/') ? '96' : null, sidelightType: panel ? 'Panel' : 'Glass', sidelightGlass: 'CLEAR', transomGlassTypeCode: 'CLEAR', transomTBarSize: '2.25', includeDiagramOnWorkOrder: true };
  line.sidelightSpecifications = canonicalSidelightSpecifications(line).map(entry => ({ ...entry, tBarSize: '2.25', ...(panel ? { panelSizeMode: 'custom', panelConstructionNotes: 'Custom panel' } : {}) }));
  return { ...line, ...reconcileGlassDimensionCommit(line, { kind: 'roWidth', value: roWidth }).sourcePatch };
}
function inches(value: unknown) { const parsed = numericDimension(value); assert.ok(parsed.ok); return parsed.inches; }
function consistent(line: DoorLineInput) {
  const result = calculateGlassGeometry(line);
  assert.equal(result.status, 'Complete', JSON.stringify(result));
  assert.equal(inches(result.glassCalc?.headerWidth) + 2, inches(line.roWidth));
  if (String(line.config).includes('T/')) assert.equal(inches(result.glassCalc?.transomWidth), inches(result.glassCalc?.headerWidth) - 0.125);
  return result;
}
const original = fixture();
const originalSnapshot = structuredClone(original);
assert.equal(consistent(original).glassCalc?.headerWidth, '58"');
assert.equal(original.sidelightSpecifications?.[0].finishedWidth, '19 5/8"');
const widened = reconcileGlassDoorSetupChange(original, { ...original, width: `3'6"` });
assert.equal(widened.roWidth, original.roWidth);
assert.equal(widened.roHeight, original.roHeight);
assert.equal(widened.sidelightSpecifications?.[0].finishedWidth, '13 5/8"');
assert.equal(consistent(widened).glassCalc?.headerWidth, '58"');
assert.equal(consistent(widened).glassCalc?.transomWidth, '57 7/8"');
assert.deepEqual(original, originalSnapshot, 'reconciliation must not mutate the previous line');

// Direct edits synchronize in either direction; a subsequent core change keeps that RO.
const roEdited = { ...original, ...reconcileGlassDimensionCommit(original, { kind: 'roWidth', value: '62' }).sourcePatch };
assert.equal(roEdited.sidelightSpecifications?.[0].finishedWidth, '21 5/8"');
const direct = { ...original, ...reconcileGlassDimensionCommit(original, { kind: 'sidelightWidth', side: 'left', index: 1, value: '20' }).sourcePatch };
assert.equal(direct.roWidth, '60 3/8"');
for (const line of [roEdited, direct]) {
  const next = reconcileGlassDoorSetupChange(line, { ...line, width: `3'6"` });
  assert.equal(next.roWidth, line.roWidth);
  assert.equal(inches(next.sidelightSpecifications?.[0].finishedWidth), inches(line.sidelightSpecifications?.[0].finishedWidth) - 6);
  consistent(next);
}

for (const config of ['SD', 'T/SD', 'SDS', 'T/SDS', 'SDDS', 'T/SDDS']) {
  const line = fixture(config, config.includes('DD') ? '110 1/16' : '60');
  const next = reconcileGlassDoorSetupChange(line, { ...line, width: `3'6"` });
  assert.equal(next.roWidth, line.roWidth);
  consistent(next);
  assert.ok(next.sidelightSpecifications?.every(entry => entry.glassTypeCode === 'CLEAR'));
  assert.notDeepEqual(next.sidelightSpecifications, line.sidelightSpecifications);
}
for (const line of [original, direct]) {
  const wood = reconcileGlassDoorSetupChange(line, { ...line, material: 'wood' });
  assert.equal(wood.roWidth, line.roWidth);
  assert.equal(inches(wood.sidelightSpecifications?.[0].finishedWidth), inches(line.sidelightSpecifications?.[0].finishedWidth) - 0.25);
  consistent(wood);
  const fiberglass = reconcileGlassDoorSetupChange(wood, { ...wood, material: 'fiberglass' });
  assert.deepEqual(fiberglass.sidelightSpecifications, line.sidelightSpecifications);
  consistent(fiberglass);
}
const wood = reconcileGlassDoorSetupChange(original, { ...original, material: 'wood' });
const pending = reconcileGlassDoorSetupChange(wood, selectSlabAxis(wood, 'width', 'Custom'));
assert.notEqual(calculateGlassGeometry(pending).status, 'Complete');
const custom = reconcileGlassDoorSetupChange(pending, { ...pending, customSlabWidth: '40' });
assert.equal(custom.roWidth, wood.roWidth);
assert.equal(custom.sidelightSpecifications?.[0].finishedWidth, '15 3/8"');
consistent(custom);
const editedCustom = reconcileGlassDoorSetupChange(custom, { ...custom, customSlabWidth: '41' });
assert.equal(editedCustom.sidelightSpecifications?.[0].finishedWidth, '14 3/8"');
consistent(editedCustom);
const standard = reconcileGlassDoorSetupChange(editedCustom, selectSlabAxis(editedCustom, 'width', `3'0"`));
assert.deepEqual(standard.sidelightSpecifications, wood.sidelightSpecifications);
consistent(standard);
const heightOnly = { ...selectSlabAxis(custom, 'height', 'Custom'), customSlabHeight: '78' };
assert.equal(reconcileGlassDoorSetupChange(custom, heightOnly), heightOnly, 'height-only change must not rewrite horizontal inputs');
assert.deepEqual(consistent(heightOnly).glassCalc?.headerWidth, consistent(custom).glassCalc?.headerWidth);

const impossible = reconcileGlassDoorSetupChange(custom, { ...custom, customSlabWidth: '60' });
const blocked = calculateGlassGeometry(impossible);
assert.equal(blocked.status, 'Blocked');
assert.equal(blocked.glassCalc, null);
assert.deepEqual(blocked.glassUnits, []);
assert.notEqual(impossible.sidelightSpecifications?.[0].finishedWidth, custom.sidelightSpecifications?.[0].finishedWidth);
assert.equal(normalizeDoorLineInput(impossible).ok, false);
assert.equal(createWorkOrderRowGroup(impossible as NativeDoorLine, null).primaryRow.status, 'Blocked');
const recovered = reconcileGlassDoorSetupChange(impossible, { ...impossible, customSlabWidth: '40' });
consistent(recovered);

for (const config of ['SD', 'T/SDS']) {
  const panel = fixture(config, '60', true);
  const next = reconcileGlassDoorSetupChange(panel, { ...panel, width: `3'6"` });
  assert.equal(next.roWidth, panel.roWidth);
  assert.notDeepEqual(next.sidelightSpecifications, panel.sidelightSpecifications);
  const result = consistent(next);
  assert.ok(result.panelSidelights.length > 0);
  assert.ok(next.sidelightSpecifications?.every(entry => entry.panelConstructionNotes === 'Custom panel'));
}
for (const construction of ['low-profile-quarter-sill', 'jamb-four-sides'] as const) {
  const line = { ...original, construction, sill: construction === 'jamb-four-sides' ? 'J-4-S' : 'LOW-PRO' };
  const next = reconcileGlassDoorSetupChange(line, { ...line, width: `3'6"` });
  const before = consistent(line).glassCalc!;
  const after = consistent(next).glassCalc!;
  for (const key of ['jambLeg', 'transomHeight', 'finalDoorHeight', 'cutDown']) assert.equal(after[key], before[key]);
}
const dd = fixture('T/SDDS', '110 1/16');
const astragal = reconcileGlassDoorSetupChange(dd, { ...dd, doubleDoorAstragal: 'wood-ferco-astra-lock' });
assert.equal(astragal.roWidth, dd.roWidth);
assert.notDeepEqual(astragal.sidelightSpecifications, dd.sidelightSpecifications);
consistent(astragal);
const customDd: DoorLineInput = { ...dd, customSlab: 'WoodCustom', doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '35', inactiveWidth: '35', height: '79' } };
const resolvedDd = reconcileGlassDoorSetupChange(dd, customDd);
consistent(resolvedDd);
const changedLeaf = reconcileGlassDoorSetupChange(resolvedDd, { ...resolvedDd, doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '36', inactiveWidth: '35', height: '79' } });
assert.equal(changedLeaf.roWidth, resolvedDd.roWidth);
assert.notDeepEqual(changedLeaf.sidelightSpecifications, resolvedDd.sidelightSpecifications);
consistent(changedLeaf);
const fitDd = { ...dd, customSlab: 'RO' };
const fitNext = reconcileGlassDoorSetupChange(fitDd, { ...fitDd, width: `3'6"` });
assert.deepEqual(fitNext.sidelightSpecifications, fitDd.sidelightSpecifications, 'Fit to RO DD retains its existing leaf-cut authority');
assert.deepEqual(calculateGlassGeometry(fitNext), calculateGlassGeometry({ ...fitDd, width: `3'6"` }));

// Preserve the existing equal-width rounding contract, including DD half-step
// splits. Do not add an exact-equality RO blocker that rejects these valid flows.
const roundedDd = fixture('SDDS', '110');
const roundedNext = reconcileGlassDoorSetupChange(roundedDd, { ...roundedDd, width: `3'6"` });
assert.equal(roundedNext.roWidth, roundedDd.roWidth);
assert.deepEqual(roundedNext.sidelightSpecifications, reconcileGlassDimensionCommit({ ...roundedDd, width: `3'6"` }, { kind: 'roWidth', value: roundedDd.roWidth }).sourcePatch.sidelightSpecifications);
assert.equal(calculateGlassGeometry(roundedNext).status, 'Complete');

// Save, saved-card derivation, work-order and reopen reconciliation agree.
for (const line of [widened, custom, recovered]) {
  const saved = normalizeDoorLineInput(line);
  assert.ok(saved.ok, JSON.stringify(saved));
  const result = consistent(saved.value);
  assert.deepEqual(withDerivedGlassGeometry(saved.value).glassCalc, result.glassCalc);
  const reopened = { ...saved.value, ...reconcileGlassDimensionCommit(saved.value, { kind: 'roWidth', value: saved.value.roWidth }).sourcePatch };
  assert.deepEqual(calculateGlassGeometry(reopened), result);
  const output = createWorkOrderRowGroup(saved.value as NativeDoorLine, null);
  assert.deepEqual(output, createWorkOrderRowGroup(reopened as NativeDoorLine, null));
  assert.equal(output.primaryRow.status, 'Complete');
  assert.ok(output.diagram);
  assert.ok(JSON.stringify(output.detailRows).includes('58'));
}
console.log('Door Setup horizontal reconciliation: PASS');
