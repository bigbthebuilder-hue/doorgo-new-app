import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { customSlabAxis, selectSlabAxis } from './slab-sizing-contract';
import { calculateNonGlassFrameCut, usesAutomaticCustomSlabRoWidth } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry, slabFor } from './glass-geometry-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { duplicateDoorLine } from './door-line-editor-state';
import { changeSizingMode } from './door-line-editor-state';
import { reconcileGlassDimensionCommit } from './glass-dimension-reconciliation-contract';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const interior = defaultDoorLine('Interior');
const heightOnly = { ...selectSlabAxis(interior, 'height', 'Custom'), customSlabHeight: '79-1/2' };
assert.equal(heightOnly.customSlab, 'CustomHeight');
assert.equal(customSlabAxis(heightOnly, 'width'), false);
assert.equal(normalizeDoorLineInput(heightOnly).ok, true);
const h = calculateNonGlassFrameCut(heightOnly);
assert.equal(h.values?.actualSlabWidth.inches, 30);
assert.equal(h.values?.actualSlabHeight.inches, 79.5);
assert.equal(h.values?.headerWidth?.inches, 30.25);
assert.equal(h.values?.jambLeg?.inches, 81.375);
assert.equal(h.values?.cutDown.inches, 0);
assert.equal(usesAutomaticCustomSlabRoWidth(heightOnly), false);
const row = (line: DoorLineInput) => createWorkOrderRowGroup(line as NativeDoorLine, null);
assert.equal(row(heightOnly).primaryRow.cells.size.replace(/\s/g, ' '), `2'6" × 79 1/2"`);
assert.doesNotMatch(JSON.stringify(row(heightOnly).detailRows), /Recommended RO width/);
const exterior = defaultDoorLine('Exterior');
for (const material of ['fiberglass', 'wood']) {
  const line = { ...exterior, material };
  const values = calculateNonGlassFrameCut(line).values!;
  assert.equal(values.actualSlabWidth.inches, material === 'fiberglass' ? 35.75 : 36);
  assert.equal(values.actualSlabHeight.inches, material === 'fiberglass' ? 79 : 80);
  assert.equal(values.headerWidth?.inches, material === 'fiberglass' ? 36 : 36.25);
}
const widthOnly = { ...selectSlabAxis({ ...exterior, material: 'wood' }, 'width', 'Custom'), customSlabWidth: '31-1/8' };
assert.equal(widthOnly.customSlab, 'CustomWidth');
assert.equal(normalizeDoorLineInput(widthOnly).ok, true);
assert.equal(calculateNonGlassFrameCut(widthOnly).values?.actualSlabHeight.inches, 80);
assert.equal(calculateNonGlassFrameCut(widthOnly).values?.actualSlabWidth.inches, 31.125);
assert.equal(row(widthOnly).primaryRow.cells.size.replace(/\s/g, ' '), `31 1/8" × 6'8"`);
assert.match(JSON.stringify(row(widthOnly).detailRows), /Recommended RO width/);
for (const customSlab of ['WoodCustom', 'Yes']) {
  const line = { ...interior, customSlab, customSlabWidth: '31', customSlabHeight: '79' };
  assert.equal(customSlabAxis(line, 'width'), true);
  assert.equal(customSlabAxis(line, 'height'), true);
  assert.equal(normalizeDoorLineInput(line).ok, true);
  assert.equal(normalizeDoorLineInput({ ...line, customSlabWidth: '' }).ok, false);
  assert.equal(calculateNonGlassFrameCut({ ...line, customSlabWidth: '' }).status, 'Incomplete');
}
assert.equal(normalizeDoorLineInput({ ...widthOnly, customSlabWidth: '' }).ok, false);
assert.equal(normalizeDoorLineInput({ ...heightOnly, customSlabHeight: '' }).ok, false);
assert.equal(normalizeDoorLineInput({ ...widthOnly, material: 'fiberglass' }).ok, false);
for (const line of [heightOnly, widthOnly]) {
  const normalized = normalizeDoorLineInput(line);
  assert.ok(normalized.ok);
  assert.equal(normalized.value.customSlab, line.customSlab);
  assert.equal(duplicateDoorLine(normalized.value, 'duplicate', 2).customSlab, line.customSlab);
}
const transom = { ...heightOnly, mode: 'Exterior', material: 'wood', config: 'T/D', roWidth: '33', roHeight: '96', transomGlass: 'Clear' };
const side = { ...widthOnly, config: 'SD', roWidth: '60', sidelightType: 'Glass', sidelightGlass: 'Clear' } satisfies DoorLineInput;
for (const line of [transom, side] as DoorLineInput[]) {
  const result = calculateGlassGeometry(line);
  assert.notEqual(result.status, 'Blocked');
  assert.ok(result.glassCalc);
  const paired = calculateGlassGeometry({ ...line, customSlab: 'WoodCustom', customSlabWidth: line === transom ? '30' : '31-1/8', customSlabHeight: line === transom ? '79-1/2' : '80' });
  assert.equal(result.glassCalc.headerWidth, paired.glassCalc?.headerWidth);
  assert.equal(result.glassCalc.jambLeg, paired.glassCalc?.jambLeg);
}
assert.equal(slabFor(side).ok, true);
assert.equal(selectSlabAxis({ ...interior, customSlab: 'RO', roWidth: '32' }, 'height', 'Custom').roWidth, '');
const fit = { ...changeSizingMode(heightOnly, 'RO'), roWidth: '30', roHeight: '78' };
assert.equal(customSlabAxis(fit, 'height'), false);
assert.equal(fit.customSlabHeight, '');
assert.deepEqual(calculateNonGlassFrameCut(fit), calculateNonGlassFrameCut({ ...interior, customSlab: 'RO', roWidth: '30', roHeight: '78' }));
const direct = reconcileGlassDimensionCommit(side, { kind: 'roWidth', value: '60' });
assert.equal(direct.blockers.length, 0);
assert.equal(direct.calculatedGeometry.glassCalc?.slabWidth, calculateGlassGeometry(side).glassCalc?.slabWidth);
const standardFour = { ...interior, construction: 'jamb-four-sides' as const };
assert.ok(calculateNonGlassFrameCut(standardFour).values?.recommendedRoWidth);
assert.doesNotMatch(JSON.stringify(row(standardFour).detailRows), /Recommended RO width/);
assert.match(JSON.stringify(row({ ...standardFour, roWidth: '33' }).detailRows), /Recommended RO width/);
console.log('Independent slab axes, compatibility, geometry and Work Order: PASS');
