import assert from 'node:assert/strict';
import {
  buildCalendarLayers,
  calendarCapacityLabel,
  calendarCardText,
  calendarCardIdentity,
  calendarExpandedCardMeta,
  calendarItemTypeLabel,
  calendarMonthSegments,
  calendarProductionCardText,
  needsAttentionToolbarModel,
  productionLayerKey,
  searchCalendarCards,
  dedupeCalendarRecords,
  salespersonColor,
  CALENDAR_LAYER_PALETTE,
  layerPaletteColor,
  calendarCardColor,
  PERMANENT_CALENDAR_LAYER_DEFAULTS,
  normalizeCalendarLayerColors,
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
for(const key of ['fulfillment:delivery','fulfillment:pickup','other:notes','other:away','other:closures'])assert.ok(buildCalendarLayers([]).find((layer)=>layer.key===key)?.colorId);
assert.deepEqual(calendarCardColor(delivery),layerPaletteColor(PERMANENT_CALENDAR_LAYER_DEFAULTS['fulfillment:delivery']));
assert.deepEqual(calendarCardColor(delivery,'brown'),layerPaletteColor('brown'),'current viewer preference recolors existing Delivery cards');
assert.equal(calendarCardText({...delivery,includedOrders:['123455','123456','123457']}),'Hamilton · 123455 · AM');
assert.deepEqual(searchCalendarCards([{...delivery,includedOrders:['123455','123456']}],'123456').map((item)=>item.bookingId),[delivery.bookingId]);
assert.equal(calendarCardText(delivery),'Hamilton · 123455 · AM');
assert.equal(calendarExpandedCardMeta(delivery),'123455 · AM');
const pickup={...delivery,bookingId:'item:22222222-2222-4222-8222-222222222222',calendarItemType:'customer_pickup' as const};
const note={...delivery,bookingId:'item:33333333-3333-4333-8333-333333333333',calendarItemType:'note' as const,customer:null,title:'Check if this works',jobId:null,nativeSalesOrder:null,timing:null};
assert.notDeepEqual(calendarCardColor(delivery),calendarCardColor(pickup));
assert.notDeepEqual(calendarCardColor(pickup),calendarCardColor(note));
assert.equal(calendarItemTypeLabel(card('Alex')),'Production');assert.equal(calendarItemTypeLabel(delivery),'Delivery');assert.equal(calendarItemTypeLabel(pickup),'Pickup');assert.equal(calendarItemTypeLabel(note),'Note');
assert.deepEqual(dedupeCalendarRecords([delivery,delivery,pickup]).map((item)=>item.bookingId),[delivery.bookingId,pickup.bookingId]);
assert.equal(dedupeCalendarRecords([card('Alex'),delivery]).length,2,'distinct Production and fulfillment records remain distinct');
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
assert.equal(CALENDAR_LAYER_PALETTE.length,20);
assert.equal(new Set(CALENDAR_LAYER_PALETTE.map((color)=>color.id)).size,CALENDAR_LAYER_PALETTE.length);
assert.equal(CALENDAR_LAYER_PALETTE.some((color)=>['#ecfdf5','#fef9c3','#fee2e2','#f1f5f9','#f8fafc'].includes(color.background)),false);
assert.equal(CALENDAR_LAYER_PALETTE.every((color)=>color.foreground.length===7),true);
for(const stableId of ['sky','navy','purple','violet','indigo','pink','magenta','slate'])assert.equal(CALENDAR_LAYER_PALETTE.some((color)=>color.id===stableId),true);
assert.deepEqual(layerPaletteColor('purple'),CALENDAR_LAYER_PALETTE.find((color)=>color.id==='purple'));
assert.deepEqual(normalizeCalendarLayerColors({'production:alex':'purple','fulfillment:delivery':'brown','other:notes':'invalid'}),{'production:alex':'purple','fulfillment:delivery':'brown'},'reload preserves existing Production and new layer choices while rejecting invalid palette IDs');

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
assert.equal(calendarExpandedCardMeta({...nativeCard,title:'Hamilton 1234567'}),'');
assert.equal(calendarExpandedCardMeta({...nativeCard,title:'Hamilton 1234567',details:'Hardware staged'}),'Hardware staged');
assert.deepEqual(calendarCardIdentity({...nativeCard,title:'1 Hamilton 1234567'}),{primary:'Hamilton',salesOrder:'1234567'});
assert.equal(calendarExpandedCardMeta({...nativeCard,internalJobId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',title:'1 Hamilton 1234567'}),'','native raw title never repeats structured identity');
assert.equal(
  calendarProductionCardText({ ...nativeCard, nativeSalesOrder: null }),
  '1 · Hamilton · SO# 1234567',
  'Legacy/imported Sales Order source text remains unchanged without structured native data',
);

const manualDelivery={...delivery,type:'biztrack_only' as const,typeLabel:'BizTrack-only' as const,internalJobId:null,customer:'new glass test',title:'new glass test',nativeSalesOrder:'1234567',jobId:'1234567',timing:null};
assert.deepEqual(calendarCardIdentity(manualDelivery),{primary:'new glass test',salesOrder:'1234567'});
assert.equal(calendarCardText(manualDelivery),'new glass test · 1234567');
assert.equal(calendarCardText({...manualDelivery,nativeSalesOrder:null,jobId:null}),'new glass test');
const manualPickup={...manualDelivery,calendarItemType:'customer_pickup' as const,customer:'Warehouse pickup',title:'Warehouse pickup'};
assert.equal(calendarCardText({...manualPickup,nativeSalesOrder:null,jobId:null}),'Warehouse pickup');
const manualProduction={...card('Alex'),type:'biztrack_only' as const,typeLabel:'BizTrack-only' as const,bookingId:'manual-11111111-1111-4111-8111-111111111111',sourceSystem:'doorgo_native',customer:null,title:'Custom door repair',nativeSalesOrder:null,jobId:'1234567',shopHours:2};
assert.equal(calendarProductionCardText(manualProduction),'2 · Custom door repair · 1234567');
assert.equal(calendarProductionCardText({...manualProduction,jobId:null}),'2 · Custom door repair');
assert.equal(calendarCardText(note),'Check if this works');
assert.equal(calendarExpandedCardMeta(note),'');
assert.equal(calendarCardText({...manualDelivery,customer:'new glass test 1234567'}),'new glass test 1234567','SO already in a manual title is not repeated');
assert.equal(calendarProductionCardText({...manualProduction,title:'Custom door repair 1234567'}),'2 · Custom door repair 1234567');
assert.equal(calendarProductionCardText({...manualProduction,title:'Custom door repair 1234567',jobId:'SO# 1234567'}),'2 · Custom door repair 1234567','obvious legacy SO prefix duplication is suppressed');

assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 0, totalKnownShopHours: 3.25 }), '4.75 free');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 0, totalKnownShopHours: 8 }), 'FULL');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: false, missingShopHoursCount: 1, totalKnownShopHours: 9 }), '1 over · 1 TBD');
assert.equal(calendarCapacityLabel({ availableHours: 8, capacityKnown: true, isClosed: true, missingShopHoursCount: 0, totalKnownShopHours: 0 }), 'CLOSED');

assert.deepEqual(calendarMonthSegments(['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04']), [
  { label: 'August', startColumn: 1, span: 1 },
  { label: 'September', startColumn: 2, span: 4 },
]);

console.log('Calendar presentation tests passed');
