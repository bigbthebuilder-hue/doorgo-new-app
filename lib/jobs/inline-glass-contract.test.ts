import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput } from './door-line-contract';
import { calculateGlassGeometry } from './glass-geometry-contract';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import type { DoorLineInput, NativeDoorLine } from './job-intake-types';

const observed: DoorLineInput = { ...defaultDoorLine('Exterior'), config: 'T/DS', construction: 'low-profile-quarter-sill',
  roWidth: '54', roHeight: '95', transomTBarSize: '1.5', sidelightType: 'Glass', sidelightGlass: 'CLR_SB60_K4SG', transomGlassTypeCode: 'CLEAR' };
const result = calculateGlassGeometry(observed);
assert.equal(result.status, 'Complete');
assert.equal(result.glassCalc?.jambLeg, '94 1/2"');
assert.equal(result.glassCalc?.finalDoorHeight, '79"');
assert.equal(result.glassCalc?.sidelightHeight, '79 1/8"');
assert.equal(result.glassCalc?.transomHeight, '12 1/4"');
assert.equal(79 + 1.625 + 1.5 + 0.625 + 12.25, 95, 'One construction allowance, one T-bar, existing transom allowances');
assert.equal(result.glassCalc?.cutDown, '0"');

for (const input of [observed, { ...defaultDoorLine('Exterior'), construction: 'low-profile-quarter-sill' as const }, { ...observed, config: 'SD', roHeight: '80 3/8' }]) {
  const normalized = normalizeDoorLineInput(input);
  assert.ok(normalized.ok);
  const line: NativeDoorLine = { ...normalized.value, lineId: 'test', lineIndex: 1, lineStatus: 'Active', createdAt: '', updatedAt: '', createdByUserId: '', updatedByUserId: '' };
  const low = createWorkOrderRowGroup(line, null);
  assert.equal(low.primaryRow.cells.sill, 'LowPro');
  assert.ok(!JSON.stringify(low).includes('Low Profile'), 'Construction wording is not repeated in notes/details');
  assert.equal(createWorkOrderRowGroup({ ...line, construction: 'standard', sill: 'STD' }, null).primaryRow.cells.sill, 'STD');
  assert.equal(createWorkOrderRowGroup({ ...line, construction: 'standard', sill: 'Bronze' }, null).primaryRow.cells.sill, 'Bronze');
}
console.log('Inline glass / LowPro output / observed T/DS audit: PASS');
