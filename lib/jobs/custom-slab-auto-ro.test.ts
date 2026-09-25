import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { automaticCustomSlabRoWidth } from './non-glass-frame-cut-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { glassEditorVisibility } from './glass-editor-contract';
import type { DoorLineInput } from './job-intake-types';

const single: DoorLineInput = { ...defaultDoorLine('Exterior'), material: 'wood', customSlab: 'WoodCustom', customSlabWidth: '36', customSlabHeight: '79' };
const double: DoorLineInput = { ...single, material: 'fiberglass', config: 'DD', customSlabWidth: null, customSlabHeight: null, doubleDoorSizing: { kind: 'custom-slabs', activeWidth: '41-3/4', inactiveWidth: '35-3/4', height: '79' } };
assert.equal(automaticCustomSlabRoWidth(single)?.display, '38 1/4"');
assert.equal(automaticCustomSlabRoWidth(double)?.display, '80 9/16"');
for (const base of [single, double]) {
  const line = { ...base, config: 'T/' + base.config, roWidth: '', roHeight: '95', transomGlassTypeCode: 'CLEAR', transomTBarSize: '1.5' } as DoorLineInput;
  const result = calculateGlassGeometry(line);
  assert.equal(glassEditorVisibility(line).requireRoWidth, false);
  assert.equal(glassEditorVisibility(line).requireRoHeight, true);
  assert.ok(result.glassCalc, JSON.stringify(result));
  assert.equal(result.glassCalc.roWidth, automaticCustomSlabRoWidth(base)?.display);
  assert.equal(result.glassCalc.headerWidth, base.config === 'DD' ? '78 9/16"' : '36 1/4"');
  assert.equal(result.glassCalc.transomWidth, base.config === 'DD' ? '78 7/16"' : '36 1/8"');
  assert.deepEqual(calculateGlassGeometry({ ...line, roWidth: '1' }).glassCalc, result.glassCalc, 'Stale entered width cannot replace the derived width');
  const missingHeight = calculateGlassGeometry({ ...line, roHeight: '' });
  assert.equal(missingHeight.status, 'Glass Detail Needed');
  assert.ok(missingHeight.incompleteDetails.some(x => x.code === 'ro_height_required'));
  assert.ok(!missingHeight.incompleteDetails.some(x => x.code === 'ro_width_required'));
  assert.ok(normalizeDoorLineInput(line).ok);
  const lowProfile = calculateGlassGeometry({ ...line, construction: 'low-profile-quarter-sill' });
  assert.equal(lowProfile.glassCalc?.roWidth, result.glassCalc.roWidth);
  assert.equal(lowProfile.glassCalc?.transomHeight, '12 1/4"');
}
for (const config of ['SD', 'SDS', 'T/SD', 'T/SDS', 'T/SDDS']) {
  const line: DoorLineInput = { ...(config.includes('DD') ? double : single), config, roWidth: '', roHeight: '95', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlassTypeCode: 'CLEAR' };
  assert.equal(automaticCustomSlabRoWidth(line), null);
  assert.ok(calculateGlassGeometry(line).incompleteDetails.some(x => x.code === 'ro_width_required'));
}
assert.equal(automaticCustomSlabRoWidth({ ...double, customSlab: 'RO' }), null);
assert.equal(automaticCustomSlabRoWidth({ ...double, customSlab: 'No' }), null);
console.log('Custom slab automatic RO width / required transom height: PASS');
