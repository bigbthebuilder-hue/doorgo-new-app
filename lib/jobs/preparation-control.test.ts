import assert from 'node:assert/strict';
import { defaultDoorLine, normalizeDoorLineInput, prepAfterHeightChange, prepChoices, calculateJ2AShopHours, doorLineEquivalenceKey } from './door-line-contract';
import { duplicateDoorLine, createNewDoorSession, rememberNewDoor, newDoorFromSession } from './door-line-editor-state';
import { createWorkOrderRowGroup } from './work-order-document-contract';
import type { NativeDoorLine, DoorLineInput } from './job-intake-types';
const normalized = (input: DoorLineInput) => {
  const result = normalizeDoorLineInput(input);
  assert.equal(result.ok, true, JSON.stringify(result));
  if (!result.ok) throw new Error('Invalid fixture');
  return { ...result.value, lineId: '11111111-1111-4111-8111-111111111111', lineIndex: 1, lineStatus: 'Active' as const };
};
for (const [height, expected] of [[`6'8"`, 'STD'], [`7'0"`, 'STD'], [`8'0"`, 'MULTI'], ['96', 'MULTI'], ['84', 'STD'], ['90', 'STD']]) {
  assert.equal(prepAfterHeightChange('Exterior', 'D', 'STD', height, 'automatic'), expected);
}
let automatic = { ...defaultDoorLine(), prep: 'STD' };
for (const [height, expected] of [[`8'0"`, 'MULTI'], [`7'0"`, 'STD'], [`6'8"`, 'STD']]) {
  automatic = { ...automatic, height, prep: prepAfterHeightChange('Exterior', 'D', automatic.prep, height, automatic.prepSource) };
  assert.equal(normalized(automatic).prep, expected);
}
for (const prep of ['STD', 'SINGLE', 'MULTI']) for (const prepSource of [undefined, 'manual'] as const) {
  for (const height of [`6'8"`, `7'0"`, `8'0"`]) {
    const saved = normalized({ ...defaultDoorLine(), prep, prepSource, height });
    assert.equal(saved.prep, prep);
    assert.equal(saved.prepSource, 'manual');
    assert.equal(normalized({ ...saved, notes: 'Unrelated change' }).prep, prep);
    const duplicate = duplicateDoorLine(saved, '22222222-2222-4222-8222-222222222222', 2);
    assert.equal(duplicate.prep, prep);
    assert.equal(duplicate.prepSource, 'manual');
    assert.equal(createWorkOrderRowGroup(saved as NativeDoorLine, null).primaryRow.cells.drill,
      { STD: 'Double drilled', SINGLE: 'Single drilled', MULTI: 'Multipoint' }[prep]);
  }
}
const auto = normalized({ ...defaultDoorLine(), height: `8'0"` });
assert.equal(auto.prep, 'MULTI');
assert.equal(duplicateDoorLine(auto, '22222222-2222-4222-8222-222222222222', 2).prepSource, 'automatic');
assert.notEqual(doorLineEquivalenceKey(auto), doorLineEquivalenceKey({ ...auto, prepSource: 'manual' }), 'merge must retain differing future default behavior');
let session = createNewDoorSession();
session = rememberNewDoor(session, auto, null);
assert.equal(newDoorFromSession(session).prep, 'MULTI');
assert.equal(newDoorFromSession(session).prepSource, 'automatic');
// SO 1962955 reproduction with synthetic inputs, never a hosted write.
const scenario = normalized({ ...defaultDoorLine(), doorType: '3070SG10LE', config: 'SD', height: `7'0"`, prep: 'STD', prepSource: 'manual' });
assert.equal(scenario.prep, 'STD');
assert.equal(createWorkOrderRowGroup(scenario as NativeDoorLine, null).primaryRow.cells.drill, 'Double drilled');
assert.equal(normalized({ ...scenario, prep: 'MULTI', prepSource: undefined }).prep, 'MULTI', 'existing example retains its stored choice until edited');
for (const [config, choices] of [['D', ['YES', 'NO']], ['DD', ['NO', 'BOTH']], ['B.P.', ['NO', 'HALF']], ['PKT', ['Round Weiser', 'Reg Emtek', 'LRG Emtek']]] as const) {
  assert.deepEqual(prepChoices('Interior', config), [...choices]);
  for (const prep of choices) assert.equal(normalized({ ...defaultDoorLine('Interior'), config, prep, prepSource: 'manual' }).prep, prep);
}
const invalid = normalizeDoorLineInput({ ...defaultDoorLine('Interior'), config: 'PKT', prep: 'YES', prepSource: 'manual' });
assert.equal(invalid.ok, false, 'configuration cannot silently replace incompatible manual selection');
if (!invalid.ok) assert.ok(invalid.fieldErrors.prep);
for (const [config, minutes] of [['D', 45], ['DD', 90]] as const) {
  const base = normalized({ ...defaultDoorLine(), config, prep: 'STD', prepSource: 'manual' });
  const multi = { ...base, prep: 'MULTI' };
  assert.equal(calculateJ2AShopHours([multi as NativeDoorLine]).shopHours! - calculateJ2AShopHours([base as NativeDoorLine]).shopHours!, minutes / 60);
}
console.log('Preparation defaults, manual/legacy protection, duplication, configuration, interior compatibility, work orders and selected-prep hours passed.');
