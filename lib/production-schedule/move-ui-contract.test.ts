import { strict as assert } from 'node:assert';
import type { ProductionBoardCard, ProductionBoardDay, ProductionBoardViewModel } from '../production-board/types';
import {
  classifyProductionScheduleMoveReview,
  getProductionScheduleCardMoveBlockReason,
  isMaterialProductionScheduleMoveFailure,
  isValidProductionScheduleDate,
  materialMoveAttemptChanged,
  moveProductionBoardCardLocally,
  previewFromVisibleBoardDay,
  updateProductionScheduleMoveAttempt,
  validateProductionScheduleMoveReview,
  type ProductionScheduleMoveAttempt,
} from './move-ui-contract';

const today = '2026-07-15';
const card: ProductionBoardCard = {
  bookingId: 'booking-1', type: 'doorgo_linked', typeLabel: 'DoorGo-linked',
  productionDate: '2026-07-16', title: 'Alpha', customer: null, jobId: 'job-1',
  calendarId: null, calendarEventId: null, shopHours: 4, shopHoursKnown: true,
  salesperson: null, source: null, sourceSystem: null, bookingKind: 'production',
  locked: false, completedAt: null,
};

const day = (date: string, cards: ProductionBoardCard[] = []): ProductionBoardDay => ({
  date, dateState: 'future', totalKnownShopHours: cards.reduce((sum, value) => sum + (value.shopHours ?? 0), 0),
  bookingCount: cards.length, missingShopHoursCount: 0, availableHours: 8,
  staffCapacityHours: 8, deductionHours: 0, capacitySource: 'calculated', capacityKnown: true,
  isClosed: false, isExplicitlyClosed: false, capacityNotes: null, remainingHours: 8, overloadHours: 0,
  plannedStarts: 0, plannedStartsKnown: true, openingCarryIn: 0, openingCarryKnown: true,
  calculatedOpeningCarry: 0, actualOpeningCarry: null, authoritativeOpeningCarry: 0,
  adjustmentHours: null, hasActualCarryCheckpoint: false, checkpointId: null,
  checkpointProductionDate: null, checkpointRevisionNumber: null, checkpointRecordedAt: null,
  checkpointRecordedByUserId: null, checkpointConfirmedAt: null, checkpointConfirmedByUserId: null,
  checkpointActorType: null, checkpointSourceSystem: null, checkpointNote: null,
  checkpointCalculationVersion: null, flowLoad: 0, endingCarryOut: 0, openFlowCapacity: 8,
  flowStatus: 'resolved', flowUnresolvedReason: null, weekendBookingException: false, cards,
});

const preview = previewFromVisibleBoardDay(day('2026-07-17', [{ ...card, bookingId: 'other', shopHours: 6 }]), 4);
assert.equal(preview.currentPlannedHours, 6);
assert.equal(preview.projectedPlannedHours, 10);
assert.equal(preview.overload, true); // overload warns but remains enabled
assert.equal(previewFromVisibleBoardDay({ ...day('2026-07-17'), capacityKnown: false, availableHours: null }, 4).availableHours, null); // unknown capacity

const review = (sourceDate: string, destinationDate: string, overrides: Partial<typeof preview> = {}) =>
  classifyProductionScheduleMoveReview({ sourceDate, destinationDate, today, preview: { ...preview, overload: false, ...overrides } });
assert.deepEqual(review('2026-07-16', '2026-07-17'), { // future to future
  requiresWhollyUnstartedAcknowledgement: false, requiresBackdateReason: false,
  requiresClosedDateOverride: false, warnsOverload: false, warnsUnknownCapacity: false,
  requiresDialog: false,
});
assert.equal(review('2026-07-16', today).requiresDialog, false); // future to today
assert.equal(review('2026-07-16', '2026-07-14').requiresBackdateReason, true); // future to past
assert.equal(review(today, '2026-07-16').requiresWhollyUnstartedAcknowledgement, true); // today to future
assert.deepEqual(
  [review(today, '2026-07-14').requiresWhollyUnstartedAcknowledgement, review(today, '2026-07-14').requiresBackdateReason],
  [true, true], // today to past
);
assert.equal(review('2026-07-14', today).requiresWhollyUnstartedAcknowledgement, true); // past to today
assert.equal(review('2026-07-14', '2026-07-16').requiresWhollyUnstartedAcknowledgement, true); // past to future
assert.deepEqual(
  [review('2026-07-14', '2026-07-13').requiresWhollyUnstartedAcknowledgement, review('2026-07-14', '2026-07-13').requiresBackdateReason],
  [true, true], // past to past
);
assert.equal(review('2026-07-16', '2026-07-17', { isClosed: true }).requiresClosedDateOverride, true); // closed destination requires override
assert.equal(review('2026-07-16', '2026-07-17', { capacityKnown: false }).warnsUnknownCapacity, true);

const explicitClosurePreview = previewFromVisibleBoardDay({ ...day('2026-07-17'), isExplicitlyClosed: true }, 4);
assert.equal(explicitClosurePreview.isClosed, true); // raw is_closed=true requires override
const sourceOnlyClosurePreview = previewFromVisibleBoardDay({
  ...day('2026-07-17'), isClosed: true, isExplicitlyClosed: false, capacitySource: 'closure',
}, 4);
assert.equal(sourceOnlyClosurePreview.isClosed, false); // capacity_source='closure' with is_closed=false does not require override
assert.equal(review('2026-07-16', '2026-07-17', sourceOnlyClosurePreview).requiresClosedDateOverride, false);
assert.equal(previewFromVisibleBoardDay({ ...day('2026-07-17'), isExplicitlyClosed: false }, 4).isClosed, false); // is_closed missing/null normalizes to false
const zeroCapacityPreview = previewFromVisibleBoardDay({
  ...day('2026-07-17'), availableHours: 0, isExplicitlyClosed: false,
}, 4);
assert.equal(zeroCapacityPreview.isClosed, false); // zero available hours with is_closed=false is not closed
assert.equal(zeroCapacityPreview.overload, true); // overload remains nonblocking

assert.equal(getProductionScheduleCardMoveBlockReason(card, false), null); // active unlocked incomplete production booking can move
assert.equal(getProductionScheduleCardMoveBlockReason({ ...card, productionDate: '2026-07-14' }, false), null); // past unfinished booking remains movable
for (const shopHours of [0, 0.1, 1.25, 99_999_999.99]) {
  assert.equal(getProductionScheduleCardMoveBlockReason({ ...card, shopHours }, false), null); // valid booking IDs and Shop Hours
}
assert.equal(getProductionScheduleCardMoveBlockReason({ ...card, completedAt: '2026-07-15T12:00:00Z' }, false), 'Completed bookings cannot be moved.');
assert.equal(getProductionScheduleCardMoveBlockReason({ ...card, locked: true }, false), 'This booking is locked and cannot be moved.');
assert.equal(getProductionScheduleCardMoveBlockReason(card, true), 'This booking already has a move in progress.'); // pending card cannot start another move
assert.match(getProductionScheduleCardMoveBlockReason({ ...card, bookingKind: 'placeholder' }, false) ?? '', /not eligible/);
for (const bookingId of ['', '   ', 'x'.repeat(501)]) {
  assert.match(getProductionScheduleCardMoveBlockReason({ ...card, bookingId }, false) ?? '', /not eligible/); // invalid booking ID guidance
}
assert.match(getProductionScheduleCardMoveBlockReason({ ...card, bookingId: ' booking-1 ' }, false) ?? '', /not eligible/);
assert.match(getProductionScheduleCardMoveBlockReason({ ...card, bookingId: undefined } as unknown as ProductionBoardCard, false) ?? '', /not eligible/); // missing booking ID guidance
for (const shopHours of [null, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.001, 100_000_000]) {
  assert.match(getProductionScheduleCardMoveBlockReason({ ...card, shopHours }, false) ?? '', /not eligible/); // invalid Shop Hours guidance
}
assert.equal(isMaterialProductionScheduleMoveFailure('invalid_booking_id'), true); // invalid booking ID reverts, refreshes, closes, and discards UUID
assert.equal(isMaterialProductionScheduleMoveFailure('unavailable'), false); // retryable failure retains the attempt

const attempt: ProductionScheduleMoveAttempt = {
  commandId: '11111111-1111-4111-8111-111111111111', bookingId: card.bookingId,
  sourceDate: card.productionDate, destinationDate: '2026-07-14',
  whollyUnstartedAcknowledged: false, backdateReason: '',
  closedDateOverrideAcknowledged: false, failed: false,
};
const allRequired = review(today, '2026-07-14', { isClosed: true });
assert.equal(validateProductionScheduleMoveReview({ attempt, review: allRequired, previewReady: true }).valid, false); // blank backdate reason rejected
assert.equal(validateProductionScheduleMoveReview({ attempt: { ...attempt, backdateReason: '   ' }, review: allRequired, previewReady: true }).valid, false); // whitespace reason rejected
assert.match(validateProductionScheduleMoveReview({ attempt: { ...attempt, backdateReason: 'x'.repeat(501) }, review: allRequired, previewReady: true }).reasonError ?? '', /500/);
assert.equal(validateProductionScheduleMoveReview({ attempt: { ...attempt, whollyUnstartedAcknowledged: true, backdateReason: 'Correction', closedDateOverrideAcknowledged: true }, review: allRequired, previewReady: true }).valid, true);
assert.equal(validateProductionScheduleMoveReview({ attempt: { ...attempt, whollyUnstartedAcknowledged: true, backdateReason: 'Correction', closedDateOverrideAcknowledged: true }, review: allRequired, previewReady: false }).valid, false); // preview loading blocks action

assert.equal(isValidProductionScheduleDate('2026-02-29'), false);
assert.equal(isValidProductionScheduleDate('2024-02-29'), true); // date picker accepts real past/today/future dates

const source = day('2026-07-16', [card, { ...card, bookingId: 'booking-2', title: 'Zulu' }]);
const destination = day('2026-07-17');
const board: ProductionBoardViewModel = {
  startDate: source.date, endDateExclusive: '2026-07-18', weeks: 1,
  visibleWeekdayEndExclusive: '2026-07-18',
  days: [source, destination],
  weekGroups: [{
    weekIndex: 0, startDate: source.date, endDateExclusive: '2026-07-18', weekdayEndExclusive: '2026-07-18', days: [source, destination],
    bookingCount: 2, totalKnownShopHours: 8, missingShopHoursCount: 0, totalAvailableHours: 16,
    unknownCapacityDayCount: 0, closureCount: 0, dailyOverloadCount: 0, capacityComplete: true,
    comparisonComplete: true, remainingHours: 8, overloadHours: 0, openingCarryIn: 0,
    openingCarryKnown: true, plannedStarts: 8, plannedStartsKnown: true, flowCapacity: 16,
    endingCarryOut: 0, unresolvedFlow: false, flowUnresolvedReason: null, carriesIntoNextShopDay: false,
    weekendBookingExceptionCount: 0, weekendExceptions: [], checkpointCount: 0, hasActualCarryReset: false,
  }],
  summary: { totalBookings: 2, totalKnownShopHours: 8, scheduledDays: 1, doorGoLinkedCount: 2, bizTrackOnlyCount: 0, missingShopHoursCount: 0 },
  calculationStartDate: source.date,
};
const landed = moveProductionBoardCardLocally(board, card.bookingId, destination.date);
assert.deepEqual(landed.days[0].cards.map((value) => value.bookingId), ['booking-2']);
assert.deepEqual(landed.days[1].cards.map((value) => value.bookingId), ['booking-1']); // valid drop lands locally
assert.equal(moveProductionBoardCardLocally(board, card.bookingId, source.date), board); // same-date drop is no-op
assert.equal(moveProductionBoardCardLocally(board, card.bookingId, '2027-01-01'), board); // outside-visible drop is not a local target
assert.deepEqual(board.days[0].cards.map((value) => value.bookingId), ['booking-1', 'booking-2']); // cancel/error can restore original model and ordering
const weekendCard = { ...card, bookingId: 'weekend-booking', productionDate: '2026-07-12' };
const weekendBoard: ProductionBoardViewModel = {
  ...board,
  days: [destination],
  weekGroups: [{
    ...board.weekGroups[0],
    days: [destination],
    weekendExceptions: [{ date: weekendCard.productionDate, cards: [weekendCard], plannedStarts: 4, plannedStartsKnown: true }],
    weekendBookingExceptionCount: 1,
  }],
};
const weekendLanded = moveProductionBoardCardLocally(weekendBoard, weekendCard.bookingId, destination.date);
assert.equal(weekendLanded.days[0].cards[0].bookingId, weekendCard.bookingId);
assert.equal(weekendLanded.weekGroups[0].weekendExceptions[0].cards.length, 0); // weekend exception uses the same Move workflow

const unchangedRetry = updateProductionScheduleMoveAttempt({ ...attempt, failed: true }, {}, () => '22222222-2222-4222-8222-222222222222');
assert.equal(unchangedRetry.commandId, attempt.commandId); // unchanged Retry preserves UUID
const changedRetry = updateProductionScheduleMoveAttempt({ ...attempt, failed: true }, { backdateReason: 'new reason' }, () => '22222222-2222-4222-8222-222222222222');
assert.equal(changedRetry.commandId, '22222222-2222-4222-8222-222222222222'); // material request change rotates UUID
assert.equal(materialMoveAttemptChanged(attempt, { ...attempt, destinationDate: '2026-07-13' }), true);

console.log('Phase 2F-E2C Production Schedule move UI contract tests passed');
