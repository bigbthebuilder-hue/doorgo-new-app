import { strict as assert } from 'node:assert';
import type { ProductionBookingCompletionResult } from '../production-bookings/production-booking-completion-contract';
import type { ProductionBoardCard } from '../production-board/types';
import {
  applyProductionScheduleCompletionOutcome,
  beginProductionScheduleCompletionAttempt,
  getProductionScheduleCompletionMaterialKey,
  isSameProductionScheduleCompletionAttempt,
  submitProductionScheduleCompletionAttempt,
  updateProductionScheduleReopenReason,
  type ProductionScheduleCompletionAttempt,
  type ProductionScheduleCompletionSubmissionOutcome,
} from './completion-ui-contract';

const ready: ProductionBoardCard = {
  bookingId: 'booking-a',
  type: 'doorgo_linked',
  typeLabel: 'DoorGo-linked',
  productionDate: '2026-07-16',
  title: 'Lifecycle booking',
  customer: null,
  jobId: null,
  calendarId: null,
  calendarEventId: null,
  shopHours: 4,
  shopHoursKnown: true,
  salesperson: null,
  source: null,
  sourceSystem: null,
  bookingKind: 'production',
  locked: false,
  completedAt: null,
};
const exactCompletedAt = '2026-07-16T18:22:31.123456+00:00';
const completed: ProductionBoardCard = { ...ready, completedAt: exactCompletedAt };
const success = (action: 'completed' | 'reopened'): ProductionBookingCompletionResult => ({
  ok: true,
  event: {
    eventId: '99999999-9999-4999-8999-999999999999',
    bookingId: ready.bookingId,
    productionDate: ready.productionDate,
    previousCompletedAt: action === 'completed' ? null : exactCompletedAt,
    resultingCompletedAt: action === 'completed' ? exactCompletedAt : null,
    occurredAt: '2026-07-16T18:22:31.123456+00:00',
    actionType: action,
    status: action,
  },
});

function effects() {
  const state = {
    closes: [] as boolean[],
    retries: [] as string[],
    announcements: [] as Array<{ tone: 'success' | 'error'; message: string }>,
    refreshes: 0,
  };
  return {
    state,
    handlers: {
      close: (returnFocus: boolean) => state.closes.push(returnFocus),
      retry: (message: string) => state.retries.push(message),
      announce: (tone: 'success' | 'error', message: string) => {
        state.announcements.push({ tone, message });
      },
      refresh: () => { state.refreshes += 1; },
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

let uuidSequence = 0;
const nextUuid = () => {
  uuidSequence += 1;
  return `00000000-0000-4000-8000-${uuidSequence.toString().padStart(12, '0')}`;
};

async function main() {
  const completeAttempt = beginProductionScheduleCompletionAttempt(ready, nextUuid);
  assert.equal(uuidSequence, 1, 'Opening one Complete attempt creates one command UUID');
  assert.equal(completeAttempt.action, 'complete');
  let currentAttempt: ProductionScheduleCompletionAttempt | null = completeAttempt;
  const guard = { current: null as string | null };
  const completeRequests: unknown[] = [];
  const completeOutcome = await submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard,
    isCurrentAttempt: (captured) => isSameProductionScheduleCompletionAttempt(currentAttempt, captured),
    complete: async (request) => { completeRequests.push(request); return success('completed'); },
    reopen: async () => { throw new Error('Reopen must not run for Complete'); },
  });
  assert.deepEqual(completeRequests, [{
    commandId: completeAttempt.commandId,
    bookingId: ready.bookingId,
    expectedProductionDate: ready.productionDate,
  }]);
  assert.deepEqual(Object.keys(completeRequests[0] as object).sort(), [
    'bookingId', 'commandId', 'expectedProductionDate',
  ]);
  assert.equal(guard.current, null);
  const completeEffects = effects();
  applyProductionScheduleCompletionOutcome(completeOutcome, completeEffects.handlers);
  assert.deepEqual(completeEffects.state.closes, [false]);
  assert.deepEqual(completeEffects.state.announcements, [{
    tone: 'success',
    message: 'Production booking marked complete.',
  }]);
  assert.equal(completeEffects.state.refreshes, 1);
  assert.equal(ready.completedAt, null, 'Success handling does not mutate local completion state');

  const duplicateGate = deferred<ProductionBookingCompletionResult>();
  let duplicateCalls = 0;
  const duplicateGuard = { current: null as string | null };
  const firstSubmission = submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard: duplicateGuard,
    isCurrentAttempt: () => true,
    complete: async () => { duplicateCalls += 1; return duplicateGate.promise; },
    reopen: async () => success('reopened'),
  });
  const duplicateSubmission = await submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard: duplicateGuard,
    isCurrentAttempt: () => true,
    complete: async () => { duplicateCalls += 1; return success('completed'); },
    reopen: async () => success('reopened'),
  });
  assert.deepEqual(duplicateSubmission, { kind: 'ignored' });
  assert.equal(duplicateCalls, 1);
  duplicateGate.resolve(success('completed'));
  await firstSubmission;
  assert.equal(duplicateGuard.current, null);

  const thrownGuard = { current: null as string | null };
  const thrown = await submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard: thrownGuard,
    isCurrentAttempt: () => true,
    complete: async () => { throw new Error('transport detail must be sanitized'); },
    reopen: async () => success('reopened'),
  });
  assert.equal(thrownGuard.current, null);
  assert.equal(thrown.kind, 'failure');
  if (thrown.kind === 'failure') {
    assert.equal(thrown.presentation.message, 'The production booking could not be updated. Please try again.');
  }

  const staleGuard = { current: null as string | null };
  const staleOutcome = await submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard: staleGuard,
    isCurrentAttempt: () => true,
    complete: async () => ({
      ok: false,
      code: 'stale_booking',
      message: 'Raw database detail must not render',
    }),
    reopen: async () => success('reopened'),
  });
  assert.equal(staleGuard.current, null, 'Resolved failures release the synchronous guard');
  const staleEffects = effects();
  applyProductionScheduleCompletionOutcome(staleOutcome, staleEffects.handlers);
  assert.deepEqual(staleEffects.state.closes, [true]);
  assert.equal(staleEffects.state.refreshes, 1);
  assert.deepEqual(staleEffects.state.announcements, [{
    tone: 'error',
    message: 'This booking changed since the schedule loaded. The schedule has been refreshed.',
  }]);

  const oldResponse = deferred<ProductionBookingCompletionResult>();
  currentAttempt = completeAttempt;
  const oldSubmission = submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard: { current: null },
    isCurrentAttempt: (captured) => isSameProductionScheduleCompletionAttempt(currentAttempt, captured),
    complete: async () => oldResponse.promise,
    reopen: async () => success('reopened'),
  });
  currentAttempt = beginProductionScheduleCompletionAttempt(
    { ...ready, bookingId: 'booking-b' },
    nextUuid,
  );
  oldResponse.resolve(success('completed'));
  const superseded = await oldSubmission;
  assert.deepEqual(superseded, { kind: 'superseded' });
  const supersededEffects = effects();
  applyProductionScheduleCompletionOutcome(superseded, supersededEffects.handlers);
  assert.deepEqual(supersededEffects.state, {
    closes: [], retries: [], announcements: [], refreshes: 0,
  });

  const reopenAttempt = beginProductionScheduleCompletionAttempt(completed, nextUuid);
  const reasonAttempt = updateProductionScheduleReopenReason(
    reopenAttempt,
    '  Audit correction  ',
    nextUuid,
  );
  const equivalentReason = updateProductionScheduleReopenReason(
    { ...reasonAttempt, failed: true },
    'Audit correction ',
    nextUuid,
  );
  assert.equal(equivalentReason.commandId, reasonAttempt.commandId);
  const changedReason = updateProductionScheduleReopenReason(
    reasonAttempt,
    'Different correction',
    nextUuid,
  );
  assert.notEqual(changedReason.commandId, reasonAttempt.commandId);
  assert.notEqual(
    getProductionScheduleCompletionMaterialKey(changedReason),
    getProductionScheduleCompletionMaterialKey(reasonAttempt),
  );

  const changedBooking = beginProductionScheduleCompletionAttempt(
    { ...completed, bookingId: 'booking-b' },
    nextUuid,
  );
  const changedDate = beginProductionScheduleCompletionAttempt(
    { ...completed, productionDate: '2026-07-17' },
    nextUuid,
  );
  const changedTimestamp = beginProductionScheduleCompletionAttempt(
    { ...completed, completedAt: '2026-07-16T18:22:31.654321+00:00' },
    nextUuid,
  );
  assert.notEqual(changedBooking.commandId, reopenAttempt.commandId);
  assert.notEqual(changedDate.commandId, reopenAttempt.commandId);
  assert.notEqual(changedTimestamp.commandId, reopenAttempt.commandId);
  assert.notEqual(getProductionScheduleCompletionMaterialKey(changedBooking), getProductionScheduleCompletionMaterialKey(reopenAttempt));
  assert.notEqual(getProductionScheduleCompletionMaterialKey(changedDate), getProductionScheduleCompletionMaterialKey(reopenAttempt));
  assert.notEqual(getProductionScheduleCompletionMaterialKey(changedTimestamp), getProductionScheduleCompletionMaterialKey(reopenAttempt));

  let reopenRequest: unknown = null;
  const reopenOutcome = await submitProductionScheduleCompletionAttempt({
    attempt: reasonAttempt,
    guard: { current: null },
    isCurrentAttempt: () => true,
    complete: async () => success('completed'),
    reopen: async (request) => { reopenRequest = request; return success('reopened'); },
  });
  assert.deepEqual(reopenRequest, {
    commandId: reasonAttempt.commandId,
    bookingId: completed.bookingId,
    expectedProductionDate: completed.productionDate,
    expectedCompletedAt: exactCompletedAt,
    reason: 'Audit correction',
  });
  assert.deepEqual(Object.keys(reopenRequest as object).sort(), [
    'bookingId', 'commandId', 'expectedCompletedAt', 'expectedProductionDate', 'reason',
  ]);
  const reopenEffects = effects();
  applyProductionScheduleCompletionOutcome(reopenOutcome, reopenEffects.handlers);
  assert.deepEqual(reopenEffects.state.closes, [false]);
  assert.deepEqual(reopenEffects.state.announcements, [{
    tone: 'success',
    message: 'Production booking reopened.',
  }]);
  assert.equal(reopenEffects.state.refreshes, 1);
  assert.equal(completed.completedAt, exactCompletedAt, 'Reopen success does not mutate local completion state');
  assert.equal(reasonAttempt.reason, '  Audit correction  ', 'Result handling does not mutate captured reason');

  const reopenDuplicateGate = deferred<ProductionBookingCompletionResult>();
  const reopenDuplicateGuard = { current: null as string | null };
  let reopenCalls = 0;
  const firstReopen = submitProductionScheduleCompletionAttempt({
    attempt: reasonAttempt,
    guard: reopenDuplicateGuard,
    isCurrentAttempt: () => true,
    complete: async () => success('completed'),
    reopen: async () => { reopenCalls += 1; return reopenDuplicateGate.promise; },
  });
  const duplicateReopen = await submitProductionScheduleCompletionAttempt({
    attempt: reasonAttempt,
    guard: reopenDuplicateGuard,
    isCurrentAttempt: () => true,
    complete: async () => success('completed'),
    reopen: async () => { reopenCalls += 1; return success('reopened'); },
  });
  assert.deepEqual(duplicateReopen, { kind: 'ignored' });
  assert.equal(reopenCalls, 1);
  reopenDuplicateGate.resolve(success('reopened'));
  await firstReopen;
  assert.equal(reopenDuplicateGuard.current, null);

  const reopenThrownGuard = { current: null as string | null };
  const reopenThrown = await submitProductionScheduleCompletionAttempt({
    attempt: reasonAttempt,
    guard: reopenThrownGuard,
    isCurrentAttempt: () => true,
    complete: async () => success('completed'),
    reopen: async () => { throw new Error('reopen transport detail'); },
  });
  assert.equal(reopenThrown.kind, 'failure');
  assert.equal(reopenThrownGuard.current, null);

  const oldReopenResponse = deferred<ProductionBookingCompletionResult>();
  currentAttempt = reasonAttempt;
  const oldReopen = submitProductionScheduleCompletionAttempt({
    attempt: reasonAttempt,
    guard: { current: null },
    isCurrentAttempt: (captured) => isSameProductionScheduleCompletionAttempt(currentAttempt, captured),
    complete: async () => success('completed'),
    reopen: async () => oldReopenResponse.promise,
  });
  currentAttempt = beginProductionScheduleCompletionAttempt(
    { ...completed, completedAt: '2026-07-16T18:22:31.654321+00:00' },
    nextUuid,
  );
  oldReopenResponse.resolve(success('reopened'));
  assert.deepEqual(await oldReopen, { kind: 'superseded' });

  const remountedResponse = deferred<ProductionBookingCompletionResult>();
  currentAttempt = completeAttempt;
  const remountedSubmission = submitProductionScheduleCompletionAttempt({
    attempt: completeAttempt,
    guard: { current: null },
    isCurrentAttempt: (captured) => isSameProductionScheduleCompletionAttempt(currentAttempt, captured),
    complete: async () => remountedResponse.promise,
    reopen: async () => success('reopened'),
  });
  currentAttempt = null;
  remountedResponse.resolve(success('completed'));
  assert.deepEqual(await remountedSubmission, { kind: 'superseded' });

  const rejected: ProductionScheduleCompletionSubmissionOutcome = await submitProductionScheduleCompletionAttempt({
    attempt: reasonAttempt,
    guard: { current: null },
    isCurrentAttempt: () => true,
    complete: async () => success('completed'),
    reopen: async () => ({ ok: false, code: 'not_completed', message: 'raw detail' }),
  });
  const rejectedEffects = effects();
  applyProductionScheduleCompletionOutcome(rejected, rejectedEffects.handlers);
  assert.deepEqual(rejectedEffects.state.closes, [true]);
  assert.equal(rejectedEffects.state.refreshes, 1);
  assert.doesNotMatch(JSON.stringify(rejectedEffects.state), /raw detail/);

  console.log('Phase 2F-F2 completion action lifecycle tests passed');
}

void main();
