import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import {
  ProductionRecoveryReadFailure,
  loadAuthorizedRecentProductionRecoveryBookings,
} from '@/lib/production-bookings/production-booking-service';
import { getVancouverDate } from '@/lib/production-bookings/production-booking-move-contract';
import { loadAuthorizedTodayProductionSummary } from '@/lib/production-bookings/production-recovery-capacity-server';
import { addDaysToDateOnly } from '@/lib/production-board/date-utils';
import {
  formatRecoveryDate,
  PRODUCTION_RECOVERY_LIMIT,
  selectRecoveryDateRange,
} from '@/lib/production-bookings/production-recovery-page-contract';
import { ProductionRecoveryList } from './production-recovery-list';

const hours = (value: number | null) => value === null ? 'Unavailable' : `${value.toFixed(2)} hrs`;

export default async function ProductionRecoveryPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'production')) redirect('/account');

  const today = getVancouverDate();
  const latestSearchDate = addDaysToDateOnly(today, -1);
  const selection = selectRecoveryDateRange(await searchParams, today);
  let bookings: Awaited<ReturnType<typeof loadAuthorizedRecentProductionRecoveryBookings>> = [];
  let readMessage: string | null = null;
  if (selection.valid) {
    try {
      bookings = await loadAuthorizedRecentProductionRecoveryBookings(access, {
        startDate: selection.startDate,
        endDate: selection.endDate,
        limit: PRODUCTION_RECOVERY_LIMIT,
      });
      if (selection.businessDates) {
        const allowed = new Set(selection.businessDates);
        bookings = bookings.filter((booking) => allowed.has(booking.productionDate));
      }
    } catch (error) {
      if (error instanceof ProductionRecoveryReadFailure && error.code === 'access_denied') redirect('/account');
      readMessage = 'Past scheduled bookings are temporarily unavailable. Please try again.';
    }
  }

  const capacity = await loadAuthorizedTodayProductionSummary(access, today);
  const productionAccess = getPermissionAccess(access, 'production');

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold sm:text-3xl">Past Scheduled Bookings</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Review recent past production bookings. DoorGo does not automatically know whether work was started.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2" aria-label="Production recovery navigation">
            <Link className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium" href="/production-board">Production Board</Link>
            {hasAtLeastView(access, 'production_checkpoints') ? <Link className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium" href="/production-checkpoints">Production Carry Checkpoint</Link> : null}
            <Link className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium" href="/account">Account</Link>
          </nav>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="today-summary-heading">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today in America/Vancouver</p><h2 id="today-summary-heading" className="mt-1 text-lg font-semibold">{formatRecoveryDate(today)}</h2></div>
            {capacity.isClosed ? <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800">Closed</span> : !capacity.capacityKnown ? <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-900">Capacity unknown</span> : null}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Planned</dt><dd className="mt-1 font-semibold">{hours(capacity.plannedHours)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Available</dt><dd className="mt-1 font-semibold">{hours(capacity.availableHours)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Remaining</dt><dd className="mt-1 font-semibold">{hours(capacity.remainingHours)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Over</dt><dd className="mt-1 font-semibold">{hours(capacity.overloadHours)}</dd></div>
          </dl>
        </section>

        <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" open={selection.kind === 'search' || selection.kind === 'invalid'}>
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Older dates</summary>
          <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get">
            <label className="grid gap-1 text-sm font-medium" htmlFor="recovery-start">Start date<input className="min-h-12 rounded-xl border border-slate-300 px-3 text-base" id="recovery-start" name="start" type="date" defaultValue={selection.valid && selection.kind === 'search' ? selection.startDate : ''} max={latestSearchDate} required /></label>
            <label className="grid gap-1 text-sm font-medium" htmlFor="recovery-end">End date<input className="min-h-12 rounded-xl border border-slate-300 px-3 text-base" id="recovery-end" name="end" type="date" defaultValue={selection.valid && selection.kind === 'search' ? selection.endDate : ''} max={latestSearchDate} required /></label>
            <button className="min-h-12 self-end rounded-xl bg-slate-900 px-5 font-semibold text-white" type="submit">Search</button>
          </form>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-slate-500">Both dates are required. Maximum range: 93 days. Today is not included.</p><Link className="font-medium text-sky-700" href="/production-recovery">Return to previous five business days</Link></div>
        </details>

        {!selection.valid ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900" role="alert">{selection.message}</p> : null}
        {readMessage ? <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900" role="alert">{readMessage}</p> : null}

        {productionAccess === 'view' ? <p className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">You have view-only production access.</p> : null}

        {selection.valid && !readMessage ? (
          <ProductionRecoveryList bookings={bookings} canMove={productionAccess === 'use'} capacity={capacity} today={today} />
        ) : null}
      </div>
    </main>
  );
}
