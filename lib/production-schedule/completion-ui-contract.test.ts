import { strict as assert } from 'node:assert';
import type { ProductionBoardCard } from '../production-board/types';
import {
  buildCompleteProductionScheduleRequest,
  buildReopenProductionScheduleRequest,
  createProductionScheduleCompletionAttempt,
  getNormalizedProductionScheduleReopenReasonLength,
  getProductionScheduleCompletionMaterialKey,
  getProductionScheduleCompletionAction,
  getProductionScheduleCompletionBlockReason,
  getProductionScheduleCompletionFailurePresentation,
  normalizeProductionScheduleReopenReason,
  updateProductionScheduleReopenReason,
  validateProductionScheduleReopenReason,
} from './completion-ui-contract';

const ready: ProductionBoardCard = {
  bookingId: 'booking-1',
  type: 'doorgo_linked',
  typeLabel: 'DoorGo-linked',
  productionDate: '2026-07-16',
  title: 'Test booking',
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
const completed = { ...ready, completedAt: '2026-07-16T18:22:31.123456+00:00' };

assert.equal(getProductionScheduleCompletionAction(ready, true), 'complete');
assert.equal(getProductionScheduleCompletionAction(ready, false), null);
assert.equal(getProductionScheduleCompletionAction(completed, true), 'reopen');
assert.equal(getProductionScheduleCompletionAction(completed, false), null);
assert.equal(getProductionScheduleCompletionBlockReason(ready, false), null);
assert.match(getProductionScheduleCompletionBlockReason({ ...ready, locked: true }, false) ?? '', /locked/);
assert.match(getProductionScheduleCompletionBlockReason(ready, true) ?? '', /progress/);

const completeAttempt = createProductionScheduleCompletionAttempt(
  ready,
  '11111111-1111-4111-8111-111111111111',
);
assert.deepEqual(buildCompleteProductionScheduleRequest(completeAttempt), {
  commandId: '11111111-1111-4111-8111-111111111111',
  bookingId: 'booking-1',
  expectedProductionDate: '2026-07-16',
});
assert.equal(buildReopenProductionScheduleRequest(completeAttempt), null);

const reopenAttempt = createProductionScheduleCompletionAttempt(
  completed,
  '22222222-2222-4222-8222-222222222222',
);
assert.equal(validateProductionScheduleReopenReason(''), 'Enter a reason between 1 and 500 characters.');
assert.equal(validateProductionScheduleReopenReason('   '), 'Enter a reason between 1 and 500 characters.');
assert.equal(getNormalizedProductionScheduleReopenReasonLength('   '), 0);
assert.equal(getNormalizedProductionScheduleReopenReasonLength('a'), 1);
assert.equal(getNormalizedProductionScheduleReopenReasonLength(' a '), 1);
assert.equal(validateProductionScheduleReopenReason('x'.repeat(500)), null);
assert.equal(getNormalizedProductionScheduleReopenReasonLength(` ${'x'.repeat(500)} `), 500);
assert.equal(validateProductionScheduleReopenReason('x'.repeat(501)), 'Enter a reason between 1 and 500 characters.');
assert.equal(getNormalizedProductionScheduleReopenReasonLength(` ${'x'.repeat(501)} `), 501);
assert.equal(getNormalizedProductionScheduleReopenReasonLength(' 🚀 '), 2);
assert.equal(validateProductionScheduleReopenReason('🚀'.repeat(250)), null);
assert.equal(
  validateProductionScheduleReopenReason('🚀'.repeat(251)),
  'Enter a reason between 1 and 500 characters.',
);
assert.equal(normalizeProductionScheduleReopenReason('  Correction  '), 'Correction');

const withReason = updateProductionScheduleReopenReason(
  reopenAttempt,
  '  Correction  ',
  () => '33333333-3333-4333-8333-333333333333',
);
assert.equal(withReason.commandId, '33333333-3333-4333-8333-333333333333');
assert.deepEqual(buildReopenProductionScheduleRequest(withReason), {
  commandId: '33333333-3333-4333-8333-333333333333',
  bookingId: 'booking-1',
  expectedProductionDate: '2026-07-16',
  expectedCompletedAt: '2026-07-16T18:22:31.123456+00:00',
  reason: 'Correction',
});
const unchangedWhitespace = updateProductionScheduleReopenReason(
  { ...withReason, failed: true },
  'Correction ',
  () => '44444444-4444-4444-8444-444444444444',
);
assert.equal(unchangedWhitespace.commandId, withReason.commandId);
assert.equal(unchangedWhitespace.failed, true);
assert.equal(
  getProductionScheduleCompletionMaterialKey(unchangedWhitespace),
  getProductionScheduleCompletionMaterialKey(withReason),
);
const changedReason = updateProductionScheduleReopenReason(
  { ...withReason, failed: true },
  'Different reason',
  () => '44444444-4444-4444-8444-444444444444',
);
assert.equal(changedReason.commandId, '44444444-4444-4444-8444-444444444444');
assert.equal(changedReason.failed, false);

for (const code of ['stale_booking', 'already_completed', 'not_completed', 'permission_required'] as const) {
  const presentation = getProductionScheduleCompletionFailurePresentation(code);
  assert.equal(presentation.refresh, true);
  assert.equal(presentation.closeDialog, true);
}
assert.match(getProductionScheduleCompletionFailurePresentation('ineligible_booking').message, /cannot be changed/);
assert.match(getProductionScheduleCompletionFailurePresentation('invalid_reason').message, /1 and 500/);
assert.match(getProductionScheduleCompletionFailurePresentation('unavailable').message, /could not be updated/);
assert.doesNotMatch(getProductionScheduleCompletionFailurePresentation('unavailable').message, /rpc|supabase|sql/i);

console.log('Phase 2F-F2 Production Schedule completion UI contract tests passed');
