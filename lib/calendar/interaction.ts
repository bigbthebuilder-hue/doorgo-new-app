import type { ProductionBoardCard, ProductionBoardDay, ProductionBoardViewModel } from '../production-board/types';

export type ExpandedCalendarInteraction = { collapse: boolean; consume: boolean; interact: boolean };
export type CalendarViewportAnchor = { top: number };

export function viewportAnchorAdjustment(before: CalendarViewportAnchor, after: CalendarViewportAnchor): number {
  return after.top - before.top;
}
export function needsAttentionDismissal(target:'inside'|'toolbar'|'calendar') {
  return { close: target !== 'inside', consume: target === 'calendar' };
}

export function resolveExpandedCalendarInteraction(
  expandedDate: string | null,
  target: { kind: 'toolbar' } | { kind: 'day'; date: string; interactiveChild: boolean },
): ExpandedCalendarInteraction {
  if (!expandedDate) return { collapse: false, consume: false, interact: true };
  if (target.kind === 'toolbar') return { collapse: true, consume: false, interact: true };
  if (target.date !== expandedDate) return { collapse: true, consume: false, interact: true };
  if (target.interactiveChild) return { collapse: false, consume: false, interact: true };
  return { collapse: true, consume: true, interact: false };
}

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
    return { ...day, cards: orderedIds.map((id, index) => {const card=cardsById.get(id)!;return {...card,dayOrder:(index+1)*1024,revision:card.recordKind==='calendar_item'?(card.revision??0)+1:card.revision};}) };
  });
  return { ...board, days: reorderDays(board.days), weekGroups: board.weekGroups.map((week) => ({ ...week, days: reorderDays(week.days) })) };
}

export function insertCalendarCardLocally(board:ProductionBoardViewModel,card:ProductionBoardCard):ProductionBoardViewModel{
  const prior=[...board.needsAttentionCards,...board.days.flatMap((day)=>day.cards)].find((item)=>item.bookingId===card.bookingId);
  const needsAttentionCards=board.needsAttentionCards.filter((item)=>item.bookingId!==card.bookingId);
  if(card.productionDate===null)return {...board,needsAttentionCards:[...needsAttentionCards,card].sort(cardOrder)};
  const update=(days:ProductionBoardDay[])=>days.map((day)=>{const existing=day.cards.find((item)=>item.bookingId===card.bookingId);if(day.date!==card.productionDate&&!existing)return day;const cards=day.cards.filter((item)=>item.bookingId!==card.bookingId);if(day.date===card.productionDate)cards.push(card);const next={...day,cards:cards.sort(cardOrder),bookingCount:cards.length};if((prior??card).recordKind==='calendar_item')return next;let recalculated=day;if(existing)recalculated=recalculateDay({...recalculated,cards:day.cards.filter((item)=>item.bookingId!==card.bookingId)},existing,-1);if(day.date===card.productionDate)recalculated=recalculateDay({...recalculated,cards},card,1);return {...recalculated,cards,bookingCount:cards.length};});
  return {...board,needsAttentionCards,days:update(board.days),weekGroups:board.weekGroups.map((week)=>({...week,days:update(week.days)}))};
}
const cardOrder=(left:ProductionBoardCard,right:ProductionBoardCard)=>(left.dayOrder??0)-(right.dayOrder??0)||left.bookingId.localeCompare(right.bookingId);

export function moveCalendarBookingLocally(board: ProductionBoardViewModel, bookingId: string, destinationDate: string): ProductionBoardViewModel {
  const card = [...board.days.flatMap((day) => day.cards), ...board.needsAttentionCards].find((item) => item.bookingId === bookingId);
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

export function placeCalendarBookingLocally(board: ProductionBoardViewModel, bookingId: string, destinationDate: string | null): ProductionBoardViewModel {
  const all = [...board.days.flatMap((day) => day.cards), ...board.needsAttentionCards];
  const card = all.find((item) => item.bookingId === bookingId);
  if (!card || card.productionDate === destinationDate) return board;
  const movedCard={...card,productionDate:destinationDate,revision:card.recordKind==='calendar_item'?(card.revision??0)+1:card.revision};
  const withoutNeeds = board.needsAttentionCards.filter((item) => item.bookingId !== bookingId);
  const needsAttentionCards = destinationDate === null
    ? [...withoutNeeds,{ ...movedCard, dayOrder: Math.max(0, ...withoutNeeds.map((item) => item.dayOrder ?? 0)) + 1024 }]
    : withoutNeeds;
  const updateDays = (days: ProductionBoardDay[]) => days.map((day) => {
    if (day.date !== card.productionDate && day.date !== destinationDate) return day;
    const removing = day.date === card.productionDate;
    const cards = removing ? day.cards.filter((item) => item.bookingId !== bookingId)
      : [...day.cards, { ...movedCard, dayOrder: Math.max(0, ...day.cards.map((item) => item.dayOrder ?? 0)) + 1024 }];
    return recalculateDay({ ...day, cards }, card, removing ? -1 : 1);
  });
  return { ...board, needsAttentionCards, days: updateDays(board.days), weekGroups: board.weekGroups.map((week) => ({ ...week, days: updateDays(week.days) })) };
}

export function getCalendarMoveRequirements(_sourceDate: string, _destinationDate: string, _today: string, destinationClosed: boolean) {
  return { requiresClosedOverride: destinationClosed };
}

export function clampCalendarDetailPosition(
  position: { x: number; y: number },
  panel: { width: number; height: number },
  workspace: { left: number; top: number; right: number; bottom: number },
  viewport: { width: number; height: number },
  inset = 8,
) {
  const left = Math.max(workspace.left, 0) + inset;
  const top = Math.max(workspace.top, 0) + inset;
  const right = Math.min(workspace.right, viewport.width) - inset;
  const bottom = Math.min(workspace.bottom, viewport.height) - inset;
  return {
    x: Math.min(Math.max(position.x, left), Math.max(left, right - panel.width)),
    y: Math.min(Math.max(position.y, top), Math.max(top, bottom - panel.height)),
  };
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
