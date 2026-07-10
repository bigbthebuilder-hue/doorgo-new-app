import { ProductionBoardReadOnly } from '@/components/ProductionBoardReadOnly';
import {
  addDaysToDateOnly,
  parseProductionBoardParams,
} from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const { startDate, weeks } = parseProductionBoardParams(params);
  const boardEndExclusive = addDaysToDateOnly(startDate, weeks * 7);

  const board = await loadProductionBoardReadOnly({
    boardStart: startDate,
    boardEndExclusive,
    weeks,
  });

  return <ProductionBoardReadOnly board={board} />;
}