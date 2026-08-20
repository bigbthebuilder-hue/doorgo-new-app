import assert from 'node:assert/strict';
import {
  buildCalendarLayers,
  calendarCapacityLabel,
  calendarMonthSegments,
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
assert.equal(productionLayerKey(' Alex '), 'production:alex');
assert.deepEqual(salespersonColor('Alex'), salespersonColor('Alex'));

const searchableCards = [
  card('Alex'),
  { ...card('Blair'), bookingId: 'second', customer: 'Jones', title: 'Legacy source title', jobId: 'SO-908' },
];
assert.deepEqual(searchCalendarCards(searchableCards, 'smith').map((item) => item.bookingId), ['Alex']);
assert.deepEqual(searchCalendarCards(searchableCards, '908').map((item) => item.bookingId), ['second']);
assert.deepEqual(searchCalendarCards(searchableCards, 'legacy source').map((item) => item.bookingId), ['second']);
assert.deepEqual(searchCalendarCards(searchableCards, '   '), []);

assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 0, totalKnownShopHours: 3.25 }), '4.75 free');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 0, totalKnownShopHours: 8 }), 'FULL');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 1, totalKnownShopHours: 9 }), '1 over · 1 TBD');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: true, missingShopHoursCount: 0, totalKnownShopHours: 0 }), 'CLOSED');

assert.deepEqual(calendarMonthSegments(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']), [
  { label: 'August', startColumn: 1, span: 1 },
  { label: 'September', startColumn: 2, span: 4 },
]);

console.log('Calendar presentation tests passed');
