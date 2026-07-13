import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getPermissionAccess, hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { loadAuthorizedTodayCalculatedCarry } from '@/lib/production-flow/calculated-carry-server';
import { CheckpointReadFailure, loadAuthorizedCheckpointReads } from '@/lib/production-flow/checkpoint-read-service';
import {
  calculateAdjustment, checkpointHistoryStatusLabel, getCheckpointCurrentState, getCheckpointOperations, getVancouverToday,
  RECENT_CHECKPOINT_HISTORY_LIMIT, selectCalculatedCarry, selectCheckpointDate,
  type CheckpointReadItem,
} from '@/lib/production-flow/checkpoint-page-contract';
import { CheckpointOperationForms } from './checkpoint-operation-forms';

const hours = (value: number | null) => value === null ? 'Unavailable' : `${value.toFixed(2)} hrs`;
const friendlyDate = (value: string) => new Intl.DateTimeFormat('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
const recorded = (value: string) => new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Vancouver' }).format(new Date(value));

function HistoryCard({ item, current = false }: { item: CheckpointReadItem; current?: boolean }) {
  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold">Revision {item.revisionNumber} · {checkpointHistoryStatusLabel(item, current)}</p>
        {current ? <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-800">Current</span> : null}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-slate-500">Actual carry</dt><dd className="font-medium">{hours(item.actualOpeningCarryHours)}</dd></div>
        <div><dt className="text-slate-500">Calculated snapshot</dt><dd className="font-medium">{hours(item.calculatedOpeningCarryHours)}</dd></div>
        <div><dt className="text-slate-500">Adjustment</dt><dd className="font-medium">{hours(item.adjustmentHours)}</dd></div>
        <div><dt className="text-slate-500">Recorded</dt><dd className="font-medium">{recorded(item.recordedAt)}</dd></div>
      </dl>
      {item.status === 'removed' && item.removalReason ? <p className="mt-3 text-sm"><span className="font-medium">Reason:</span> {item.removalReason}</p> : item.note ? <p className="mt-3 text-sm"><span className="font-medium">Note:</span> {item.note}</p> : null}
      {item.recordedByDisplayName ? <p className="mt-2 text-xs text-slate-500">Recorded by {item.recordedByDisplayName}</p> : null}
    </article>
  );
}

export default async function ProductionCheckpointsPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'production_checkpoints')) redirect('/account');

  const today = getVancouverToday();
  const query = await searchParams;
  const selection = selectCheckpointDate(query?.date, today);
  let reads: Awaited<ReturnType<typeof loadAuthorizedCheckpointReads>>;
  try {
    reads = await loadAuthorizedCheckpointReads(access, selection.selectedDate, RECENT_CHECKPOINT_HISTORY_LIMIT);
  } catch (error) {
    if (error instanceof CheckpointReadFailure && error.code === 'access_denied') redirect('/account');
    return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900"><div className="mx-auto max-w-2xl rounded-2xl border bg-white p-6"><h1 className="text-2xl font-semibold">Production Carry Checkpoint</h1><p className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">Checkpoint information is temporarily unavailable. Please try again.</p></div></main>;
  }

  const live = selection.selectedDate === today ? await loadAuthorizedTodayCalculatedCarry(access, today) : { calculatedCarryHours: null };
  const calculatedCarry = selectCalculatedCarry({ selectedDate: selection.selectedDate, today, revisions: reads.revisions, liveCarry: live.calculatedCarryHours });
  const state = getCheckpointCurrentState(reads.revisions);
  const actualCarry = state.current?.actualOpeningCarryHours ?? null;
  const adjustment = calculateAdjustment(actualCarry, calculatedCarry);
  const operations = getCheckpointOperations(getPermissionAccess(access, 'production_checkpoints'), state);
  const recentGroups = Map.groupBy(reads.recent, (item) => item.productionDate);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <header>
          <div className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold sm:text-3xl">Production Carry Checkpoint</h1><p className="mt-2 text-sm text-slate-600">Record the actual unfinished shop hours carrying into the selected day.</p></div><nav className="flex flex-wrap gap-2" aria-label="Checkpoint navigation"><Link className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium" href="/production-board">Production Board</Link><Link className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium" href="/account">Account</Link></nav></div>
        </header>

        <form className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" method="get">
          <label className="grid gap-2 font-medium" htmlFor="checkpoint-date">Production date</label>
          <div className="mt-2 grid gap-3 sm:grid-cols-[1fr_auto]"><input className="min-h-12 rounded-xl border border-slate-300 px-3 text-lg focus:border-sky-600 focus:outline-none focus:ring-2 focus:ring-sky-200" id="checkpoint-date" name="date" type="date" defaultValue={selection.selectedDate} max={today} required/><button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white" type="submit">View date</button></div>
          {selection.message ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900" role="status">{selection.message}</p> : null}
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="selected-date-heading">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected production date</p><h2 id="selected-date-heading" className="mt-1 text-xl font-semibold">{friendlyDate(selection.selectedDate)}</h2></div>{state.kind === 'removed' ? <span className="rounded-full bg-rose-100 px-3 py-1 text-sm font-semibold text-rose-800">Removed</span> : state.kind === 'confirmed' ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800">Confirmed</span> : <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">No checkpoint</span>}</div>
          {selection.selectedDate < today && reads.revisions.length ? <p className="mt-3 text-xs text-slate-500">Calculated carry is the calculation recorded with this checkpoint.</p> : null}
          <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Calculated carry</dt><dd className="mt-1 text-xl font-semibold">{hours(calculatedCarry)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Actual carry</dt><dd className="mt-1 text-xl font-semibold">{hours(actualCarry)}</dd></div>
            <div className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-500">Adjustment</dt><dd className="mt-1 text-xl font-semibold">{hours(adjustment)}</dd></div>
          </dl>
          {state.current?.note ? <p className="mt-4 text-sm"><span className="font-medium">Note:</span> {state.current.note}</p> : null}
          {state.kind === 'removed' && state.current.removalReason ? <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-900"><span className="font-medium">Removal reason:</span> {state.current.removalReason}</p> : null}
          {state.current ? <p className="mt-3 text-xs text-slate-500">Recorded {recorded(state.current.recordedAt)}{state.current.recordedByDisplayName ? ` by ${state.current.recordedByDisplayName}` : ''}</p> : <p className="mt-4 text-sm text-slate-600">No checkpoint has been recorded for this date.</p>}
        </section>

        {operations.length ? <CheckpointOperationForms state={state} productionDate={selection.selectedDate} calculatedCarryHours={calculatedCarry} /> : null}

        <section aria-labelledby="revision-history-heading"><h2 id="revision-history-heading" className="text-xl font-semibold">Selected-date history</h2><div className="mt-3 grid gap-3">{reads.revisions.length ? reads.revisions.map((item, index) => <HistoryCard key={item.checkpointId} item={item} current={index === 0}/>) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No history for this date.</p>}</div></section>

        <section aria-labelledby="recent-history-heading"><h2 id="recent-history-heading" className="text-xl font-semibold">Recent history</h2><div className="mt-3 space-y-5">{reads.recent.length ? Array.from(recentGroups, ([date, items]) => <div key={date}><h3 className="mb-2 font-semibold">{friendlyDate(date)}</h3><div className="grid gap-3">{items.map((item, index) => <HistoryCard key={item.checkpointId} item={item} current={index === 0}/>)}</div></div>) : <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">No recent checkpoint history.</p>}</div></section>
      </div>
    </main>
  );
}
