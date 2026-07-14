import assert from 'node:assert/strict';
import {
  canMoveProductionRecovery,
  canReadProductionRecovery,
  createProductionBookingMoveExecutor,
  executeProductionBookingMove,
  mapProductionBookingMoveError,
  normalizeRecoveryBookingRows,
  PRODUCTION_BOOKING_MOVE_RPC,
  PRODUCTION_RECOVERY_CARRY_WARNING,
  PRODUCTION_RECOVERY_REVALIDATE_PATHS,
  validateMoveProductionBookingRequest,
} from './production-booking-move-contract';

const commandId = '11111111-1111-4111-8111-111111111111';
const moveId = '22222222-2222-4222-8222-222222222222';
const request = {
  commandId,
  bookingId: 'booking-1',
  expectedProductionDate: '2026-07-13',
  whollyUnstartedAcknowledged: true,
};
const response = {
  move_id: moveId,
  booking_id: 'booking-1',
  previous_production_date: '2026-07-13',
  new_production_date: '2026-07-14',
  shop_hours: '8.00',
  moved_at: '2026-07-14T15:00:00Z',
  status: 'moved',
  actor_user_id: '33333333-3333-4333-8333-333333333333',
};
const recoveryRow = {
  booking_id: 'booking-1',
  production_date: '2026-07-13',
  shop_hours: '8.00',
  display_title: 'Recognizable production booking',
  job_id: null,
  sales_order: null,
  booking_kind: 'production',
  schedule_status: 'confirmed',
  booking_origin: 'doorgo',
  explicitly_completed: false,
  locked: false,
  legacy_calendar_linked: true,
};

assert.equal(canReadProductionRecovery('none'), false);
assert.equal(canReadProductionRecovery('view'), true);
assert.equal(canReadProductionRecovery('use'), true);
assert.equal(canMoveProductionRecovery('none'), false);
assert.equal(canMoveProductionRecovery('view'), false);
assert.equal(canMoveProductionRecovery('use'), true);

assert.equal(validateMoveProductionBookingRequest(request, '2026-07-14').ok, true);
assert.equal(validateMoveProductionBookingRequest({ ...request, bookingId: '' }, '2026-07-14').ok, false);
assert.equal(validateMoveProductionBookingRequest({ ...request, expectedProductionDate: '2026-02-30' }, '2026-07-14').ok, false);
assert.equal(validateMoveProductionBookingRequest({ ...request, expectedProductionDate: '2026-07-14' }, '2026-07-14').ok, false);
assert.equal(validateMoveProductionBookingRequest({ ...request, expectedProductionDate: '2026-07-15' }, '2026-07-14').ok, false);
assert.equal(validateMoveProductionBookingRequest({ ...request, whollyUnstartedAcknowledged: false }, '2026-07-14').ok, false);
assert.equal(validateMoveProductionBookingRequest({ ...request, calendarEventId: 'forbidden' }, '2026-07-14').ok, false);

assert.equal(normalizeRecoveryBookingRows([recoveryRow])?.length, 1);
assert.equal(normalizeRecoveryBookingRows([{ ...recoveryRow, booking_kind: 'placeholder' }]), null);
assert.equal(normalizeRecoveryBookingRows([{ ...recoveryRow, explicitly_completed: true }]), null);
assert.equal(normalizeRecoveryBookingRows([{ ...recoveryRow, locked: true }]), null);

async function main() {
let called: { name: string; parameters: Record<string, unknown> } | null = null;
const success = await executeProductionBookingMove(request, {
  today: '2026-07-14',
  rpc: async (name, parameters) => {
    called = { name, parameters };
    return { data: response, error: null };
  },
});
assert.equal(success.ok, true);
if (success.ok) assert.equal('actorUserId' in success.move, false);
assert.deepEqual(called, {
  name: PRODUCTION_BOOKING_MOVE_RPC,
  parameters: {
    p_command_id: commandId,
    p_booking_id: 'booking-1',
    p_expected_production_date: '2026-07-13',
    p_wholly_unstarted_acknowledged: true,
  },
});

const retry = await executeProductionBookingMove(request, {
  today: '2026-07-14',
  rpc: async () => ({ data: response, error: null }),
});
assert.deepEqual(retry, success, 'an idempotent database retry maps to the original success');

const wrongTargetDate = await executeProductionBookingMove(request, {
  today: '2026-07-14',
  rpc: async () => ({
    data: { ...response, new_production_date: '2026-07-15' },
    error: null,
  }),
});
assert.equal(wrongTargetDate.ok, false);
if (!wrongTargetDate.ok) assert.equal(wrongTargetDate.code, 'malformed_response');

for (const code of ['stale_booking', 'already_moved', 'ineligible_booking', 'command_uuid_collision'] as const) {
  const result = mapProductionBookingMoveError({ message: `production_booking_move.${code}` });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, code);
}
assert.equal(mapProductionBookingMoveError({ message: 'secret SQL details' }).ok, false);

const sanitized = await createProductionBookingMoveExecutor(async () => {
  throw new Error('secret service failure');
})(request);
assert.deepEqual(sanitized, {
  ok: false,
  code: 'unavailable',
  message: 'The production booking could not be moved. Please try again.',
});
assert.doesNotMatch(JSON.stringify(sanitized), /secret|sql|calendar/i);

assert.equal(
  PRODUCTION_RECOVERY_CARRY_WARNING,
  "Do not include this moved job's hours in Actual carry.",
);
assert.deepEqual(PRODUCTION_RECOVERY_REVALIDATE_PATHS, [
  '/production-board',
  '/production-checkpoints',
  '/production-recovery',
]);

console.log('Phase 2F-D2 production booking move contract tests passed');
}

void main();
