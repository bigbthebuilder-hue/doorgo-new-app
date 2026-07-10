import { ProductionBoardReadOnly } from '@/components/ProductionBoardReadOnly';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';

function addDays(dateText: string, days: number): string {
  const date = new Date(`${dateText}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams?: Promise<{ start?: string; weeks?: string }>;
}) {
  const params = await searchParams;
  const boardStart = params?.start || new Date().toISOString().slice(0, 10);
  const weeks = Number(params?.weeks || 8);
  const boardEndExclusive = addDays(boardStart, weeks * 7);

  const days = await loadProductionBoardReadOnly({
    boardStart,
    boardEndExclusive,
  });

  return <ProductionBoardReadOnly days={days} />;
}