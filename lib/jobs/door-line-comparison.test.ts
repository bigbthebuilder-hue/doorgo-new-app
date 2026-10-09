import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lastActiveDoorBaseline, replaceDoorLineById } from './door-line-editor-state';
import type { DoorLineInput } from './job-intake-types';

// Simulate the empty first render followed by existing saved job data arriving.
let lines: DoorLineInput[] = [];
assert.equal(lastActiveDoorBaseline(lines), null);
const third: DoorLineInput = { lineId: 'door-3', lineStatus: 'Active', height: `8'0"`, hand: 'RH', jambType: 'Fir', config: 'T/SDS', mode: 'Exterior' };
lines = [{ lineId: 'door-1', lineStatus: 'Active' }, { lineId: 'door-2', lineStatus: 'Active' }, third];
assert.equal(lastActiveDoorBaseline(lines), third, 'Loaded job immediately supplies Door 3 without a session save');
const draft: DoorLineInput = { height: `6'8"`, hand: 'LH', jambType: 'Primed' };
for (const field of ['height', 'hand', 'jambType']) {
  assert.notEqual(String(draft[field]), String(lastActiveDoorBaseline(lines)?.[field]), `${field} differs immediately`);
}
assert.equal(lastActiveDoorBaseline(lines)?.config, 'T/SDS', 'Baseline retains saved glass data');
const fourth: DoorLineInput = { ...draft, lineId: 'door-4', lineStatus: 'Active' };
lines = [...lines, fourth];
assert.equal(lastActiveDoorBaseline(lines), fourth, 'Adding Door 4 supplies the next baseline');
lines = [...lines, { lineId: 'archived', lineStatus: 'Archived' }];
assert.equal(lastActiveDoorBaseline(lines), fourth, 'Trailing archived lines are ignored');
lines = replaceDoorLineById(lines, 'door-1', { ...lines[0], height: `7'0"` });
assert.equal(lastActiveDoorBaseline(lines), fourth, 'Updating an earlier door does not override authoritative order');
assert.equal(lastActiveDoorBaseline([fourth, third]), third, 'Current array order is authoritative');
assert.equal(lastActiveDoorBaseline([{ lineId: 'archived', lineStatus: 'Archived' }]), null);

// Guard the React integration against reintroducing a mount-only snapshot.
const workspace = readFileSync('components/jobs/DoorLineWorkspace.tsx', 'utf8');
assert.match(workspace, /const priorDoor = lastActiveDoorBaseline\(lines\)/);
assert.match(workspace, /editingLineId !== null \? JSON\.parse\(editorBaseline\) : priorDoor/);
for (const field of ['hand', 'jambType']) {
  assert.ok(workspace.includes(`data-comparison-different={differs('${field}') || undefined}`));
}
console.log('Door line comparison baseline: PASS');

assert.ok(workspace.includes("data-comparison-different={differs('height') || (comparisonValues !== null && customSlabAxis(editor, 'height') !== customSlabAxis(comparisonValues, 'height')) || undefined}"), 'Height comparison includes nominal and custom-axis differences');