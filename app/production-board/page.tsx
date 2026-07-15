import { ProductionBoardView } from '@/components/ProductionBoardView';
import {
  getCurrentDateInTimeZone,
  parseProductionBoardParams,
} from '@/lib/production-board/date-utils';
import { loadProductionBoardReadOnly } from '@/lib/production-board/queries';

export default async function ProductionBoardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const today = getCurrentDateInTimeZone('America/Vancouver');
  const { startDate, weeks, endDateExclusive } = parseProductionBoardParams(params, today);

  const board = await loadProductionBoardReadOnly({
    boardStart: startDate,
    boardEndExclusive: endDateExclusive,
    weeks,
    today,
  });

  return (
    <ProductionBoardView
      board={board}
      presentation={{ title: 'Production Board', statusLabel: 'Read only' }}
    />
  );
}
