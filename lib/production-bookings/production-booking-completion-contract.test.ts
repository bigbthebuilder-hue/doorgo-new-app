import { strict as assert } from 'node:assert';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import {
  createProductionBookingCompletionExecutors,
  executeCompleteProductionBooking,
  executeReopenProductionBooking,
  getProductionCompletionAuthorizationError,
  mapProductionBookingCompletionError,
  normalizeProductionBookingCompletionResponse,
  validateCompleteProductionBookingRequest,
  validateReopenProductionBookingRequest,
} from './production-booking-completion-contract';

const commandId = '11111111-1111-4111-8111-111111111111';
const bookingId = 'booking-1';
const productionDate = '2026-07-17';
const completedAt = '2026-07-16T09:30:00-07:00';
const occurredAt = '2026-07-16T10:00:00-07:00';
const completeRequest = { commandId, bookingId, expectedProductionDate: productionDate };
const reopenRequest = {
  commandId,
  bookingId,
  expectedProductionDate: productionDate,
  expectedCompletedAt: completedAt,
  reason: 'Work order correction',
};

const access = (
  level?: 'none' | 'view' | 'use',
  manager = false,
  extras: Array<{ permission_key: string; access_level: 'use' }> = [],
) => resolveCurrentDoorGoAccess({
  user: { id: '00000000-0000-4000-8000-000000000001' },
  profile: {
    user_id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Test',
    active: true,
    is_manager: manager,
    company_location: null,
    must_change_password: false,
  },
  permissionRows: [
    ...(level ? [{ permission_key: 'production', access_level: level }] : []),
    ...extras,
  ],
});

async function main() {
  assert.equal(getProductionCompletionAuthorizationError(access()), 'permission_required');
  assert.equal(getProductionCompletionAuthorizationError(access('none')), 'permission_required');
  assert.equal(getProductionCompletionAuthorizationError(access('view')), 'permission_required');
  assert.equal(getProductionCompletionAuthorizationError(access('use')), null);
  assert.equal(getProductionCompletionAuthorizationError(access(undefined, true)), 'permission_required');
  assert.equal(getProductionCompletionAuthorizationError(access(undefined, false, [
    { permission_key: 'calendar', access_level: 'use' },
    { permission_key: 'production_checkpoints', access_level: 'use' },
  ])), 'permission_required');
  assert.equal(
    getProductionCompletionAuthorizationError(resolveCurrentDoorGoAccess({ user: null, profile: null })),
    'authentication_required',
  );
  assert.equal(getProductionCompletionAuthorizationError(resolveCurrentDoorGoAccess({
    user: { id: '00000000-0000-4000-8000-000000000001' },
    profile: {
      user_id: '00000000-0000-4000-8000-000000000001',
      display_name: 'Test',
      active: false,
      is_manager: false,
      company_location: null,
      must_change_password: false,
    },
    permissionRows: [{ permission_key: 'production', access_level: 'use' }],
  })), 'active_profile_required');

  assert.equal(validateCompleteProductionBookingRequest(completeRequest).ok, true);
  assert.deepEqual(
    validateCompleteProductionBookingRequest({ ...completeRequest, bookingId: ' bad ' }),
    { ok: false, code: 'invalid_booking_id' },
  );
  assert.deepEqual(
    validateCompleteProductionBookingRequest({ ...completeRequest, reason: 'forbidden' }),
    { ok: false, code: 'invalid_request' },
  );
  assert.deepEqual(
    validateCompleteProductionBookingRequest({ ...completeRequest, expectedProductionDate: '2026-02-30' }),
    { ok: false, code: 'invalid_request' },
  );

  const trimmed = validateReopenProductionBookingRequest({ ...reopenRequest, reason: '  corrected work order  ' });
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) assert.equal(trimmed.value.reason, 'corrected work order');
  assert.deepEqual(
    validateReopenProductionBookingRequest({ ...reopenRequest, reason: '' }),
    { ok: false, code: 'reason_required' },
  );
  assert.deepEqual(
    validateReopenProductionBookingRequest({ ...reopenRequest, reason: '   ' }),
    { ok: false, code: 'reason_required' },
  );
  assert.deepEqual(
    validateReopenProductionBookingRequest({ ...reopenRequest, reason: 'x'.repeat(501) }),
    { ok: false, code: 'invalid_reason' },
  );
  assert.equal(validateReopenProductionBookingRequest({ ...reopenRequest, reason: 'x'.repeat(500) }).ok, true);
  assert.deepEqual(
    validateReopenProductionBookingRequest({ ...reopenRequest, expectedCompletedAt: '2026-07-16T09:30:00' }),
    { ok: false, code: 'invalid_request' },
  );
  assert.deepEqual(
    validateReopenProductionBookingRequest({ ...reopenRequest, expectedCompletedAt: '2026-02-30T09:30:00Z' }),
    { ok: false, code: 'invalid_request' },
  );
  assert.deepEqual(
    validateReopenProductionBookingRequest({ ...reopenRequest, expectedCompletedAt: '2026-07-16T25:30:00Z' }),
    { ok: false, code: 'invalid_request' },
  );

  let completeParameters: Record<string, unknown> | null = null;
  const complete = await executeCompleteProductionBooking(completeRequest, async (name, parameters) => {
    assert.equal(name, 'complete_production_booking');
    completeParameters = parameters;
    return {
      data: [{
        event_id: '22222222-2222-4222-8222-222222222222',
        booking_id: bookingId,
        production_date: productionDate,
        previous_completed_at: null,
        resulting_completed_at: occurredAt,
        occurred_at: occurredAt,
        action_type: 'completed',
        status: 'completed',
      }],
      error: null,
    };
  });
  assert.equal(complete.ok, true, 'ready booking completes');
  assert.deepEqual(completeParameters, {
    p_command_id: commandId,
    p_booking_id: bookingId,
    p_expected_production_date: productionDate,
  });
  if (complete.ok) {
    assert.equal(complete.event.productionDate, productionDate, 'completed booking remains on the same date');
    assert.equal(complete.event.resultingCompletedAt, occurredAt, 'server completion timestamp is returned');
  }

  let reopenParameters: Record<string, unknown> | null = null;
  const reopen = await executeReopenProductionBooking({ ...reopenRequest, reason: '  Work order correction  ' }, async (name, parameters) => {
    assert.equal(name, 'reopen_production_booking');
    reopenParameters = parameters;
    return {
      data: [{
        event_id: '33333333-3333-4333-8333-333333333333',
        booking_id: bookingId,
        production_date: productionDate,
        previous_completed_at: completedAt,
        resulting_completed_at: null,
        occurred_at: occurredAt,
        action_type: 'reopened',
        status: 'reopened',
      }],
      error: null,
    };
  });
  assert.equal(reopen.ok, true, 'completed booking reopens');
  assert.deepEqual(reopenParameters, {
    p_command_id: commandId,
    p_booking_id: bookingId,
    p_expected_production_date: productionDate,
    p_expected_completed_at: completedAt,
    p_reason: 'Work order correction',
  });
  if (reopen.ok) assert.equal(reopen.event.resultingCompletedAt, null);

  const stableCompletedRetry = await executeCompleteProductionBooking(completeRequest, async () => ({
    data: [{
      event_id: '22222222-2222-4222-8222-222222222222',
      booking_id: bookingId,
      production_date: productionDate,
      previous_completed_at: null,
      resulting_completed_at: occurredAt,
      occurred_at: occurredAt,
      action_type: 'completed',
      status: 'completed',
    }],
    error: null,
  }));
  assert.deepEqual(stableCompletedRetry, complete, 'exact retry returns the original stored event after later state changes');

  for (const changedRequest of [
    { ...completeRequest, bookingId: 'booking-2' },
    { ...completeRequest, expectedProductionDate: '2026-07-18' },
  ]) {
    const collision = await executeCompleteProductionBooking(changedRequest, async () => ({
      data: null,
      error: { message: 'production_booking_completion.command_uuid_collision' },
    }));
    assert.equal(collision.ok, false, 'changed complete request collides');
    if (!collision.ok) assert.equal(collision.code, 'command_uuid_collision');
  }
  for (const changedRequest of [
    { ...reopenRequest, expectedCompletedAt: '2026-07-16T09:31:00-07:00' },
    { ...reopenRequest, reason: 'Different reason' },
  ]) {
    const collision = await executeReopenProductionBooking(changedRequest, async () => ({
      data: null,
      error: { message: 'production_booking_completion.command_uuid_collision' },
    }));
    assert.equal(collision.ok, false, 'changed reopen request collides');
    if (!collision.ok) assert.equal(collision.code, 'command_uuid_collision');
  }
  const completeUuidUsedForReopen = await executeReopenProductionBooking(reopenRequest, async () => ({
    data: null,
    error: { message: 'production_booking_completion.command_uuid_collision' },
  }));
  assert.equal(completeUuidUsedForReopen.ok, false, 'complete UUID used for reopen collides');
  const reopenUuidUsedForComplete = await executeCompleteProductionBooking(completeRequest, async () => ({
    data: null,
    error: { message: 'production_booking_completion.command_uuid_collision' },
  }));
  assert.equal(reopenUuidUsedForComplete.ok, false, 'reopen UUID used for complete collides');

  for (const code of [
    'authentication_required',
    'active_profile_required',
    'permission_required',
    'invalid_request',
    'invalid_booking_id',
    'command_uuid_collision',
    'not_found',
    'ineligible_booking',
    'stale_booking',
    'already_completed',
    'not_completed',
    'reason_required',
    'invalid_reason',
  ] as const) {
    const mapped = mapProductionBookingCompletionError({ message: `production_booking_completion.${code}` });
    assert.equal(mapped.ok, false);
    if (!mapped.ok) assert.equal(mapped.code, code);
  }
  const raw = mapProductionBookingCompletionError({ message: 'secret SQL details' });
  assert.equal(raw.ok, false);
  if (!raw.ok) assert.equal(raw.code, 'unavailable');
  const nearMatch = mapProductionBookingCompletionError({
    message: 'production_booking_completion.stale_booking with raw SQL',
  });
  assert.equal(nearMatch.ok, false);
  if (!nearMatch.ok) assert.equal(nearMatch.code, 'unavailable');

  assert.equal(normalizeProductionBookingCompletionResponse([{ event_id: 'bad' }]), null);
  assert.equal(normalizeProductionBookingCompletionResponse([{
    event_id: '22222222-2222-4222-8222-222222222222',
    booking_id: bookingId,
    production_date: productionDate,
    previous_completed_at: null,
    resulting_completed_at: occurredAt,
    occurred_at: '2026-07-16T10:00:00',
    action_type: 'completed',
    status: 'completed',
  }]), null, 'timestamps require an explicit timezone');
  assert.equal(normalizeProductionBookingCompletionResponse([{
    event_id: '22222222-2222-4222-8222-222222222222',
    booking_id: bookingId,
    production_date: productionDate,
    previous_completed_at: null,
    resulting_completed_at: null,
    occurred_at: occurredAt,
    action_type: 'completed',
    status: 'completed',
  }]), null, 'completed response invariants are enforced');

  const executors = createProductionBookingCompletionExecutors(async () => {
    throw new Error('secret service failure');
  });
  const unavailable = await executors.complete(completeRequest);
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.code, 'unavailable');

  console.log('Phase 2F-F1 production completion contract tests passed');
}

void main();
