import { strict as assert } from 'node:assert';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import {
  canRescheduleProductionBooking,
  createProductionBookingRescheduleExecutor,
  executeProductionBookingReschedule,
  mapProductionBookingRescheduleError,
  normalizeProductionBookingRescheduleResponse,
  validateProductionBookingRescheduleRequest,
} from './production-booking-reschedule-contract';

const today = '2026-07-15';
const base = {
  commandId: '11111111-1111-4111-8111-111111111111',
  bookingId: 'booking-1',
  expectedProductionDate: '2026-07-16',
  destinationProductionDate: '2026-07-17',
  whollyUnstartedAcknowledged: false,
  backdateReason: null,
  closedDateOverrideAcknowledged: false,
};

const access = (level?: 'none' | 'view' | 'use', manager = false, extras: Array<{ permission_key: string; access_level: 'use' }> = []) =>
  resolveCurrentDoorGoAccess({
    user: { id: '00000000-0000-4000-8000-000000000001' },
    profile: { user_id: '00000000-0000-4000-8000-000000000001', display_name: 'Test', active: true, is_manager: manager, company_location: null, must_change_password: false },
    permissionRows: [...(level ? [{ permission_key: 'production', access_level: level }] : []), ...extras],
  });

async function main() {
assert.equal(canRescheduleProductionBooking(access()), false);
assert.equal(canRescheduleProductionBooking(access('none')), false);
assert.equal(canRescheduleProductionBooking(access('view')), false);
assert.equal(canRescheduleProductionBooking(access('use')), true);
assert.equal(canRescheduleProductionBooking(access(undefined, true)), false);
assert.equal(canRescheduleProductionBooking(access(undefined, false, [
  { permission_key: 'calendar', access_level: 'use' },
  { permission_key: 'production_checkpoints', access_level: 'use' },
])), false);
assert.equal(canRescheduleProductionBooking(resolveCurrentDoorGoAccess({ user: null, profile: null })), false);
const inactive = resolveCurrentDoorGoAccess({
  user: { id: '00000000-0000-4000-8000-000000000001' },
  profile: { user_id: '00000000-0000-4000-8000-000000000001', display_name: 'Test', active: false, is_manager: false, company_location: null, must_change_password: false },
  permissionRows: [{ permission_key: 'production', access_level: 'use' }],
});
assert.equal(canRescheduleProductionBooking(inactive), false);

assert.equal(validateProductionBookingRescheduleRequest(null, today).ok, false);
assert.deepEqual(validateProductionBookingRescheduleRequest({ ...base, bookingId: ' bad ' }, today), { ok: false, code: 'invalid_booking_id' });
assert.deepEqual(validateProductionBookingRescheduleRequest({ ...base, destinationProductionDate: base.expectedProductionDate }, today), { ok: false, code: 'no_change' });
assert.equal(validateProductionBookingRescheduleRequest(base, today).ok, true); // future to future
assert.equal(validateProductionBookingRescheduleRequest({ ...base, destinationProductionDate: today }, today).ok, true); // future to today
assert.equal(validateProductionBookingRescheduleRequest({ ...base, expectedProductionDate: today }, today).ok, true); // database enforces acknowledgement
assert.equal(validateProductionBookingRescheduleRequest({ ...base, expectedProductionDate: '2026-07-14', destinationProductionDate: today }, today).ok, true);
assert.equal(validateProductionBookingRescheduleRequest({ ...base, expectedProductionDate: '2026-07-14', whollyUnstartedAcknowledged: true }, today).ok, true);
assert.equal(validateProductionBookingRescheduleRequest({ ...base, destinationProductionDate: '2026-07-14' }, today).ok, true); // database enforces backdate reason
const trimmedBackdate = validateProductionBookingRescheduleRequest({ ...base, destinationProductionDate: '2026-07-14', backdateReason: '  correction  ' }, today);
assert.equal(trimmedBackdate.ok, true);
if (trimmedBackdate.ok) assert.equal(trimmedBackdate.value.backdateReason, 'correction');
assert.equal(validateProductionBookingRescheduleRequest({ ...base, destinationProductionDate: '2026-07-14', backdateReason: '   ' }, today).ok, true);
assert.deepEqual(validateProductionBookingRescheduleRequest({ ...base, destinationProductionDate: '2026-07-14', backdateReason: 'x'.repeat(501) }, today), { ok: false, code: 'invalid_backdate_reason' });
assert.equal(validateProductionBookingRescheduleRequest({ ...base, backdateReason: 'not needed' }, today).ok, true); // database classifies first execution
assert.deepEqual(validateProductionBookingRescheduleRequest({ ...base, actorUserId: 'forbidden' }, today), { ok: false, code: 'invalid_request' });
assert.equal(validateProductionBookingRescheduleRequest({ ...base, expectedProductionDate: today, destinationProductionDate: '2026-07-14', backdateReason: 'reason' }, today).ok, true);
assert.equal(validateProductionBookingRescheduleRequest({ ...base, expectedProductionDate: today, destinationProductionDate: '2026-07-14', whollyUnstartedAcknowledged: true, backdateReason: 'reason' }, today).ok, true);

let rpcParameters: Record<string, unknown> | null = null;
const success = await executeProductionBookingReschedule(base, {
  today,
  rpc: async (name, parameters) => {
    assert.equal(name, 'reschedule_production_booking');
    rpcParameters = parameters;
    return { data: [{ move_id: '22222222-2222-4222-8222-222222222222', booking_id: 'booking-1', previous_production_date: '2026-07-16', new_production_date: '2026-07-17', shop_hours: '12.50', moved_at: '2026-07-15T12:00:00-07:00', action_type: 'reschedule', destination_was_closed: false, status: 'moved' }], error: null };
  },
});
assert.equal(success.ok, true);
assert.deepEqual(rpcParameters, {
  p_command_id: base.commandId, p_booking_id: base.bookingId,
  p_expected_production_date: base.expectedProductionDate,
  p_destination_production_date: base.destinationProductionDate,
  p_wholly_unstarted_acknowledged: false, p_backdate_reason: null,
  p_closed_date_override_acknowledged: false,
});
assert.equal(normalizeProductionBookingRescheduleResponse([{ move_id: 'bad' }]), null);
assert.equal(normalizeProductionBookingRescheduleResponse([{ move_id: '22222222-2222-4222-8222-222222222222', booking_id: 'booking-1', previous_production_date: '2026-07-16', new_production_date: '2026-07-17', shop_hours: '1.234', moved_at: '2026-07-15T12:00:00Z', action_type: 'reschedule', destination_was_closed: false, status: 'moved' }]), null);

const storedOpenMove = [{ move_id: '33333333-3333-4333-8333-333333333333', booking_id: 'booking-1', previous_production_date: '2026-07-16', new_production_date: '2026-07-17', shop_hours: '12.50', moved_at: '2026-07-15T12:00:00-07:00', action_type: 'reschedule', destination_was_closed: false, status: 'moved' }];
const rolloverRetry = await executeProductionBookingReschedule(base, {
  today: '2026-07-18',
  rpc: async () => ({ data: storedOpenMove, error: null }),
});
assert.equal(rolloverRetry.ok, true, 'completed retry survives Vancouver rollover and backdate reclassification');
if (rolloverRetry.ok) {
  assert.equal(rolloverRetry.move.actionType, 'reschedule', 'stored action type is returned');
  assert.equal(rolloverRetry.move.destinationWasClosed, false, 'stored open snapshot is returned after open-to-closed change');
}
const storedClosedMove = [{ ...storedOpenMove[0], move_id: '44444444-4444-4444-8444-444444444444', destination_was_closed: true }];
const reopenedRetry = await executeProductionBookingReschedule({ ...base, closedDateOverrideAcknowledged: true }, {
  today,
  rpc: async () => ({ data: storedClosedMove, error: null }),
});
assert.equal(reopenedRetry.ok, true, 'completed retry survives closed-to-open change');
if (reopenedRetry.ok) assert.equal(reopenedRetry.move.destinationWasClosed, true, 'original closed snapshot is returned');
const acknowledgementCollision = await executeProductionBookingReschedule({ ...base, closedDateOverrideAcknowledged: true }, {
  today,
  rpc: async () => ({ data: null, error: { message: 'production_booking_reschedule.command_uuid_collision' } }),
});
assert.equal(acknowledgementCollision.ok, false, 'materially different acknowledgement collides');
if (!acknowledgementCollision.ok) assert.equal(acknowledgementCollision.code, 'command_uuid_collision');
const reasonCollision = await executeProductionBookingReschedule({ ...base, backdateReason: ' different request ' }, {
  today,
  rpc: async (_name, parameters) => {
    assert.equal(parameters.p_backdate_reason, 'different request', 'retry reason identity is normalized');
    return { data: null, error: { message: 'production_booking_reschedule.command_uuid_collision' } };
  },
});
assert.equal(reasonCollision.ok, false, 'materially different normalized reason collides');
if (!reasonCollision.ok) assert.equal(reasonCollision.code, 'command_uuid_collision');

for (const code of ['authentication_required', 'active_profile_required', 'permission_required', 'invalid_request', 'invalid_booking_id', 'no_change', 'stale_booking', 'acknowledgement_required', 'backdate_reason_required', 'invalid_backdate_reason', 'closed_date_override_required', 'command_uuid_collision', 'not_found', 'ineligible_booking'] as const) {
  const mapped = mapProductionBookingRescheduleError({ message: `production_booking_reschedule.${code}` });
  assert.equal(mapped.ok, false);
  if (!mapped.ok) assert.equal(mapped.code, code);
}
const raw = mapProductionBookingRescheduleError({ message: 'secret SQL details' });
assert.equal(raw.ok, false);
if (!raw.ok) assert.equal(raw.code, 'unavailable');
const sanitized = await createProductionBookingRescheduleExecutor(async () => { throw new Error('secret service failure'); }, () => today)(base);
assert.equal(sanitized.ok, false);
if (!sanitized.ok) assert.equal(sanitized.code, 'unavailable');

console.log('Phase 2F-E2B production booking reschedule contract tests passed');
}

void main();
