import assert from 'node:assert/strict';
import {
  buildCalendarLayers,
  calendarCapacityLabel,
  calendarCardText,
  calendarMonthSegments,
  calendarProductionCardText,
  needsAttentionToolbarModel,
  productionLayerKey,
  searchCalendarCards,
  salespersonColor,
} from './presentation';
import type { ProductionBoardCard } from '../production-board/types';

const card = (salesperson: string | null): ProductionBoardCard => ({
  bookingId: salesperson ?? 'none', type: 'doorgo_linked', typeLabel: 'DoorGo-linked',
  productionDate: '2026-08-17', dayOrder: 1024, title: 'Smith', customer: 'Smith', jobId: '123455',
  calendarId: null, calendarEventId: null, shopHours: 4, shopHoursKnown: true,
  salesperson, source: null, sourceSystem: null, bookingKind: 'production', locked: false,
  completedAt: null,
});

const layers = buildCalendarLayers([card('Alex'), card('Alex'), card(null)]);
assert.deepEqual(layers.filter((layer) => layer.available).map((layer) => layer.label), ['Alex', 'Unassigned']);
assert.equal(layers.some((layer) => layer.kind === 'delivery' && !layer.available), true);
const delivery={...card(null),bookingId:'item:11111111-1111-4111-8111-111111111111',recordKind:'calendar_item' as const,calendarItemType:'delivery' as const,customer:'Hamilton',nativeSalesOrder:'123455',jobId:'123455',timing:'AM',shopHours:null};
assert.equal(buildCalendarLayers([delivery]).find((layer)=>layer.key==='fulfillment:delivery')?.available,true);
assert.equal(calendarCardText(delivery),'Hamilton · 123455 · AM');
assert.deepEqual(searchCalendarCards([{...delivery,productionDate:null}],'AM').map((item)=>item.bookingId),[delivery.bookingId]);
assert.equal(needsAttentionToolbarModel([{...delivery,productionDate:null}],['fulfillment:delivery']).preview?.bookingId,delivery.bookingId);
assert.equal(productionLayerKey(' Alex '), 'production:alex');
assert.deepEqual(salespersonColor('Alex'), salespersonColor('Alex'));
const normalizedLayers = buildCalendarLayers([card('Jerry'), card('JERRY'), card('Steve'), card('STEVE')]).filter((layer) => layer.available);
assert.deepEqual(normalizedLayers.map((layer) => [layer.key, layer.label]), [
  ['production:jerry', 'Jerry'], ['production:steve', 'Steve'],
]);
assert.equal(buildCalendarLayers([card('ALEX')]).find((layer) => layer.available)?.label, 'Alex');
assert.deepEqual(salespersonColor('Jerry'), salespersonColor('JERRY'));

const searchableCards = [
  card('Alex'),
  { ...card('Blair'), bookingId: 'second', customer: 'Jones', title: 'Legacy source title', jobId: 'SO-908' },
];
assert.deepEqual(searchCalendarCards(searchableCards, 'smith').map((item) => item.bookingId), ['Alex']);
assert.deepEqual(searchCalendarCards(searchableCards, '908').map((item) => item.bookingId), ['second']);
assert.deepEqual(searchCalendarCards(searchableCards, 'legacy source').map((item) => item.bookingId), ['second']);
assert.deepEqual(searchCalendarCards(searchableCards, '   '), []);
assert.deepEqual(searchCalendarCards([{ ...card('Aaron'), productionDate: null, customer: 'Needs Customer' }], 'needs').map((item) => item.productionDate), [null]);
const attentionCards=[{...card('Aaron'),bookingId:'first',productionDate:null},{...card('Blair'),bookingId:'second',productionDate:null}];
assert.deepEqual(needsAttentionToolbarModel([], []).count,0);
assert.equal(needsAttentionToolbarModel(attentionCards,[productionLayerKey('Aaron'),productionLayerKey('Blair')]).preview?.bookingId,'first');
const filteredAttention=needsAttentionToolbarModel(attentionCards,[productionLayerKey('Blair')]);
assert.equal(filteredAttention.count,2);assert.deepEqual(filteredAttention.visibleCards.map((item)=>item.bookingId),['second']);

const nativeCard = {
  ...card('Alex'),
  customer: 'Hamilton',
  jobId: 'SO# 1234567',
  nativeSalesOrder: '1234567',
  shopHours: 1,
};
assert.equal(calendarProductionCardText(nativeCard), '1 · Hamilton · 1234567');
assert.equal(calendarProductionCardText(nativeCard).includes('SO# 1234567'), false);
assert.equal(
  calendarProductionCardText({ ...nativeCard, nativeSalesOrder: null }),
  '1 · Hamilton · SO# 1234567',
  'Legacy/imported Sales Order source text remains unchanged without structured native data',
);

assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 0, totalKnownShopHours: 3.25 }), '4.75 free');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 0, totalKnownShopHours: 8 }), 'FULL');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 1, totalKnownShopHours: 9 }), '1 over · 1 TBD');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: true, missingShopHoursCount: 0, totalKnownShopHours: 0 }), 'CLOSED');

assert.deepEqual(calendarMonthSegments(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']), [
  { label: 'August', startColumn: 1, span: 1 },
  { label: 'September', startColumn: 2, span: 4 },
]);

console.log('Calendar presentation tests passed');
