import type { ProductionBoardCard, ProductionBoardDay, ProductionBoardViewModel } from '../production-board/types';

export function reorderBookingIds(ids: string[], draggedId: string, targetId: string, before: boolean): string[] {
  if (draggedId === targetId || !ids.includes(draggedId) || !ids.includes(targetId)) return ids;
  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  const insertionIndex = before ? targetIndex : targetIndex + 1;
  return [...withoutDragged.slice(0, insertionIndex), draggedId, ...withoutDragged.slice(insertionIndex)];
}

export function reorderCalendarDayLocally(board: ProductionBoardViewModel, date: string, orderedIds: string[]): ProductionBoardViewModel {
  const reorderDays = (days: ProductionBoardDay[]) => days.map((day) => {
    if (day.date !== date) return day;
    const cardsById = new Map(day.cards.map((card) => [card.bookingId, card]));
    if (orderedIds.length !== day.cards.length || orderedIds.some((id) => !cardsById.has(id))) return day;
    return { ...day, cards: orderedIds.map((id, index) => ({ ...cardsById.get(id)!, dayOrder: (index + 1) * 1024 })) };
  });
  return { ...board, days: reorderDays(board.days), weekGroups: board.weekGroups.map((week) => ({ ...week, days: reorderDays(week.days) })) };
}

export function moveCalendarBookingLocally(board: ProductionBoardViewModel, bookingId: string, destinationDate: string): ProductionBoardViewModel {
  const card = board.days.flatMap((day) => day.cards).find((item) => item.bookingId === bookingId);
  if (!card || card.productionDate === destinationDate || !board.days.some((day) => day.date === destinationDate)) return board;
  const updateDays = (days: ProductionBoardDay[]) => days.map((day) => {
    if (day.date !== card.productionDate && day.date !== destinationDate) return day;
    const removing = day.date === card.productionDate;
    const cards = removing
      ? day.cards.filter((item) => item.bookingId !== bookingId)
      : [...day.cards, { ...card, productionDate: destinationDate, dayOrder: Math.max(0, ...day.cards.map((item) => item.dayOrder ?? 0)) + 1024 }];
    return recalculateDay({ ...day, cards }, card, removing ? -1 : 1);
  });
  return { ...board, days: updateDays(board.days), weekGroups: board.weekGroups.map((week) => ({ ...week, days: updateDays(week.days) })) };
}

function recalculateDay(day: ProductionBoardDay, card: ProductionBoardCard, direction: -1 | 1): ProductionBoardDay {
  const totalKnownShopHours = day.totalKnownShopHours + (card.shopHoursKnown ? (card.shopHours ?? 0) * direction : 0);
  const missingShopHoursCount = day.missingShopHoursCount + (card.shopHoursKnown ? 0 : direction);
  const balance = day.capacityKnown && day.availableHours !== null ? day.availableHours - totalKnownShopHours : null;
  return {
    ...day,
    bookingCount: day.cards.length,
    totalKnownShopHours,
    missingShopHoursCount,
    remainingHours: balance === null || missingShopHoursCount > 0 ? null : Math.max(0, balance),
    overloadHours: balance === null || missingShopHoursCount > 0 ? null : Math.max(0, -balance),
  };
}
