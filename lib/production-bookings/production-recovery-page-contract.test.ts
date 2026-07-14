import assert from 'node:assert/strict';
import {
  canMoveProductionRecovery,
  canReadProductionRecovery,
  getVancouverDate,
  PRODUCTION_RECOVERY_CARRY_WARNING,
} from './production-booking-move-contract';
import {
  canSubmitRecoveryMove,
  commandForRecoveryMoveAttempt,
  PARTLY_COMPLETED_GUIDANCE,
  previousFiveBusinessDays,
  projectedCapacityMessage,
  recoveryMoveMessage,
  retainCommandForRetry,
  selectRecoveryDateRange,
  WHOLE_JOB_ACKNOWLEDGEMENT,
  type TodayProductionSummary,
} from './production-recovery-page-contract';

assert.deepEqual(previousFiveBusinessDays('2026-07-14'), {
  startDate: '2026-07-07',
  endDate: '2026-07-13',
  businessDates: ['2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10', '2026-07-13'],
});
assert.deepEqual(previousFiveBusinessDays('2026-07-13'), {
  startDate: '2026-07-06',
  endDate: '2026-07-10',
  businessDates: ['2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09', '2026-07-10'],
});
assert.deepEqual(previousFiveBusinessDays('2026-01-05').businessDates, [
  '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02',
]);
assert.equal(getVancouverDate(new Date('2026-01-01T07:30:00Z')), '2025-12-31');

assert.equal(selectRecoveryDateRange(undefined, '2026-07-14').kind, 'default');
assert.equal(selectRecoveryDateRange({ start: '2026-07-01' }, '2026-07-14').valid, false);
assert.equal(selectRecoveryDateRange({ start: '2026-07-10', end: '2026-07-09' }, '2026-07-14').valid, false);
assert.equal(selectRecoveryDateRange({ start: '2026-07-01', end: '2026-07-14' }, '2026-07-14').valid, false);
assert.equal(selectRecoveryDateRange({ start: '2026-02-30', end: '2026-07-01' }, '2026-07-14').valid, false);
assert.equal(selectRecoveryDateRange({ start: '2026-03-31', end: '2026-07-03' }, '2026-07-14').valid, false);
const validSearch = selectRecoveryDateRange({ start: '2026-04-01', end: '2026-07-03' }, '2026-07-14');
assert.equal(validSearch.valid, true);
if (validSearch.valid) assert.deepEqual([validSearch.startDate, validSearch.endDate], ['2026-04-01', '2026-07-03']);

assert.equal(canReadProductionRecovery('none'), false);
assert.equal(canReadProductionRecovery('view'), true);
assert.equal(canReadProductionRecovery('use'), true);
assert.equal(canMoveProductionRecovery('none'), false);
assert.equal(canMoveProductionRecovery('view'), false);
assert.equal(canMoveProductionRecovery('use'), true);
for (const unrelatedPermission of ['manager', 'calendar', 'production_checkpoints']) {
  assert.equal(canReadProductionRecovery('none'), false, `${unrelatedPermission} provides no fallback`);
  assert.equal(canMoveProductionRecovery('none'), false, `${unrelatedPermission} provides no fallback`);
}

let uuidCount = 0;
const createUuid = () => `00000000-0000-4000-8000-${String(++uuidCount).padStart(12, '0')}`;
const first = commandForRecoveryMoveAttempt({ commandId: null, fingerprint: null }, 'booking-1|2026-07-11', createUuid);
const retry = commandForRecoveryMoveAttempt(first, 'booking-1|2026-07-11', createUuid);
const laterAttempt = commandForRecoveryMoveAttempt(first, 'booking-2|2026-07-10', createUuid);
assert.equal(first.commandId, retry.commandId, 'identical retry retains command UUID');
assert.notEqual(first.commandId, laterAttempt.commandId, 'a different intended move gets one new command UUID');
assert.equal(uuidCount, 2);
assert.equal(retainCommandForRetry('unavailable'), true);
assert.equal(retainCommandForRetry('malformed_response'), true);
assert.equal(retainCommandForRetry('stale_booking'), false);
assert.equal(canSubmitRecoveryMove(false, false), false, 'acknowledgement is initially unchecked');
assert.equal(canSubmitRecoveryMove(true, true), false, 'duplicate submission is prevented while pending');
assert.equal(canSubmitRecoveryMove(true, false), true, 'capacity context does not block an acknowledged move');

const known: TodayProductionSummary = {
  productionDate: '2026-07-14', plannedHours: 15, availableHours: 16,
  remainingHours: 1, overloadHours: 0, capacityKnown: true, isClosed: false,
};
assert.match(projectedCapacityMessage(known, 3.5).message, /2\.50 hours over capacity/);
assert.equal(projectedCapacityMessage({ ...known, capacityKnown: false, availableHours: null }, 3.5).message, "Today’s capacity is unavailable. The move is still allowed.");
assert.match(projectedCapacityMessage({ ...known, isClosed: true }, 3.5).message, /still allowed/);
assert.equal(projectedCapacityMessage(known, 0.5).tone, 'neutral');

assert.equal(WHOLE_JOB_ACKNOWLEDGEMENT, 'The whole job was not started.');
assert.match(PARTLY_COMPLETED_GUIDANCE, /remaining hours in Actual carry/);
assert.match(PRODUCTION_RECOVERY_CARRY_WARNING, /Do not include this moved job's hours in Actual carry/);
assert.match(recoveryMoveMessage('stale_booking'), /changed since the page was loaded/);
assert.match(recoveryMoveMessage('command_uuid_collision'), /safely retried/);
assert.doesNotMatch(recoveryMoveMessage('unavailable'), /postgres|supabase|rpc|uuid/i);

console.log('Phase 2F-D3 production recovery page contract tests passed');
