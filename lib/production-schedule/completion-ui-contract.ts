import type {
  CompleteProductionBookingRequest,
  ProductionBookingCompletionErrorCode,
  ProductionBookingCompletionResult,
  ReopenProductionBookingRequest,
} from '../production-bookings/production-booking-completion-contract';
import type { ProductionBoardCard } from '../production-board/types';

export type ProductionScheduleCompletionAttempt = {
  action: 'complete' | 'reopen';
  commandId: string;
  bookingId: string;
  productionDate: string;
  expectedCompletedAt: string | null;
  reason: string;
  failed: boolean;
};

export type ProductionScheduleCompletionFailurePresentation = {
  message: string;
  refresh: boolean;
  closeDialog: boolean;
};

export type ProductionScheduleCompletionSubmissionOutcome =
  | { kind: 'ignored' }
  | { kind: 'superseded' }
  | { kind: 'invalid'; message: string }
  | { kind: 'success'; message: string }
  | {
      kind: 'failure';
      presentation: ProductionScheduleCompletionFailurePresentation;
    };

export type ProductionScheduleCompletionSubmissionGuard = {
  current: string | null;
};

export function getProductionScheduleCompletionAction(
  card: ProductionBoardCard,
  canUse: boolean,
): 'complete' | 'reopen' | null {
  if (!canUse) return null;
  return card.completedAt === null ? 'complete' : 'reopen';
}

export function getProductionScheduleCompletionBlockReason(
  card: ProductionBoardCard,
  pending: boolean,
): string | null {
  if (pending) return 'This booking already has an action in progress.';
  if (card.locked) return 'This booking is locked and cannot be changed.';
  if (card.bookingKind !== 'production') return 'This booking cannot be changed in its current state.';
  if (typeof card.bookingId !== 'string'
    || card.bookingId.length < 1
    || card.bookingId.length > 500
    || card.bookingId !== card.bookingId.trim()) {
    return 'This booking cannot be changed in its current state.';
  }
  return null;
}

export function createProductionScheduleCompletionAttempt(
  card: ProductionBoardCard,
  commandId: string,
): ProductionScheduleCompletionAttempt {
  return {
    action: card.completedAt === null ? 'complete' : 'reopen',
    commandId,
    bookingId: card.bookingId,
    productionDate: card.productionDate,
    expectedCompletedAt: card.completedAt,
    reason: '',
    failed: false,
  };
}

export function beginProductionScheduleCompletionAttempt(
  card: ProductionBoardCard,
  createCommandId: () => string,
): ProductionScheduleCompletionAttempt {
  return createProductionScheduleCompletionAttempt(card, createCommandId());
}

export function normalizeProductionScheduleReopenReason(reason: string): string {
  return reason.trim();
}

export function getNormalizedProductionScheduleReopenReasonLength(reason: string): number {
  return normalizeProductionScheduleReopenReason(reason).length;
}

export function validateProductionScheduleReopenReason(reason: string): string | null {
  const normalized = normalizeProductionScheduleReopenReason(reason);
  if (normalized.length === 0 || normalized.length > 500) {
    return 'Enter a reason between 1 and 500 characters.';
  }
  return null;
}

export function updateProductionScheduleReopenReason(
  attempt: ProductionScheduleCompletionAttempt,
  reason: string,
  createCommandId: () => string,
): ProductionScheduleCompletionAttempt {
  if (attempt.action !== 'reopen') return attempt;
  const changed = normalizeProductionScheduleReopenReason(attempt.reason)
    !== normalizeProductionScheduleReopenReason(reason);
  return {
    ...attempt,
    reason,
    commandId: changed ? createCommandId() : attempt.commandId,
    failed: changed ? false : attempt.failed,
  };
}

export function getProductionScheduleCompletionMaterialKey(
  attempt: ProductionScheduleCompletionAttempt,
): string {
  return JSON.stringify([
    attempt.action,
    attempt.bookingId,
    attempt.productionDate,
    attempt.expectedCompletedAt,
    attempt.action === 'reopen'
      ? normalizeProductionScheduleReopenReason(attempt.reason)
      : null,
  ]);
}

export function isSameProductionScheduleCompletionAttempt(
  left: ProductionScheduleCompletionAttempt | null,
  right: ProductionScheduleCompletionAttempt,
): boolean {
  return left !== null
    && left.commandId === right.commandId
    && getProductionScheduleCompletionMaterialKey(left)
      === getProductionScheduleCompletionMaterialKey(right);
}

export function buildCompleteProductionScheduleRequest(
  attempt: ProductionScheduleCompletionAttempt,
): CompleteProductionBookingRequest | null {
  if (attempt.action !== 'complete') return null;
  return {
    commandId: attempt.commandId,
    bookingId: attempt.bookingId,
    expectedProductionDate: attempt.productionDate,
  };
}

export function buildReopenProductionScheduleRequest(
  attempt: ProductionScheduleCompletionAttempt,
): ReopenProductionBookingRequest | null {
  if (attempt.action !== 'reopen'
    || attempt.expectedCompletedAt === null
    || validateProductionScheduleReopenReason(attempt.reason) !== null) {
    return null;
  }
  return {
    commandId: attempt.commandId,
    bookingId: attempt.bookingId,
    expectedProductionDate: attempt.productionDate,
    expectedCompletedAt: attempt.expectedCompletedAt,
    reason: normalizeProductionScheduleReopenReason(attempt.reason),
  };
}

export function getProductionScheduleCompletionFailurePresentation(
  code: ProductionBookingCompletionErrorCode,
): ProductionScheduleCompletionFailurePresentation {
  switch (code) {
    case 'authentication_required':
    case 'active_profile_required':
    case 'permission_required':
      return {
        message: 'You no longer have permission to change production bookings.',
        refresh: true,
        closeDialog: true,
      };
    case 'stale_booking':
      return {
        message: 'This booking changed since the schedule loaded. The schedule has been refreshed.',
        refresh: true,
        closeDialog: true,
      };
    case 'already_completed':
      return {
        message: 'This booking is already completed. The schedule has been refreshed.',
        refresh: true,
        closeDialog: true,
      };
    case 'not_completed':
      return {
        message: 'This booking is no longer completed. The schedule has been refreshed.',
        refresh: true,
        closeDialog: true,
      };
    case 'not_found':
    case 'invalid_booking_id':
    case 'ineligible_booking':
      return {
        message: 'This booking cannot be changed in its current state.',
        refresh: true,
        closeDialog: true,
      };
    case 'reason_required':
    case 'invalid_reason':
      return {
        message: 'Enter a reason between 1 and 500 characters.',
        refresh: false,
        closeDialog: false,
      };
    case 'command_uuid_collision':
      return {
        message: 'This action no longer matches the original request. Review the refreshed booking and try again.',
        refresh: true,
        closeDialog: true,
      };
    default:
      return {
        message: 'The production booking could not be updated. Please try again.',
        refresh: false,
        closeDialog: false,
      };
  }
}

export async function submitProductionScheduleCompletionAttempt({
  attempt,
  guard,
  isCurrentAttempt,
  complete,
  reopen,
}: {
  attempt: ProductionScheduleCompletionAttempt;
  guard: ProductionScheduleCompletionSubmissionGuard;
  isCurrentAttempt: (captured: ProductionScheduleCompletionAttempt) => boolean;
  complete: (
    request: CompleteProductionBookingRequest,
  ) => Promise<ProductionBookingCompletionResult>;
  reopen: (
    request: ReopenProductionBookingRequest,
  ) => Promise<ProductionBookingCompletionResult>;
}): Promise<ProductionScheduleCompletionSubmissionOutcome> {
  if (guard.current !== null) return { kind: 'ignored' };

  const completeRequest = buildCompleteProductionScheduleRequest(attempt);
  const reopenRequest = buildReopenProductionScheduleRequest(attempt);
  if (!completeRequest && !reopenRequest) {
    return {
      kind: 'invalid',
      message: 'Enter a reason between 1 and 500 characters.',
    };
  }

  guard.current = attempt.commandId;
  try {
    const result = completeRequest
      ? await complete(completeRequest)
      : await reopen(reopenRequest!);
    if (!isCurrentAttempt(attempt)) return { kind: 'superseded' };
    if (result.ok === true) {
      return {
        kind: 'success',
        message: attempt.action === 'complete'
          ? 'Production booking marked complete.'
          : 'Production booking reopened.',
      };
    }
    return {
      kind: 'failure',
      presentation: getProductionScheduleCompletionFailurePresentation(result.code),
    };
  } catch {
    if (!isCurrentAttempt(attempt)) return { kind: 'superseded' };
    return {
      kind: 'failure',
      presentation: getProductionScheduleCompletionFailurePresentation('unavailable'),
    };
  } finally {
    if (guard.current === attempt.commandId) guard.current = null;
  }
}

export function applyProductionScheduleCompletionOutcome(
  outcome: ProductionScheduleCompletionSubmissionOutcome,
  handlers: {
    close: (returnFocus: boolean) => void;
    retry: (message: string) => void;
    announce: (tone: 'success' | 'error', message: string) => void;
    refresh: () => void;
  },
): void {
  if (outcome.kind === 'ignored' || outcome.kind === 'superseded') return;
  if (outcome.kind === 'invalid') {
    handlers.retry(outcome.message);
    return;
  }
  if (outcome.kind === 'success') {
    handlers.close(false);
    handlers.announce('success', outcome.message);
    handlers.refresh();
    return;
  }

  if (outcome.presentation.closeDialog) {
    handlers.close(true);
    handlers.announce('error', outcome.presentation.message);
  } else {
    handlers.retry(outcome.presentation.message);
  }
  if (outcome.presentation.refresh) handlers.refresh();
}
