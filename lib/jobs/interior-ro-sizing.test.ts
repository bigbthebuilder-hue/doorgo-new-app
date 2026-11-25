import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { defaultDoorLine, DOOR_HEIGHTS, normalizeDoorLineInput, doorLineEquivalenceKey } from './door-line-contract';
import { calculateNonGlassFrameCut } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { gapUnderDoor, usesInteriorRoSizing, resolveInteriorRoHeight } from './interior-ro-sizing';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import { duplicateDoorLine, newDoorFromSession, createNewDoorSession, changeSizingMode } from './door-line-editor-state';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const input = (extra: DoorLineInput = {}): DoorLineInput => ({ ...defaultDoorLine('Interior'), customSlab: 'RO', ...extra });
const result = (extra: DoorLineInput = {}) => {
  const value = calculateNonGlassFrameCut(input(extra));
  assert.equal(value.status, 'Complete', JSON.stringify(value)); assert.ok(value.values);
  return value;
};
for (const height of DOOR_HEIGHTS) for (const config of ['D', 'DD']) {
  const stock = height === `6'8"` ? 80 : height === `7'0"` ? 84 : 96;
  for (const gap of ['1', '1/2', '1 1/2', '0']) {
    const selected = gap === '1/2' ? 0.5 : gap === '1 1/2' ? 1.5 : Number(gap);
    const ro = stock - 1;
    const cut = result({ height, config, roHeight: String(ro), gapUnderDoor: gap });
    assert.equal(cut.values!.jambLeg!.inches, ro - 0.5);
    assert.equal(cut.values!.finalSlabHeight.inches, ro - 0.5 - 0.75 - 0.125 - selected);
    for (const roHeight of [undefined, String(stock + 2.375), String(stock + 10)]) {
      const normal = result({ height, config, roHeight, gapUnderDoor: gap });
      assert.equal(normal.values!.jambLeg!.inches, stock + 1.875);
      assert.equal(normal.values!.finalSlabHeight.inches, Math.min(stock, stock + 1 - selected));
      assert.deepEqual(normal.warnings, []);
    }
  }
  assert.deepEqual(result({ height, config, roHeight: String(stock + 1.5) }).warnings, [], 'routine fractional cut is an instruction, not a warning');
}
// The helper is height-agnostic; any other supported numeric stock height uses the same formula.
assert.equal(resolveInteriorRoHeight(90, 87, 1).finalSlabHeight, 84.625);
const example = result({ roHeight: '77 1/4' });
assert.equal(example.values!.jambLeg!.display, '76 3/4"');
assert.equal(example.values!.finalSlabHeight.display, '74 7/8"');
assert.equal(result({ roHeight: '77 1/4', gapUnderDoor: '1/2' }).values!.finalSlabHeight.display, '75 3/8"');
assert.ok(example.warnings.some(issue => issue.code === 'door_cut_down'), 'large-cut safeguard retained');
assert.equal(calculateNonGlassFrameCut(input({ roHeight: '1' })).status, 'Blocked');
assert.ok(result({ config: 'DD', roWidth: '40' }).warnings.some(issue => issue.code === 'special_dd_width'));
assert.ok(result({ roWidth: '30' }).warnings.some(issue => issue.code === 'door_width_cut'));
for (const gap of ['bad', '-1', '0.01']) assert.equal(normalizeDoorLineInput(input({ gapUnderDoor: gap })).ok, false);
for (const gap of [undefined, '', null, '1', '1.0', '1"']) assert.equal(gapUnderDoor(gap).ok, true);
assert.equal(doorLineEquivalenceKey(input()), doorLineEquivalenceKey(input({ gapUnderDoor: '1.0' })));
assert.notEqual(doorLineEquivalenceKey(input()), doorLineEquivalenceKey(input({ gapUnderDoor: '1/2' })));
const line = { ...input({ roHeight: '80', gapUnderDoor: '1/2' }), lineId: 'fixture', lineIndex: 1, lineStatus: 'Active' } as NativeDoorLine;
assert.match(JSON.stringify(createWorkOrderRowGroup(line, null)), /Gap under door: 1\/2/);
assert.doesNotMatch(JSON.stringify(createWorkOrderRowGroup({ ...line, gapUnderDoor: '1' }, null)), /Gap under door:/);
const capped = createWorkOrderRowGroup({ ...line, roHeight: '100' }, null);
assert.match(JSON.stringify(capped), /selected 1\/2/);
assert.match(JSON.stringify(capped), /full-height slab retained/);
assert.equal(duplicateDoorLine(line, 'duplicate', 2).gapUnderDoor, '1/2');
assert.equal(gapUnderDoor(newDoorFromSession(createNewDoorSession()).gapUnderDoor).ok, true);
for (const extra of [{ mode: 'Exterior' }, { construction: 'low-profile-quarter-sill' }, { construction: 'jamb-four-sides' }, { supplyType: 'slab-only' }, { config: 'PKT' }, { config: 'B.P.' }, { customSlab: 'No' }]) assert.equal(usesInteriorRoSizing(input(extra as DoorLineInput)), false);

// Golden fingerprint captured from production 8cf1862 before this change;
// excludes newly applicable standard/custom interior sizing.
// It freezes full dimension, warning and blocker outputs for excluded workflows.
export function excludedOutputs(calc = calculateNonGlassFrameCut) {
  const outputs: unknown[] = [];
  for (const height of DOOR_HEIGHTS) for (const mode of ['Exterior', 'Interior'] as const) for (const material of ['wood', 'fiberglass']) for (const config of ['D','DD']) for (const construction of ['standard', 'low-profile-quarter-sill', 'jamb-four-sides'] as const) for (const roHeight of [undefined, '77 1/4', '110']) for (const roWidth of [undefined, '30', '75']) {
    const line = { ...defaultDoorLine(mode), height, config, construction, material, customSlab: 'RO', roHeight, roWidth, hand: 'LH', gapUnderDoor: '1/2' };
    if (!usesInteriorRoSizing(line)) outputs.push(calc(line));
  }
  for (const height of DOOR_HEIGHTS) for (const config of ['SD', 'SDS', 'T/SD']) for (const roHeight of ['77', '90', '110']) {
    outputs.push(calculateGlassGeometry({ ...defaultDoorLine(), height, config, roHeight, roWidth: '60', gapUnderDoor: '1/2', sidelightGlass: 'CLEAR', transomGlass: 'CLEAR' }));
  }
  for (const supplyType of ['slab-only'] as const) for (const customSlab of ['No', 'RO']) outputs.push(calc(input({ supplyType, customSlab, roHeight: '77', gapUnderDoor: '1/2' })));
  return outputs;
}
assert.equal(createHash('sha256').update(JSON.stringify(excludedOutputs())).digest('hex'), 'd00f8d0bc1c1630d0b6073625c4a124abc764e0658ed41ebec811f9bb4d76b77');
console.log('Interior Fit to RO: supported heights, fixed jambs, gaps, stock cap, safeguards, work orders and excluded-workflow regression passed.');

// Independent bottom clearance: preserve slab dimensions and all width/header calculations.
for (const height of DOOR_HEIGHTS) for (const config of ['D', 'DD']) {
  const base = input({ config, height, customSlab: 'No' });
  const legacy = calculateNonGlassFrameCut(base);
  for (const gap of ['0', '1/2', '1', '1 1/2']) {
    const parsed = gapUnderDoor(gap); assert.ok(parsed.ok);
    const sized = calculateNonGlassFrameCut({ ...base, gapUnderDoor: gap });
    assert.equal(sized.values?.finalSlabHeight.inches, legacy.values?.finalSlabHeight.inches);
    assert.equal(sized.values?.jambLeg?.inches, legacy.values!.actualSlabHeight.inches + 0.875 + parsed.inches);
    assert.deepEqual(sized.values?.headerWidth, legacy.values?.headerWidth);
    assert.deepEqual(sized.warnings, legacy.warnings);
  }
}
for (const config of ['D', 'DD']) for (const gap of ['1', '1/2']) {
  const custom = input({ config, customSlab: config === 'DD' ? 'WoodCustom' : 'CustomHeight', customSlabHeight: '78',
    ...(config === 'DD' ? { doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '22 7/8', inactiveWidth: '22 7/8', height: '78' } } : {}), gapUnderDoor: gap });
  const sized = calculateNonGlassFrameCut(custom); assert.equal(sized.status, 'Complete');
  assert.equal(sized.values?.finalSlabHeight.inches, 78);
  assert.equal(sized.values?.jambLeg?.display, gap === '1' ? '79 7/8"' : '79 3/8"');
  if (config === 'DD') assert.equal(sized.values?.headerWidth?.display, '46"');
  const saved = normalizeDoorLineInput(custom); assert.ok(saved.ok);
  const line = { ...saved.value, lineId: 'custom', lineIndex: 1, lineStatus: 'Active' } as NativeDoorLine;
  if (gap === '1/2') assert.match(JSON.stringify(createWorkOrderRowGroup(line, null)), /Gap under door: 1\/2/);
  assert.equal(duplicateDoorLine(line, 'copy', 2).gapUnderDoor, saved.value.gapUnderDoor);
  for (const mode of ['No', 'RO', 'WoodCustom'] as const) assert.equal(changeSizingMode(custom, mode).gapUnderDoor, gap);
}
for (const customSlab of ['No', 'CustomHeight', 'RO']) assert.equal(normalizeDoorLineInput(input({ customSlab, gapUnderDoor: 'bad' })).ok, false);
console.log('Independent interior gap: standard/custom slabs, D/DD, all stock heights, exact DD example, validation, documents and mode changes passed.');
