import assert from 'node:assert/strict';
import {
  buildConfirmRequest, buildReconfirmRequest, buildRemoveRequest, buildReviseRequest,
  calculateAdjustment, checkpointActionMessage, checkpointHistoryStatusLabel, commandForSubmission,
  getCheckpointCurrentState, getCheckpointOperations, selectCalculatedCarry, selectCheckpointDate,
  type CheckpointReadItem,
} from './checkpoint-page-contract';

const row = (status: CheckpointReadItem['status'], revisionNumber = 1): CheckpointReadItem => ({
  checkpointId: '11111111-1111-4111-8111-111111111111', productionDate: '2026-07-13', revisionNumber, status,
  calculatedOpeningCarryHours: 4, actualOpeningCarryHours: 5, adjustmentHours: 1, note: 'note', removalReason: status === 'removed' ? 'reason' : null,
  recordedAt: '2026-07-13T08:00:00-07:00', recordedByDisplayName: 'Staff',
});

const empty = getCheckpointCurrentState([]); assert.equal(empty.kind, 'empty');
const confirmed = getCheckpointCurrentState([row('confirmed', 2), row('revised')]); assert.equal(confirmed.kind, 'confirmed');
const removed = getCheckpointCurrentState([row('removed', 3), row('revised', 2)]); assert.equal(removed.kind, 'removed');
assert.equal(checkpointHistoryStatusLabel(row('confirmed', 3), true), 'Confirmed');
assert.equal(checkpointHistoryStatusLabel(row('removed', 2), false), 'Removed');
assert.equal(checkpointHistoryStatusLabel(row('revised', 1), false), 'Previous version');
assert.equal(checkpointHistoryStatusLabel(row('confirmed', 1), false), 'Previous version');
assert.deepEqual(getCheckpointOperations('none', empty), []);
assert.deepEqual(getCheckpointOperations('view', confirmed), []);
assert.deepEqual(getCheckpointOperations('use', empty), ['confirm']);
assert.deepEqual(getCheckpointOperations('use', confirmed), ['revise', 'remove']);
assert.deepEqual(getCheckpointOperations('use', removed), ['reconfirm']);

assert.deepEqual(selectCheckpointDate(undefined, '2026-07-13'), { selectedDate: '2026-07-13', message: null });
assert.equal(selectCheckpointDate('2026-07-14', '2026-07-13').selectedDate, '2026-07-13');
assert.ok(selectCheckpointDate('not-a-date', '2026-07-13').message);
assert.equal(selectCalculatedCarry({ selectedDate: '2026-07-13', today: '2026-07-13', revisions: [row('confirmed')], liveCarry: 7 }), 7);
assert.equal(selectCalculatedCarry({ selectedDate: '2026-07-13', today: '2026-07-13', revisions: [], liveCarry: null }), null);
assert.equal(selectCalculatedCarry({ selectedDate: '2026-07-12', today: '2026-07-13', revisions: [row('confirmed')], liveCarry: 7 }), 4);
assert.equal(selectCalculatedCarry({ selectedDate: '2026-07-12', today: '2026-07-13', revisions: [], liveCarry: 7 }), null);
assert.equal(calculateAdjustment(5, 4), 1); assert.equal(calculateAdjustment(5, null), null);

const common = { commandId: '22222222-2222-4222-8222-222222222222', productionDate: '2026-07-13', openingCarryHours: 5, calculatedOpeningCarrySnapshot: null, note: null };
assert.equal(buildConfirmRequest(common).calculatedOpeningCarrySnapshot, null);
assert.deepEqual(buildReconfirmRequest(common), buildConfirmRequest(common));
assert.equal(buildReviseRequest({ ...common, expectedCheckpointId: row('confirmed').checkpointId, expectedRevisionNumber: 2 }).expectedRevisionNumber, 2);
assert.equal(buildRemoveRequest({ commandId: common.commandId, productionDate: common.productionDate, expectedCheckpointId: row('confirmed').checkpointId, expectedRevisionNumber: 2, removalReason: 'reason' }).removalReason, 'reason');

let generated = 0; const createUuid = () => `new-${++generated}`;
const first = commandForSubmission({ commandId: 'stable', submittedFingerprint: null }, 'same', createUuid);
const retry = commandForSubmission(first, 'same', createUuid); assert.equal(retry.commandId, 'stable');
const changed = commandForSubmission(retry, 'different', createUuid); assert.equal(changed.commandId, 'new-1');
assert.equal(checkpointActionMessage('stale_revision'), 'This checkpoint changed after the page was opened. The latest version has been loaded.');

console.log('Phase 2F-C4 checkpoint UI focused contract tests passed');
