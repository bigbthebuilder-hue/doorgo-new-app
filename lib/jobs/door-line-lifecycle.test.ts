import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { defaultDoorLine } from './door-line-contract';
import { createNewDoorSession, isSameDoorMode, newDoorFromSession, rememberNewDoor, replaceDoorLineById } from './door-line-editor-state';

let session = createNewDoorSession();
assert.equal(newDoorFromSession(session, 'Interior').hingeType, 'REG');
assert.equal(newDoorFromSession(session).hingeType, 'BB');
for (const mode of ['Interior', 'Exterior'] as const) {
  const draft = { ...defaultDoorLine(mode), hingeType: mode === 'Interior' ? 'BB' : 'NRP',
    doorType: mode === 'Interior' ? 'Molded 6 Panel' : 'S3200', height: mode === 'Interior' ? `7'0"` : `8'0"`,
    width: `2'8"`, config: 'DD', qty: 3, notes: 'One line only', hand: 'RH', jambType: 'Fir',
    customSlab: 'RO', roWidth: '60', roHeight: '90', ripJamb: 'Yes', doorThickness: '1-3/4',
  };
  session = rememberNewDoor(session, draft, null);
  const afterAdd = newDoorFromSession(session);
  assert.equal(afterAdd.mode, mode);
  for (const field of ['doorType', 'hingeType', 'height'] as const) assert.equal(afterAdd[field], draft[field]);
  const defaults = defaultDoorLine(mode);
  for (const field of ['width', 'config', 'hand', 'jambWidth', 'jambType', 'sill', 'weatherstrip', 'qty', 'notes', 'customSlab', 'roWidth', 'roHeight', 'ripJamb', 'doorThickness', 'glassCalc', 'glassOverride'] as const) {
    assert.deepEqual(afterAdd[field], defaults[field], `${mode}: reset ${field}`);
  }
  assert.equal(afterAdd.prep, mode === 'Exterior' ? 'MULTI' : 'YES');
}
// Switching types restores independent values; clicking the current type is a no-op.
const interior = newDoorFromSession(session, 'Interior');
const exterior = newDoorFromSession(session, 'Exterior');
assert.deepEqual([interior.hingeType, interior.doorType, interior.height, interior.width], ['BB', 'Molded 6 Panel', `7'0"`, `2'6"`]);
assert.deepEqual([exterior.hingeType, exterior.doorType, exterior.height, exterior.width], ['NRP', 'S3200', `8'0"`, `3'0"`]);
assert.equal(isSameDoorMode({ ...interior, notes: 'Keep draft' }, 'Interior'), true);
assert.equal(isSameDoorMode(interior, 'Exterior'), false);

const beforeEdit = structuredClone(session);
const edited = { ...interior, lineId: 'existing', doorType: 'Edited only', hingeType: 'REG', height: `6'8"` };
assert.equal(rememberNewDoor(session, edited, 'existing'), session);
assert.deepEqual(session, beforeEdit);
// Both Update and Cancel return to the previous new-door mode and remembered defaults.
assert.deepEqual(newDoorFromSession(session), exterior);
const other = { ...exterior, lineId: 'other' };
const updated = replaceDoorLineById([other, { ...interior, lineId: 'existing' }], 'existing', edited);
assert.equal(updated[0], other);
assert.deepEqual(updated[1], edited);
assert.throws(() => replaceDoorLineById(updated, 'existing', { ...edited, lineId: 'changed' }));
assert.throws(() => replaceDoorLineById([edited, edited], 'existing', edited));

// Inapplicable hinges must not erase framed-door memory, including normalized PKT saves.
session = rememberNewDoor(session, { ...interior, config: 'PKT', hingeType: null }, null);
assert.equal(newDoorFromSession(session).hingeType, 'BB');
assert.equal(newDoorFromSession(createNewDoorSession()).doorType, '', 'Reopen starts a fresh session');
for (const height of [`7'0"`, `8'0"`]) {
  const tall = rememberNewDoor(createNewDoorSession(), { ...defaultDoorLine('Exterior'), height }, null);
  assert.equal(newDoorFromSession(tall).prep, 'MULTI');
}

// Guard actual handler wiring as well as the pure state transitions above.
const source = readFileSync('components/jobs/DoorLineWorkspace.tsx', 'utf8');
assert.match(source, /if \(isSameDoorMode\(editor, nextMode\)\) return;\s*if \(!confirmsGlassDiscard\(\)\) return;/);
assert.match(source, /function resetEditor\(\) \{\s*const next = newDoorFromSession\(newDoorSession.current\)/);
assert.match(source, /rememberNewDoor\(newDoorSession.current, submittedEditor, editingLineId\);\s*const nextEditor = newDoorFromSession\(newDoorSession.current\)/);
assert.match(source, /onChange\(replaceDoorLineById\(lines, editingLineId, saved\)\)/);
assert.match(source, /function edit\(line: DoorLineInput\) \{[^]*?rememberNewDoor\(newDoorSession.current, editor, editingLineId\);/);
console.log('Door line lifecycle: PASS');
