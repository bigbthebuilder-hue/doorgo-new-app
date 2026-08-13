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
import { AppShell } from '@/components/app-shell/AppShell';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { buildProtectedAppNavigation } from '@/lib/app-shell/navigation';

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
    <AppShell navigation={buildProtectedAppNavigation(access)} topBar={<ContextTopBar title="Past Schedule" secondary="Review recent past production bookings"/>}>
      <div className="app-workspace app-workspace-fluid">

        <section className="flex min-h-8 flex-wrap items-center gap-x-4 gap-y-1 border-y border-slate-200 bg-white px-2 py-0.5" aria-labelledby="today-summary-heading">
          <h2 id="today-summary-heading" className="text-sm font-semibold">Today · {formatRecoveryDate(today)}</h2>
          <dl className="flex flex-wrap gap-x-4 text-xs"><div className="flex gap-1"><dt className="text-slate-500">Planned</dt><dd className="font-semibold">{hours(capacity.plannedHours)}</dd></div><div className="flex gap-1"><dt className="text-slate-500">Available</dt><dd className="font-semibold">{hours(capacity.availableHours)}</dd></div><div className="flex gap-1"><dt className="text-slate-500">Remaining</dt><dd className="font-semibold">{hours(capacity.remainingHours)}</dd></div>{(capacity.overloadHours ?? 0) > 0 ? <div className="flex gap-1 text-rose-700"><dt>Over</dt><dd className="font-semibold">{hours(capacity.overloadHours)}</dd></div> : null}</dl>
          {capacity.isClosed ? <span className="ml-auto rounded bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-800">Closed</span> : !capacity.capacityKnown ? <span className="ml-auto rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">Capacity unknown</span> : null}
        </section>

        <details className="border-b border-slate-200 bg-white px-2 py-0.5" open={selection.kind === 'search' || selection.kind === 'invalid'}>
          <summary className="flex min-h-6 cursor-pointer items-center text-xs font-semibold">Older dates</summary>
          <form className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]" method="get">
            <label className="grid gap-1 text-xs font-medium" htmlFor="recovery-start">Start date<input className="app-compact-input" id="recovery-start" name="start" type="date" defaultValue={selection.valid && selection.kind === 'search' ? selection.startDate : ''} max={latestSearchDate} required /></label>
            <label className="grid gap-1 text-xs font-medium" htmlFor="recovery-end">End date<input className="app-compact-input" id="recovery-end" name="end" type="date" defaultValue={selection.valid && selection.kind === 'search' ? selection.endDate : ''} max={latestSearchDate} required /></label>
            <button className="app-button app-button-primary self-end" type="submit">Search</button>
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
    </AppShell>
  );
}
