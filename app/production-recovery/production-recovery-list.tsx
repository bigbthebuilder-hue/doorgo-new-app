'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { moveProductionBookingToToday } from '@/lib/production-bookings/production-booking-actions';
import {
  PRODUCTION_RECOVERY_CARRY_WARNING,
  type ProductionRecoveryBooking,
} from '@/lib/production-bookings/production-booking-move-contract';
import {
  canSubmitRecoveryMove,
  commandForRecoveryMoveAttempt,
  formatRecoveryDate,
  PARTLY_COMPLETED_GUIDANCE,
  projectedCapacityMessage,
  recoveryMoveMessage,
  retainCommandForRetry,
  WHOLE_JOB_ACKNOWLEDGEMENT,
  type RecoveryMoveAttempt,
  type TodayProductionSummary,
} from '@/lib/production-bookings/production-recovery-page-contract';

type Props = {
  bookings: ProductionRecoveryBooking[];
  canMove: boolean;
  capacity: TodayProductionSummary;
  today: string;
};

const initialAttempt: RecoveryMoveAttempt = { commandId: null, fingerprint: null };

export function ProductionRecoveryList({ bookings, canMove, capacity, today }: Props) {
  const router = useRouter();
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const attempt = useRef<RecoveryMoveAttempt>(initialAttempt);
  const selected = bookings.find((booking) => booking.bookingId === selectedBookingId) ?? null;

  const openConfirmation = (bookingId: string) => {
    setSelectedBookingId(bookingId);
    setAcknowledged(false);
    setFeedback(null);
    attempt.current = initialAttempt;
  };

  const closeConfirmation = () => {
    if (pending) return;
    setSelectedBookingId(null);
    setAcknowledged(false);
    attempt.current = initialAttempt;
  };

  const submitMove = async () => {
    if (!selected || !canSubmitRecoveryMove(acknowledged, pending)) return;
    const fingerprint = `${selected.bookingId}|${selected.productionDate}`;
    attempt.current = commandForRecoveryMoveAttempt(attempt.current, fingerprint, () => crypto.randomUUID());
    setPending(true);
    setFeedback(null);
    const result = await moveProductionBookingToToday({
      commandId: attempt.current.commandId!,
      bookingId: selected.bookingId,
      expectedProductionDate: selected.productionDate,
      whollyUnstartedAcknowledged: true,
    });
    setPending(false);
    if (!result.ok) {
      setFeedback({ kind: 'error', message: recoveryMoveMessage(result.code) });
      if (!retainCommandForRetry(result.code)) attempt.current = initialAttempt;
      if (['stale_booking', 'already_moved', 'ineligible_booking'].includes(result.code)) router.refresh();
      return;
    }
    attempt.current = initialAttempt;
    setSelectedBookingId(null);
    setAcknowledged(false);
    setFeedback({ kind: 'success', message: `Moved to today. ${PRODUCTION_RECOVERY_CARRY_WARNING}` });
    router.refresh();
  };

  return (
    <section aria-labelledby="past-bookings-heading">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 id="past-bookings-heading" className="text-xl font-semibold">Scheduled bookings</h2><p className="mt-1 text-sm text-slate-600">Newest production date first.</p></div>
        <p className="text-sm text-slate-500">{bookings.length} available</p>
      </div>

      {feedback && (feedback.kind === 'success' || !selected) ? <p className={`mt-4 rounded-xl border p-4 text-sm font-medium ${feedback.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`} aria-live="polite">{feedback.message}</p> : null}

      <div className="mt-4 grid gap-4">
        {bookings.length ? bookings.map((booking) => {
          const capacityMessage = projectedCapacityMessage(capacity, booking.shopHours);
          const isSelected = selectedBookingId === booking.bookingId;
          return (
            <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" key={booking.bookingId}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h3 className="text-lg font-semibold">{booking.displayTitle}</h3><p className="mt-1 text-sm text-slate-600">{formatRecoveryDate(booking.productionDate)}</p></div>
                <p className="rounded-lg bg-slate-100 px-3 py-2 text-lg font-semibold">{booking.shopHours.toFixed(2)} hrs</p>
              </div>
              <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                {booking.salesOrder ? <div><dt className="text-slate-500">Sales order</dt><dd className="font-medium">{booking.salesOrder}</dd></div> : null}
                {booking.bookingOrigin ? <div><dt className="text-slate-500">Booking origin</dt><dd className="font-medium">{booking.bookingOrigin}</dd></div> : null}
              </dl>

              {canMove && !isSelected ? <button className="mt-5 min-h-12 w-full rounded-xl bg-sky-700 px-5 font-semibold text-white sm:w-auto" type="button" onClick={() => openConfirmation(booking.bookingId)}>Move to today</button> : null}

              {canMove && isSelected ? (
                <div className="mt-5 rounded-xl border border-sky-200 bg-sky-50 p-4" role="dialog" aria-labelledby={`move-heading-${booking.bookingId}`}>
                  <h4 className="text-lg font-semibold" id={`move-heading-${booking.bookingId}`}>Confirm move to today</h4>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div><dt className="text-slate-500">Booking</dt><dd className="font-medium">{booking.displayTitle}</dd></div>
                    <div><dt className="text-slate-500">Shop Hours</dt><dd className="font-medium">{booking.shopHours.toFixed(2)} hrs</dd></div>
                    <div><dt className="text-slate-500">Original date</dt><dd className="font-medium">{formatRecoveryDate(booking.productionDate)}</dd></div>
                    <div><dt className="text-slate-500">Destination</dt><dd className="font-medium">Today · {formatRecoveryDate(today)}</dd></div>
                  </dl>
                  <p className={`mt-4 rounded-lg p-3 text-sm ${capacityMessage.tone === 'danger' ? 'bg-rose-100 text-rose-900' : capacityMessage.tone === 'warning' ? 'bg-amber-100 text-amber-950' : 'bg-white text-slate-700'}`}>{capacityMessage.message}</p>
                  <div className="mt-4 space-y-2 rounded-lg bg-white p-3 text-sm text-slate-700"><p>{PARTLY_COMPLETED_GUIDANCE}</p><p className="font-semibold">{PRODUCTION_RECOVERY_CARRY_WARNING}</p></div>
                  <label className="mt-4 flex min-h-12 items-center gap-3 rounded-xl border border-slate-300 bg-white p-3 font-medium"><input className="size-5 shrink-0" type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} disabled={pending} />{WHOLE_JOB_ACKNOWLEDGEMENT}</label>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button className="min-h-12 rounded-xl border border-slate-300 bg-white px-5 font-semibold" type="button" onClick={closeConfirmation} disabled={pending}>Cancel</button>
                    <button className="min-h-12 rounded-xl bg-sky-700 px-5 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50" type="button" onClick={() => void submitMove()} disabled={!canSubmitRecoveryMove(acknowledged, pending)}>{pending ? 'Moving…' : 'Confirm move to today'}</button>
                  </div>
                  {feedback?.kind === 'error' ? <p className="mt-3 text-sm font-medium text-rose-800" aria-live="polite">{feedback.message}</p> : null}
                </div>
              ) : null}
            </article>
          );
        }) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600">No past scheduled bookings are available in this date range.</p>}
      </div>
    </section>
  );
}
