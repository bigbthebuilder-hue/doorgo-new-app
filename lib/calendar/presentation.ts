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
  colorId?: CalendarLayerColorId;
};

export type CalendarMonthSegment = {
  label: string;
  startColumn: number;
  span: number;
};

export const CALENDAR_LAYER_PALETTE = [
  { id: 'sky', label: 'Sky', background: '#bae6fd', foreground: '#0c4a6e' },
  { id: 'cobalt', label: 'Cobalt', background: '#bfdbfe', foreground: '#1e3a8a' },
  { id: 'navy', label: 'Navy', background: '#c7d2fe', foreground: '#172554' },
  { id: 'teal', label: 'Teal', background: '#99f6e4', foreground: '#134e4a' },
  { id: 'turquoise', label: 'Turquoise', background: '#a5f3fc', foreground: '#164e63' },
  { id: 'forest', label: 'Forest', background: '#bbf7d0', foreground: '#14532d' },
  { id: 'emerald', label: 'Emerald', background: '#a7f3d0', foreground: '#064e3b' },
  { id: 'olive', label: 'Olive', background: '#d9f99d', foreground: '#365314' },
  { id: 'mustard', label: 'Mustard', background: '#fde68a', foreground: '#713f12' },
  { id: 'amber', label: 'Amber', background: '#fed7aa', foreground: '#7c2d12' },
  { id: 'rust', label: 'Rust', background: '#fdba74', foreground: '#7c2d12' },
  { id: 'coral', label: 'Coral', background: '#fca5a5', foreground: '#7f1d1d' },
  { id: 'burgundy', label: 'Burgundy', background: '#fecdd3', foreground: '#881337' },
  { id: 'pink', label: 'Pink', background: '#f9a8d4', foreground: '#831843' },
  { id: 'magenta', label: 'Magenta', background: '#f0abfc', foreground: '#701a75' },
  { id: 'purple', label: 'Purple', background: '#d8b4fe', foreground: '#581c87' },
  { id: 'violet', label: 'Violet', background: '#c4b5fd', foreground: '#4c1d95' },
  { id: 'indigo', label: 'Indigo', background: '#a5b4fc', foreground: '#312e81' },
  { id: 'brown', label: 'Brown', background: '#d6b896', foreground: '#422006' },
  { id: 'slate', label: 'Slate', background: '#cbd5e1', foreground: '#334155' },
] as const;
export type CalendarLayerColorId = typeof CALENDAR_LAYER_PALETTE[number]['id'];

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
      colorId: salespersonColorId(salesperson.label),
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
  return layerPaletteColor(salespersonColorId(salesperson));
}

export function salespersonColorId(salesperson: string | null): CalendarLayerColorId {
  const value = salesperson?.trim().toLocaleLowerCase() || 'unassigned';
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return CALENDAR_LAYER_PALETTE[hash % CALENDAR_LAYER_PALETTE.length].id;
}

export function layerPaletteColor(id: CalendarLayerColorId | undefined) {
  return CALENDAR_LAYER_PALETTE.find((color) => color.id === id) ?? CALENDAR_LAYER_PALETTE[0];
}

export function searchCalendarCards(
  cards: ProductionBoardCard[],
  query: string,
  limit = 12,
): ProductionBoardCard[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return [];

  return cards.filter((card) =>
    [card.customer, card.title, card.jobId,card.nativeSalesOrder,card.timing,card.details,...(card.includedOrders??[])].some((value) =>
      value?.toLocaleLowerCase().includes(normalizedQuery),
    ),
  ).sort((left,right)=>searchRelevance(left,normalizedQuery)-searchRelevance(right,normalizedQuery)||searchState(left.productionDate,right.productionDate)||calendarItemTypeLabel(left).localeCompare(calendarItemTypeLabel(right))||left.bookingId.localeCompare(right.bookingId)).slice(0, limit);
}

function searchRelevance(card:ProductionBoardCard,query:string){const values=[card.jobId,card.nativeSalesOrder,card.customer,card.title].map((value)=>value?.trim().toLocaleLowerCase());return values.some((value)=>value===query)?0:1;}
function searchState(left:string|null,right:string|null){if(left===right)return 0;if(left===null)return -1;if(right===null)return 1;return left.localeCompare(right);}
export function calendarItemTypeLabel(card:Pick<ProductionBoardCard,'recordKind'|'calendarItemType'>):string{
  if(card.recordKind!=='calendar_item')return 'Production';
  if(card.calendarItemType==='delivery')return 'Delivery';
  if(card.calendarItemType==='customer_pickup')return 'Pickup';
  return 'Note';
}
export function dedupeCalendarRecords<T extends {bookingId:string}>(records:T[]):T[]{return [...new Map(records.map((record)=>[record.bookingId,record])).values()];}

export function needsAttentionToolbarModel(cards: ProductionBoardCard[], visibleLayerKeys: string[]) {
  const visibleCards = cards.filter((card) => visibleLayerKeys.includes(calendarItemLayerKey(card)));
  return { count: cards.length, visibleCards, preview: visibleCards[0] ?? null };
}

export function calendarCardText(card:ProductionBoardCard):string {
  const identity=calendarCardIdentity(card);
  if(card.recordKind!=='calendar_item')return [card.shopHoursKnown?formatHours(card.shopHours??0):'◷',identity.primary,identity.salesOrder].filter(Boolean).join(' · ');
  return [identity.primary,identity.salesOrder,card.timing?.trim()].filter(Boolean).join(' · ');
}

export function calendarCardIdentity(card:ProductionBoardCard):{primary:string;salesOrder:string|null}{
  const primary=card.customer?.trim()||card.title?.trim()||'Untitled';
  const salesOrder=card.nativeSalesOrder?.trim()||card.jobId?.trim()||null;
  return {primary,salesOrder:salesOrder&&!identityContains(primary,salesOrder)?salesOrder:null};
}

export function calendarExpandedCardMeta(card:ProductionBoardCard):string {
  const identity=calendarCardIdentity(card);
  if(card.recordKind!=='calendar_item') {
    const details=card.details?.trim();
    const title=card.title?.trim();
    const displayed=canonicalIdentity([identity.primary,identity.salesOrder].filter(Boolean).join(' '));
    if(details&&!displayed.includes(canonicalIdentity(details)))return details;
    if(!card.internalJobId&&title&&!displayed.includes(canonicalIdentity(title)))return title;
    return '';
  }
  return [identity.salesOrder,card.timing?.trim()].filter(Boolean).join(' · ');
}

function canonicalIdentity(value:string){return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').trim();}
function identityContains(primary:string,value:string){const normalized=canonicalIdentity(value);const withoutPrefix=normalized.replace(/^so\s+/,'');const displayed=canonicalIdentity(primary);return Boolean(normalized)&&(displayed.includes(normalized)||(withoutPrefix!==normalized&&displayed.includes(withoutPrefix)));}

export function calendarCardColor(card:ProductionBoardCard, layerColorId?:CalendarLayerColorId){
  if(card.calendarItemType==='delivery')return {background:'#dbeafe',foreground:'#1e3a5f'};
  if(card.calendarItemType==='customer_pickup')return {background:'#ede9fe',foreground:'#4c1d95'};
  if(card.calendarItemType==='note')return {background:'#f3f4f6',foreground:'#374151'};
  return layerColorId ? layerPaletteColor(layerColorId) : salespersonColor(card.salesperson);
}

export function calendarProductionCardText(card: Pick<
  ProductionBoardCard,
  'customer' | 'jobId' | 'nativeSalesOrder' | 'shopHours' | 'shopHoursKnown' | 'title'
>): string {
  const hours = card.shopHoursKnown ? formatHours(card.shopHours ?? 0) : '◷';
  const customer = card.customer?.trim() || card.title?.trim() || 'Untitled';
  const salesOrder = card.nativeSalesOrder?.trim() || card.jobId?.trim();
  return [hours,customer,salesOrder&&!identityContains(customer,salesOrder)?salesOrder:null].filter(Boolean).join(' · ');
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
