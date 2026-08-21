import type { ProductionBoardCard, ProductionBoardDay } from '../production-board/types';
import { calendarItemLayerKey } from './calendar-items';

export type CalendarLayerKind =
  | 'production'
  | 'delivery'
  | 'customer_pickup'
  | 'note'
  | 'staff_away'
  | 'closure';

export type CalendarLayer = {
  key: string;
  kind: CalendarLayerKind;
  label: string;
  available: boolean;
};

export type CalendarMonthSegment = {
  label: string;
  startColumn: number;
  span: number;
};

const SALESPERSON_COLORS = [
  { background: '#dbeafe', foreground: '#1e3a5f' },
  { background: '#dcfce7', foreground: '#14532d' },
  { background: '#fef3c7', foreground: '#713f12' },
  { background: '#f3e8ff', foreground: '#581c87' },
  { background: '#ffe4e6', foreground: '#881337' },
  { background: '#cffafe', foreground: '#164e63' },
] as const;

export function productionLayerKey(salesperson: string | null): string {
  return `production:${salesperson?.trim().toLocaleLowerCase() || 'unassigned'}`;
}

export function buildCalendarLayers(cards: ProductionBoardCard[]): CalendarLayer[] {
  const identities = new Map<string, string[]>();
  for (const card of cards) {
    if(card.recordKind==='calendar_item')continue;
    const label = card.salesperson?.trim() || 'Unassigned';
    const key = productionLayerKey(label === 'Unassigned' ? null : label);
    identities.set(key, [...(identities.get(key) ?? []), label]);
  }
  const salespeople = Array.from(identities, ([key, labels]) => ({
    key,
    label: stableSalespersonLabel(labels),
  })).sort((left, right) => left.label.localeCompare(right.label));

  return [
    ...salespeople.map((salesperson) => ({
      key: salesperson.key,
      kind: 'production' as const,
      label: salesperson.label,
      available: true,
    })),
    { key: 'fulfillment:delivery', kind: 'delivery', label: 'Deliveries', available: cards.some((card)=>card.calendarItemType==='delivery') },
    { key: 'fulfillment:pickup', kind: 'customer_pickup', label: 'Customer Pickups', available: cards.some((card)=>card.calendarItemType==='customer_pickup') },
    { key: 'other:notes', kind: 'note', label: 'Notes', available: cards.some((card)=>card.calendarItemType==='note') },
    { key: 'other:away', kind: 'staff_away', label: 'Staff Away', available: false },
    { key: 'other:closures', kind: 'closure', label: 'Closures / Special Days', available: false },
  ];
}

function stableSalespersonLabel(labels: string[]): string {
  const selected = [...new Set(labels)].sort((left, right) => {
    const casingScore = (value: string) => value === value.toLocaleUpperCase() ? 2 : value === value.toLocaleLowerCase() ? 1 : 0;
    return casingScore(left) - casingScore(right) || left.localeCompare(right);
  })[0] ?? 'Unassigned';
  if (selected !== selected.toLocaleUpperCase() && selected !== selected.toLocaleLowerCase()) return selected;
  return selected.toLocaleLowerCase().replace(/(^|[\s'-])\p{L}/gu, (letter) => letter.toLocaleUpperCase());
}

export function salespersonColor(salesperson: string | null) {
  const value = salesperson?.trim().toLocaleLowerCase() || 'unassigned';
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return SALESPERSON_COLORS[hash % SALESPERSON_COLORS.length];
}

export function searchCalendarCards(
  cards: ProductionBoardCard[],
  query: string,
  limit = 12,
): ProductionBoardCard[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  return cards.filter((card) =>
    [card.customer, card.title, card.jobId,card.nativeSalesOrder,card.timing,card.details].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery),
    ),
  ).slice(0, limit);
}

export function needsAttentionToolbarModel(cards: ProductionBoardCard[], visibleLayerKeys: string[]) {
  const visibleCards = cards.filter((card) => visibleLayerKeys.includes(calendarItemLayerKey(card)));
  return { count: cards.length, visibleCards, preview: visibleCards[0] ?? null };
}

export function calendarCardText(card:ProductionBoardCard):string {
  if(card.recordKind!=='calendar_item')return calendarProductionCardText(card);
  const name=card.customer?.trim()||card.title?.trim()||'Untitled';
  const order=card.nativeSalesOrder?.trim()||card.jobId?.trim();
  const timing=card.timing?.trim();
  return [name,order,timing].filter(Boolean).join(' · ');
}

export function calendarCardColor(card:ProductionBoardCard){
  if(card.calendarItemType==='delivery')return {background:'#dbeafe',foreground:'#1e3a5f'};
  if(card.calendarItemType==='customer_pickup')return {background:'#ffedd5',foreground:'#7c2d12'};
  if(card.calendarItemType==='note')return {background:'#f3f4f6',foreground:'#374151'};
  return salespersonColor(card.salesperson);
}

export function calendarProductionCardText(card: Pick<
  ProductionBoardCard,
  'customer' | 'jobId' | 'nativeSalesOrder' | 'shopHours' | 'shopHoursKnown' | 'title'
>): string {
  const hours = card.shopHoursKnown ? formatHours(card.shopHours ?? 0) : '◷';
  const customer = card.customer?.trim() || card.title?.trim() || 'Untitled';
  const salesOrder = card.nativeSalesOrder?.trim() || card.jobId?.trim() || 'Unlinked';
  return `${hours} · ${customer} · ${salesOrder}`;
}

export function calendarCapacityLabel(day: Pick<
  ProductionBoardDay,
  'availableHours' | 'capacityKnown' | 'isClosed' | 'missingShopHoursCount' | 'totalKnownShopHours'
>): string {
  if (day.isClosed) return 'CLOSED';
  if (!day.capacityKnown || day.availableHours === null) return 'Capacity TBD';

  const balance = day.availableHours - day.totalKnownShopHours;
  const suffix = day.missingShopHoursCount > 0 ? ` · ${day.missingShopHoursCount} TBD` : '';
  if (balance < 0) return `${formatHours(Math.abs(balance))} over${suffix}`;
  if (balance === 0 && day.missingShopHoursCount === 0) return 'FULL';
  return `${formatHours(balance)} free${suffix}`;
}

export function calendarMonthSegments(dates: string[]): CalendarMonthSegment[] {
  const segments: CalendarMonthSegment[] = [];
  for (const [index, date] of dates.entries()) {
    const label = formatMonth(date);
    const prior = segments.at(-1);
    if (prior?.label === label) prior.span += 1;
    else segments.push({ label, startColumn: index + 1, span: 1 });
  }
  return segments;
}

function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

function formatMonth(dateText: string): string {
  const [year, month, day] = dateText.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
}
