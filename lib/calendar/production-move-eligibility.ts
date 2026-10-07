import type { ProductionBoardCard } from '../production-board/types';

// Manual Calendar placement supports unknown hours; planning eligibility does not.
export function getCalendarProductionMoveBlockReason(card: ProductionBoardCard, pending: boolean): string | null {
  if (pending) return 'This booking already has a move in progress.';
  if (card.completedAt) return 'Reopen this Calendar item before moving it.';
  if (card.locked) return 'This booking is locked and cannot be moved.';
  if (typeof card.bookingId !== 'string' || !card.bookingId.trim() || card.bookingId !== card.bookingId.trim() || card.bookingId.length > 500 || card.bookingKind !== 'production') {
    return 'This booking is not eligible to move.';
  }
  if (card.shopHours !== null && (!Number.isFinite(card.shopHours) || card.shopHours < 0 || card.shopHours > 99_999_999.99 || Number(card.shopHours.toFixed(2)) !== card.shopHours)) {
    return 'This booking has invalid Shop Hours. Review it before moving.';
  }
  return null;
}
