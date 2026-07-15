import type {
  ProductionBoardCard,
  ProductionBoardDay,
  ProductionBoardViewModel,
} from '../production-board/types';

export type ProductionScheduleDestinationPreview = {
  productionDate: string;
  currentPlannedHours: number | null;
  bookingHours: number;
  projectedPlannedHours: number | null;
  availableHours: number | null;
  capacityKnown: boolean;
  isClosed: boolean;
  overload: boolean;
};

export type ProductionScheduleDestinationPreviewResult =
  | { ok: true; preview: ProductionScheduleDestinationPreview }
  | { ok: false; code: 'invalid_request' | 'stale_booking' | 'permission_required' | 'unavailable'; message: string };

export type ProductionScheduleMoveAttempt = {
  commandId: string;
  bookingId: string;
  sourceDate: string;
  destinationDate: string;
  whollyUnstartedAcknowledged: boolean;
  backdateReason: string;
  closedDateOverrideAcknowledged: boolean;
  failed: boolean;
};

export type ProductionScheduleMoveReview = {
  requiresWhollyUnstartedAcknowledgement: boolean;
  requiresBackdateReason: boolean;
  requiresClosedDateOverride: boolean;
  warnsOverload: boolean;
  warnsUnknownCapacity: boolean;
  requiresDialog: boolean;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidProductionScheduleDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
}

export function getProductionScheduleCardMoveBlockReason(
  card: ProductionBoardCard,
  pending: boolean,
): string | null {
  if (pending) return 'This booking already has a move in progress.';
  if (card.completedAt !== null) return 'Completed bookings cannot be moved.';
  if (card.locked) return 'This booking is locked and cannot be moved.';
  if (
    typeof card.bookingId !== 'string' ||
    card.bookingId.length === 0 ||
    card.bookingId.length > 500 ||
    card.bookingId !== card.bookingId.trim()
  ) {
    return 'This booking is not eligible to move.';
  }
  const shopHours = card.shopHours;
  const hasAtMostTwoDecimals = typeof shopHours === 'number' &&
    Number.isFinite(shopHours) &&
    Number(shopHours.toFixed(2)) === shopHours;
  if (
    card.bookingKind !== 'production' ||
    !card.shopHoursKnown ||
    typeof shopHours !== 'number' ||
    !Number.isFinite(shopHours) ||
    shopHours < 0 ||
    shopHours > 99_999_999.99 ||
    !hasAtMostTwoDecimals
  ) {
    return 'This booking is not eligible to move.';
  }
  return null;
}

export function previewFromVisibleBoardDay(
  day: ProductionBoardDay,
  bookingHours: number,
): ProductionScheduleDestinationPreview {
  const currentPlannedHours = day.missingShopHoursCount === 0
    ? day.totalKnownShopHours
    : null;
  const projectedPlannedHours = currentPlannedHours === null
    ? null
    : currentPlannedHours + bookingHours;
  return {
    productionDate: day.date,
    currentPlannedHours,
    bookingHours,
    projectedPlannedHours,
    availableHours: day.availableHours,
    capacityKnown: day.capacityKnown,
    isClosed: day.isExplicitlyClosed,
    overload:
      day.capacityKnown &&
      day.availableHours !== null &&
      projectedPlannedHours !== null &&
      projectedPlannedHours > day.availableHours,
  };
}

export function isMaterialProductionScheduleMoveFailure(code: string): boolean {
  return new Set([
    'stale_booking', 'not_found', 'ineligible_booking', 'invalid_booking_id',
    'permission_required', 'authentication_required', 'active_profile_required',
  ]).has(code);
}

export function classifyProductionScheduleMoveReview(input: {
  sourceDate: string;
  destinationDate: string;
  today: string;
  preview: ProductionScheduleDestinationPreview;
}): ProductionScheduleMoveReview {
  const requiresWhollyUnstartedAcknowledgement = input.sourceDate <= input.today;
  const requiresBackdateReason = input.destinationDate < input.today;
  const requiresClosedDateOverride = input.preview.isClosed;
  const warnsOverload = input.preview.overload;
  const warnsUnknownCapacity = !input.preview.capacityKnown;
  return {
    requiresWhollyUnstartedAcknowledgement,
    requiresBackdateReason,
    requiresClosedDateOverride,
    warnsOverload,
    warnsUnknownCapacity,
    requiresDialog:
      requiresWhollyUnstartedAcknowledgement ||
      requiresBackdateReason ||
      requiresClosedDateOverride ||
      warnsOverload ||
      warnsUnknownCapacity,
  };
}

export function validateProductionScheduleMoveReview(input: {
  attempt: ProductionScheduleMoveAttempt;
  review: ProductionScheduleMoveReview;
  previewReady: boolean;
}): { valid: boolean; reasonError: string | null } {
  const reason = input.attempt.backdateReason.trim();
  const reasonError = input.review.requiresBackdateReason
    ? reason.length === 0
      ? 'Enter a reason for moving this booking to a past date.'
      : reason.length > 500
        ? 'Keep the reason to 500 characters or fewer.'
        : null
    : null;
  return {
    reasonError,
    valid:
      input.previewReady &&
      reasonError === null &&
      (!input.review.requiresWhollyUnstartedAcknowledgement || input.attempt.whollyUnstartedAcknowledged) &&
      (!input.review.requiresClosedDateOverride || input.attempt.closedDateOverrideAcknowledged),
  };
}

export function materialMoveAttemptChanged(
  current: ProductionScheduleMoveAttempt,
  next: ProductionScheduleMoveAttempt,
): boolean {
  return current.bookingId !== next.bookingId ||
    current.sourceDate !== next.sourceDate ||
    current.destinationDate !== next.destinationDate ||
    current.whollyUnstartedAcknowledged !== next.whollyUnstartedAcknowledged ||
    current.backdateReason.trim() !== next.backdateReason.trim() ||
    current.closedDateOverrideAcknowledged !== next.closedDateOverrideAcknowledged;
}

export function updateProductionScheduleMoveAttempt(
  current: ProductionScheduleMoveAttempt,
  changes: Partial<Omit<ProductionScheduleMoveAttempt, 'commandId'>>,
  createCommandId: () => string,
): ProductionScheduleMoveAttempt {
  const candidate = { ...current, ...changes };
  return current.failed && materialMoveAttemptChanged(current, candidate)
    ? { ...candidate, commandId: createCommandId(), failed: false }
    : candidate;
}

export function moveProductionBoardCardLocally(
  board: ProductionBoardViewModel,
  bookingId: string,
  destinationDate: string,
): ProductionBoardViewModel {
  const card = [
    ...board.days.flatMap((day) => day.cards),
    ...board.weekGroups.flatMap((week) =>
      week.weekendExceptions.flatMap((exception) => exception.cards),
    ),
  ].find((value) => value.bookingId === bookingId);
  if (!card || !board.days.some((day) => day.date === destinationDate) || card.productionDate === destinationDate) {
    return board;
  }

  const moveDays = (days: ProductionBoardDay[]) => days.map((day) => {
    const without = day.cards.filter((value) => value.bookingId !== bookingId);
    const cards = day.date === destinationDate
      ? [...without, { ...card, productionDate: destinationDate }].sort(
          (left, right) => left.title.localeCompare(right.title) || left.bookingId.localeCompare(right.bookingId),
        )
      : without;
    const changed = cards.length !== day.cards.length || cards.some((value, index) => value !== day.cards[index]);
    return changed ? { ...day, cards, bookingCount: cards.length } : day;
  });

  return {
    ...board,
    days: moveDays(board.days),
    weekGroups: board.weekGroups.map((week) => ({
      ...week,
      days: moveDays(week.days),
      weekendExceptions: week.weekendExceptions.map((exception) => ({
        ...exception,
        cards: exception.cards.filter((value) => value.bookingId !== bookingId),
      })),
    })),
  };
}

export function formatProductionScheduleDate(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}
