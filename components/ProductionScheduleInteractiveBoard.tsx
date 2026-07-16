'use client';

import type { DragEvent, MouseEvent, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { AppConfirmationToast, type AppConfirmationToastMessage } from './AppConfirmationToast';
import { ProductionBoardView } from './ProductionBoardView';
import type { ProductionBoardInteraction } from './production-board-interaction';
import type { ProductionBoardPresentation } from './ProductionBoardSummary';
import { rescheduleProductionBooking } from '@/lib/production-bookings/production-booking-reschedule-actions';
import { previewProductionScheduleDestination } from '@/lib/production-schedule/destination-preview-action';
import {
  classifyProductionScheduleMoveReview,
  formatProductionScheduleDate,
  getProductionScheduleCardMoveBlockReason,
  isMaterialProductionScheduleMoveFailure,
  isValidProductionScheduleDate,
  moveProductionBoardCardLocally,
  previewFromVisibleBoardDay,
  updateProductionScheduleMoveAttempt,
  validateProductionScheduleMoveReview,
  type ProductionScheduleDestinationPreview,
  type ProductionScheduleMoveAttempt,
} from '@/lib/production-schedule/move-ui-contract';
import type { ProductionBoardCard, ProductionBoardViewModel } from '@/lib/production-board/types';

type ActiveMove = {
  card: ProductionBoardCard;
  attempt: ProductionScheduleMoveAttempt | null;
  preview: ProductionScheduleDestinationPreview | null;
  previewLoading: boolean;
  showDialog: boolean;
  submitting: boolean;
  optimistic: boolean;
  destinationOutsideVisibleWindow: boolean;
  error: string | null;
  origin: HTMLElement;
};

function createSecureCommandId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function subscribeDesktopDrag(onChange: () => void): () => void {
  const query = window.matchMedia('(hover: hover) and (pointer: fine)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function getDesktopDragSnapshot(): boolean {
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function ProductionScheduleInteractiveBoard(props: {
  board: ProductionBoardViewModel;
  presentation: ProductionBoardPresentation;
  headerActions: ReactNode;
  windowNavigation: ReactNode;
  today: string;
}) {
  const version = JSON.stringify(props.board);
  return <ProductionScheduleInteractiveBoardSession key={version} {...props} />;
}

function ProductionScheduleInteractiveBoardSession({
  board,
  presentation,
  headerActions,
  windowNavigation,
  today,
}: {
  board: ProductionBoardViewModel;
  presentation: ProductionBoardPresentation;
  headerActions: ReactNode;
  windowNavigation: ReactNode;
  today: string;
}) {
  const router = useRouter();
  const [displayBoard, setDisplayBoard] = useState(board);
  const [active, setActive] = useState<ActiveMove | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const desktopDrag = useSyncExternalStore(
    subscribeDesktopDrag,
    getDesktopDragSnapshot,
    () => false,
  );
  const [toast, setToast] = useState<AppConfirmationToastMessage | null>(null);
  const draggedCard = useRef<{ card: ProductionBoardCard; origin: HTMLElement } | null>(null);
  const justDragged = useRef<{ bookingId: string; endedAt: number } | null>(null);
  const submittingCommandId = useRef<string | null>(null);
  const toastId = useRef(0);

  const announce = useCallback((tone: 'success' | 'error', text: string) => {
    toastId.current += 1;
    setToast({ id: toastId.current, tone, text });
  }, []);
  const dismissToast = useCallback(() => setToast(null), []);

  const restoreFocus = useCallback((origin: HTMLElement) => {
    window.setTimeout(() => origin.focus(), 0);
  }, []);

  const cancelActiveMove = useCallback(() => {
    if (!active || active.submitting) return;
    setDisplayBoard(board);
    setActive(null);
    setHoveredDate(null);
    restoreFocus(active.origin);
  }, [active, board, restoreFocus]);

  const submitAttempt = useCallback(async (snapshot: ActiveMove) => {
    if (!snapshot.attempt || !snapshot.preview || snapshot.submitting || submittingCommandId.current !== null) return;
    const review = classifyProductionScheduleMoveReview({
      sourceDate: snapshot.attempt.sourceDate,
      destinationDate: snapshot.attempt.destinationDate,
      today,
      preview: snapshot.preview,
    });
    const validation = validateProductionScheduleMoveReview({
      attempt: snapshot.attempt,
      review,
      previewReady: true,
    });
    if (!validation.valid) return;

    let optimistic = snapshot.optimistic;
    if (!optimistic) {
      const optimisticBoard = moveProductionBoardCardLocally(
        displayBoard,
        snapshot.card.bookingId,
        snapshot.attempt.destinationDate,
      );
      if (optimisticBoard !== displayBoard) {
        optimistic = true;
        setDisplayBoard(optimisticBoard);
      }
    }
    const submitting = { ...snapshot, optimistic, submitting: true, error: null };
    setActive(submitting);
    submittingCommandId.current = snapshot.attempt.commandId;

    const result = await rescheduleProductionBooking({
      commandId: snapshot.attempt.commandId,
      bookingId: snapshot.attempt.bookingId,
      expectedProductionDate: snapshot.attempt.sourceDate,
      destinationProductionDate: snapshot.attempt.destinationDate,
      whollyUnstartedAcknowledged: snapshot.attempt.whollyUnstartedAcknowledged,
      backdateReason: review.requiresBackdateReason ? snapshot.attempt.backdateReason.trim() : null,
      closedDateOverrideAcknowledged: snapshot.attempt.closedDateOverrideAcknowledged,
    });
    submittingCommandId.current = null;

    if (result.ok) {
      setActive(null);
      announce('success', `Booking moved to ${formatProductionScheduleDate(result.move.newProductionDate)}.`);
      router.refresh();
      return;
    }

    setDisplayBoard(board);
    const materialChange = isMaterialProductionScheduleMoveFailure(result.code);
    if (materialChange) {
      setActive(null);
      restoreFocus(snapshot.origin);
      router.refresh();
      announce(
        'error',
        result.code === 'stale_booking'
          ? 'This booking was changed elsewhere. The schedule has been refreshed.'
          : result.message,
      );
      return;
    }

    setActive({
      ...snapshot,
      attempt: { ...snapshot.attempt, failed: true },
      optimistic: false,
      submitting: false,
      showDialog: true,
      error: result.message,
    });
  }, [announce, board, displayBoard, restoreFocus, router, today]);

  const beginDestination = useCallback(async (
    card: ProductionBoardCard,
    destinationDate: string,
    origin: HTMLElement,
    submitWhenNoReview: boolean,
  ) => {
    if (!isValidProductionScheduleDate(destinationDate) || destinationDate === card.productionDate) return;
    const attempt: ProductionScheduleMoveAttempt = {
      commandId: createSecureCommandId(),
      bookingId: card.bookingId,
      sourceDate: card.productionDate,
      destinationDate,
      whollyUnstartedAcknowledged: false,
      backdateReason: '',
      closedDateOverrideAcknowledged: false,
      failed: false,
    };
    const visibleDay = board.days.find((day) => day.date === destinationDate);
    const optimisticBoard = visibleDay
      ? moveProductionBoardCardLocally(displayBoard, card.bookingId, destinationDate)
      : displayBoard;
    const base: ActiveMove = {
      card,
      attempt,
      preview: visibleDay && card.shopHours !== null
        ? previewFromVisibleBoardDay(visibleDay, card.shopHours)
        : null,
      previewLoading: !visibleDay,
      showDialog: !submitWhenNoReview || !visibleDay,
      submitting: false,
      optimistic: optimisticBoard !== displayBoard,
      destinationOutsideVisibleWindow: !visibleDay,
      error: null,
      origin,
    };
    setDisplayBoard(optimisticBoard);
    setActive(base);

    if (base.preview) {
      const review = classifyProductionScheduleMoveReview({
        sourceDate: card.productionDate,
        destinationDate,
        today,
        preview: base.preview,
      });
      if (submitWhenNoReview && !review.requiresDialog) {
        await submitAttempt(base);
      } else {
        setActive({ ...base, showDialog: true });
      }
      return;
    }

    const result = await previewProductionScheduleDestination({
      bookingId: card.bookingId,
      expectedProductionDate: card.productionDate,
      destinationProductionDate: destinationDate,
    });
    if (!result.ok && (result.code === 'stale_booking' || result.code === 'permission_required')) {
      setDisplayBoard(board);
      setActive(null);
      restoreFocus(origin);
      router.refresh();
      announce('error', result.message);
      return;
    }
    setActive((current) => {
      if (!current?.attempt || current.attempt.commandId !== attempt.commandId) return current;
      if (!result.ok) return { ...current, previewLoading: false, error: result.message };
      return { ...current, preview: result.preview, previewLoading: false, error: null, showDialog: true };
    });
  }, [announce, board, displayBoard, restoreFocus, router, submitAttempt, today]);

  const openMovePicker = useCallback((card: ProductionBoardCard, origin: HTMLElement) => {
    if (active || getProductionScheduleCardMoveBlockReason(card, false)) return;
    setActive({
      card,
      attempt: null,
      preview: null,
      previewLoading: false,
      showDialog: true,
      submitting: false,
      optimistic: false,
      destinationOutsideVisibleWindow: false,
      error: null,
      origin,
    });
  }, [active]);

  const interaction = useMemo<ProductionBoardInteraction>(() => ({
    mode: 'reschedule',
    pendingBookingId: active?.card.bookingId ?? null,
    hoveredDate,
    getMoveBlockReason: (card) => getProductionScheduleCardMoveBlockReason(card, active?.card.bookingId === card.bookingId),
    canDragCard: (card) => desktopDrag && !active && !getProductionScheduleCardMoveBlockReason(card, false),
    onMoveRequest: openMovePicker,
    onCardDragStart: (card, event: DragEvent<HTMLElement>) => {
      if (active || getProductionScheduleCardMoveBlockReason(card, false)) {
        event.preventDefault();
        return;
      }
      draggedCard.current = { card, origin: event.currentTarget };
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', card.bookingId);
    },
    onCardDragEnd: (card) => {
      justDragged.current = { bookingId: card.bookingId, endedAt: Date.now() };
      draggedCard.current = null;
      setHoveredDate(null);
    },
    onCardClickCapture: (card, event: MouseEvent<HTMLElement>) => {
      if (justDragged.current?.bookingId === card.bookingId && Date.now() - justDragged.current.endedAt < 400) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    onDayDragEnter: (date, event) => {
      if (!draggedCard.current) return;
      event.preventDefault();
      setHoveredDate(date);
    },
    onDayDragOver: (date, event) => {
      if (!draggedCard.current) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (hoveredDate !== date) setHoveredDate(date);
    },
    onDayDragLeave: (date, event) => {
      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
      setHoveredDate((current) => current === date ? null : current);
    },
    onDayDrop: (date, event) => {
      const dragged = draggedCard.current;
      if (!dragged) return;
      event.preventDefault();
      draggedCard.current = null;
      setHoveredDate(null);
      if (date === dragged.card.productionDate) return;
      void beginDestination(dragged.card, date, dragged.origin, true);
    },
  }), [active, beginDestination, desktopDrag, hoveredDate, openMovePicker]);

  const updateAttempt = useCallback((changes: Partial<Omit<ProductionScheduleMoveAttempt, 'commandId'>>) => {
    setActive((current) => current?.attempt
      ? { ...current, attempt: updateProductionScheduleMoveAttempt(current.attempt, changes, createSecureCommandId), error: null }
      : current);
  }, []);

  const retryPreview = useCallback(async (snapshot: ActiveMove) => {
    if (!snapshot.attempt || snapshot.previewLoading || snapshot.preview) return;
    setActive((current) => {
      if (!current || current.attempt?.commandId !== snapshot.attempt?.commandId) return current;
      return { ...current, previewLoading: true, error: null };
    });
    const result = await previewProductionScheduleDestination({
      bookingId: snapshot.attempt.bookingId,
      expectedProductionDate: snapshot.attempt.sourceDate,
      destinationProductionDate: snapshot.attempt.destinationDate,
    });
    if (!result.ok && (result.code === 'stale_booking' || result.code === 'permission_required')) {
      setDisplayBoard(board);
      setActive(null);
      restoreFocus(snapshot.origin);
      router.refresh();
      announce('error', result.message);
      return;
    }
    setActive((current) => {
      if (!current?.attempt || current.attempt.commandId !== snapshot.attempt?.commandId) return current;
      return result.ok
        ? { ...current, preview: result.preview, previewLoading: false, error: null }
        : { ...current, previewLoading: false, error: result.message };
    });
  }, [announce, board, restoreFocus, router]);

  return (
    <>
      <ProductionBoardView
        board={displayBoard}
        presentation={presentation}
        headerActions={headerActions}
        windowNavigation={windowNavigation}
        interaction={interaction}
      />
      {active?.showDialog ? (
        <ProductionScheduleMoveDialog
          active={active}
          today={today}
          onDestination={(destination) => {
            setDisplayBoard(board);
            if (destination === active.card.productionDate) {
              setActive((current) => current ? { ...current, attempt: null, preview: null, previewLoading: false, optimistic: false, error: 'Choose a different production date.' } : current);
              return;
            }
            void beginDestination(active.card, destination, active.origin, false);
          }}
          onAttemptChange={updateAttempt}
          onSubmit={() => void submitAttempt(active)}
          onRetryPreview={() => void retryPreview(active)}
          onCancel={cancelActiveMove}
        />
      ) : null}
      <AppConfirmationToast message={toast} onDismiss={dismissToast} />
    </>
  );
}

function ProductionScheduleMoveDialog({
  active,
  today,
  onDestination,
  onAttemptChange,
  onSubmit,
  onRetryPreview,
  onCancel,
}: {
  active: ActiveMove;
  today: string;
  onDestination: (destination: string) => void;
  onAttemptChange: (changes: Partial<Omit<ProductionScheduleMoveAttempt, 'commandId'>>) => void;
  onSubmit: () => void;
  onRetryPreview: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element || element.open) return;
    if (typeof element.showModal === 'function') {
      element.showModal();
      return;
    }
    element.setAttribute('open', '');
    window.requestAnimationFrame(() => {
      element.querySelector<HTMLElement>(
        'input:not([disabled]), textarea:not([disabled]), button:not([disabled])',
      )?.focus();
    });
  }, []);
  const review = active.attempt && active.preview
    ? classifyProductionScheduleMoveReview({
        sourceDate: active.attempt.sourceDate,
        destinationDate: active.attempt.destinationDate,
        today,
        preview: active.preview,
      })
    : null;
  const validation = active.attempt && review
    ? validateProductionScheduleMoveReview({ attempt: active.attempt, review, previewReady: !active.previewLoading })
    : { valid: false, reasonError: null };

  return (
    <dialog
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-labelledby="production-move-title"
      onCancel={(event) => { event.preventDefault(); onCancel(); }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[min(94vw,36rem)] overflow-y-auto rounded-2xl border border-slate-300 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45"
    >
      <div className="p-4 sm:p-5">
        <h2 id="production-move-title" className="text-lg font-semibold">Move production booking</h2>
        <p className="mt-1 text-sm font-medium text-slate-800">{active.card.title}</p>
        <p className="mt-1 text-xs text-slate-500">Current production date: {formatProductionScheduleDate(active.card.productionDate)}</p>

        <label className="mt-4 block text-sm font-semibold" htmlFor="production-move-date">New production date</label>
        <input
          id="production-move-date"
          type="date"
          value={active.attempt?.destinationDate ?? ''}
          disabled={active.submitting}
          onChange={(event) => {
            if (isValidProductionScheduleDate(event.target.value)) onDestination(event.target.value);
          }}
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
        />

        {active.previewLoading ? (
          <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800" role="status">Checking destination capacity…</p>
        ) : null}

        {active.attempt && active.destinationOutsideVisibleWindow ? (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            This date is outside the currently visible schedule. The booking will appear there after the schedule refreshes or that date range is opened.
          </p>
        ) : null}

        {active.preview ? (
          <section className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3" aria-label="Destination preview">
            <p className="text-sm font-semibold">Destination preview</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              <PreviewValue label="Current planned" value={active.preview.currentPlannedHours} />
              <PreviewValue label="After move" value={active.preview.projectedPlannedHours} />
              <PreviewValue label="Capacity" value={active.preview.capacityKnown ? active.preview.availableHours : null} unknown="Unknown" />
            </div>
          </section>
        ) : null}

        {review?.warnsOverload ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">This move will put the day over its planned production capacity.</p>
        ) : null}
        {review?.warnsUnknownCapacity ? (
          <p className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">Capacity could not be confirmed for this date. This does not block the move.</p>
        ) : null}

        {review?.requiresWhollyUnstartedAcknowledgement ? (
          <label className="mt-3 flex gap-3 rounded-lg border border-slate-200 p-3 text-sm">
            <input
              type="checkbox"
              checked={active.attempt?.whollyUnstartedAcknowledged ?? false}
              onChange={(event) => onAttemptChange({ whollyUnstartedAcknowledged: event.target.checked })}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>The whole job was not started.</span>
          </label>
        ) : null}

        {review?.requiresBackdateReason ? (
          <div className="mt-3">
            <label htmlFor="production-move-reason" className="text-sm font-semibold">Reason for moving this booking to a past date</label>
            <textarea
              id="production-move-reason"
              aria-invalid={validation.reasonError ? true : undefined}
              aria-describedby={validation.reasonError ? 'production-move-reason-error' : undefined}
              rows={3}
              maxLength={501}
              value={active.attempt?.backdateReason ?? ''}
              onChange={(event) => onAttemptChange({ backdateReason: event.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-base"
            />
            {validation.reasonError ? <p id="production-move-reason-error" className="mt-1 text-xs font-medium text-rose-700" role="alert">{validation.reasonError}</p> : null}
          </div>
        ) : null}

        {review?.requiresClosedDateOverride ? (
          <label className="mt-3 flex gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
            <input
              type="checkbox"
              checked={active.attempt?.closedDateOverrideAcknowledged ?? false}
              onChange={(event) => onAttemptChange({ closedDateOverrideAcknowledged: event.target.checked })}
              className="mt-0.5 size-5 shrink-0"
            />
            <span>This production date is marked closed. Move the booking here anyway?</span>
          </label>
        ) : null}

        {active.error ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
            <p>{active.error}</p>
            {active.attempt && !active.preview && !active.previewLoading ? (
              <button type="button" onClick={onRetryPreview} className="mt-2 min-h-10 rounded-md border border-rose-300 bg-white px-3 py-2 text-xs font-semibold">
                Retry preview
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={active.submitting} onClick={onCancel} className="min-h-11 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-50">Cancel</button>
          <button type="button" disabled={!validation.valid || active.submitting} onClick={onSubmit} className="min-h-11 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {active.submitting ? 'Moving…' : active.attempt?.failed ? 'Retry move' : 'Move booking'}
          </button>
        </div>
      </div>
    </dialog>
  );
}

function PreviewValue({ label, value, unknown = 'Unavailable' }: { label: string; value: number | null; unknown?: string }) {
  return (
    <div className="rounded-lg bg-white px-2 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 font-semibold">{value === null ? unknown : `${value.toFixed(2)} hrs`}</p>
    </div>
  );
}
