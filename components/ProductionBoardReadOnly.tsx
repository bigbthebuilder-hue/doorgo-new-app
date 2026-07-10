import { ProductionBoardDay } from '@/components/ProductionBoardDay';
import { ProductionBoardSummary } from '@/components/ProductionBoardSummary';
import type { ProductionBoardViewModel } from '@/lib/production-board/types';

export function ProductionBoardReadOnly({ board }: { board: ProductionBoardViewModel }) {
  if (!board.days.length) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-6">
          <ProductionBoardSummary board={board} />
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">No bookings in this window</h2>
            <p className="mt-2 text-sm text-slate-600">
              There are no production bookings for the selected date range.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <ProductionBoardSummary board={board} />
        <div className="grid gap-4">
          {board.days.map((day) => (
            <ProductionBoardDay key={day.date} day={day} />
          ))}
        </div>
      </div>
    </main>
  );
}