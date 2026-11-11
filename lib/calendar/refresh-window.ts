import type { ProductionBoardViewModel } from '../production-board/types';

// Replace complete weeks, including newly exposed Saturdays and removed exceptions.
// Remove moved records from cached dates so a remote move never leaves two cards.
export function mergeRefreshedCalendarWindow(current: ProductionBoardViewModel, incoming: ProductionBoardViewModel): ProductionBoardViewModel {
  const freshIds = new Set([...incoming.days.flatMap(day=>day.cards),...incoming.needsAttentionCards].map(card=>card.bookingId));
  const cleanDay = (day: ProductionBoardViewModel['days'][number]) => ({...day,cards:day.cards.filter(card=>!freshIds.has(card.bookingId))});
  const outside = (date:string) => date < incoming.startDate || date >= incoming.endDateExclusive;
  const days = [...current.days.filter(day=>outside(day.date)).map(cleanDay),...incoming.days].sort((a,b)=>a.date.localeCompare(b.date));
  const weekGroups = [...current.weekGroups.filter(week=>outside(week.startDate)).map(week=>({...week,days:week.days.map(cleanDay)})),...incoming.weekGroups].sort((a,b)=>a.startDate.localeCompare(b.startDate)).map((week,weekIndex)=>({...week,weekIndex}));
  return {...current,days,weekGroups,needsAttentionCards:incoming.needsAttentionCards,staffAwayRoster:incoming.staffAwayRoster};
}
