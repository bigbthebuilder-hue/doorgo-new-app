import type { ProductionBoardCard, ProductionBoardDay } from '../production-board/types';

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
  const salespeople = Array.from(
    new Set(cards.map((card) => card.salesperson?.trim() || 'Unassigned')),
  ).sort((left, right) => left.localeCompare(right));

  return [
    ...salespeople.map((salesperson) => ({
      key: productionLayerKey(salesperson === 'Unassigned' ? null : salesperson),
      kind: 'production' as const,
      label: salesperson,
      available: true,
    })),
    { key: 'fulfillment:delivery', kind: 'delivery', label: 'Deliveries', available: false },
    { key: 'fulfillment:pickup', kind: 'customer_pickup', label: 'Customer Pickups', available: false },
    { key: 'other:notes', kind: 'note', label: 'Notes', available: false },
    { key: 'other:away', kind: 'staff_away', label: 'Staff Away', available: false },
    { key: 'other:closures', kind: 'closure', label: 'Closures / Special Days', available: false },
  ];
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
    [card.customer, card.title, card.jobId].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery),
    ),
  ).slice(0, limit);
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
