import assert from 'node:assert/strict';
import { clampCalendarDetailPosition, getCalendarMoveRequirements, insertCalendarCardLocally, isActiveCalendarDragOrigin, moveCalendarBookingLocally, needsAttentionDismissal, placeCalendarBookingLocally, reorderBookingIds, reorderCalendarDayLocally, resolveExpandedCalendarInteraction, viewportAnchorAdjustment } from './interaction';
import type { ProductionBoardCard, ProductionBoardDay, ProductionBoardViewModel } from '../production-board/types';

assert.deepEqual(reorderBookingIds(['a', 'b', 'c'], 'c', 'a', true), ['c', 'a', 'b']);
assert.deepEqual(reorderBookingIds(['a', 'b', 'c'], 'a', 'b', false), ['b', 'a', 'c']);

const card = (bookingId: string, productionDate: string, hours: number, completed = false): ProductionBoardCard => ({ bookingId, productionDate, dayOrder: 1024, shopHours: hours, shopHoursKnown: true, completedAt: completed ? '2026-08-20T12:00:00Z' : null, type: 'doorgo_linked', typeLabel: 'DoorGo-linked', title: bookingId, customer: bookingId, jobId: bookingId, calendarId: null, calendarEventId: null, salesperson: 'Alex', source: null, sourceSystem: null, bookingKind: 'production', locked: false });
const day = (date: string, cards: ProductionBoardCard[]): ProductionBoardDay => ({ date, cards, dateState: 'future', totalKnownShopHours: cards.reduce((sum, item) => sum + (item.shopHours ?? 0), 0), bookingCount: cards.length, missingShopHoursCount: 0, availableHours: 8, staffCapacityHours: 8, deductionHours: 0, capacitySource: 'calculated', capacityKnown: true, isClosed: false, isExplicitlyClosed: false, capacityNotes: null, remainingHours: 8 - cards.reduce((sum, item) => sum + (item.shopHours ?? 0), 0), overloadHours: 0, plannedStarts: null, plannedStartsKnown: false, openingCarryIn: null, openingCarryKnown: false, calculatedOpeningCarry: null, actualOpeningCarry: null, authoritativeOpeningCarry: null, adjustmentHours: null, hasActualCarryCheckpoint: false, checkpointId: null, checkpointProductionDate: null, checkpointRevisionNumber: null, checkpointRecordedAt: null, checkpointRecordedByUserId: null, checkpointConfirmedAt: null, checkpointConfirmedByUserId: null, checkpointActorType: null, checkpointSourceSystem: null, checkpointNote: null, checkpointCalculationVersion: null, flowLoad: null, endingCarryOut: null, openFlowCapacity: null, flowStatus: 'unresolved', flowUnresolvedReason: 'unknown_capacity', weekendBookingException: false });
const first = card('a', '2026-08-24', 3);
const completed = card('b', '2026-08-24', 2, true);
const secondDay = card('c', '2026-08-25', 4);
const days = [day('2026-08-24', [first, completed]), day('2026-08-25', [secondDay])];
const board = { startDate: '2026-08-24', endDateExclusive: '2026-08-31', visibleWeekdayEndExclusive: '2026-08-29', weeks: 1, days, needsAttentionCards: [], weekGroups: [{ days }] } as unknown as ProductionBoardViewModel;
const newNote={...card('item:note','',0),recordKind:'calendar_item' as const,calendarItemType:'note' as const,productionDate:null,dayOrder:2048,shopHours:null,shopHoursKnown:true};
const withNote=insertCalendarCardLocally(board,newNote);assert.equal(withNote.needsAttentionCards[0].bookingId,'item:note');
const attentionProduction={...first,productionDate:null};const attentionBoard={...board,needsAttentionCards:[attentionProduction]} as ProductionBoardViewModel;const scheduledFromAttention=insertCalendarCardLocally(attentionBoard,{...attentionProduction,productionDate:'2026-08-25',dayOrder:4096});assert.equal(scheduledFromAttention.needsAttentionCards.length,0);assert.equal(scheduledFromAttention.days[1].cards.at(-1)?.bookingId,'a');assert.equal(scheduledFromAttention.days[1].remainingHours,1);
const reassigned=insertCalendarCardLocally(board,{...first,productionDate:'2026-08-25',dayOrder:4096});assert.deepEqual(reassigned.days[0].cards.map((item)=>item.bookingId),['b']);assert.deepEqual(reassigned.days[1].cards.map((item)=>item.bookingId),['c','a']);assert.equal(reassigned.days[0].remainingHours,6);assert.equal(reassigned.days[1].remainingHours,1);
const newDelivery={...newNote,bookingId:'item:delivery',calendarItemType:'delivery' as const,productionDate:'2026-08-25',dayOrder:4096};const withDelivery=insertCalendarCardLocally(board,newDelivery);assert.equal(withDelivery.days[1].cards.at(-1)?.bookingId,'item:delivery');assert.equal(withDelivery.days[1].totalKnownShopHours,4);
const newProduction={...first,bookingId:'new-production',dayOrder:4096,shopHours:2};const withProduction=insertCalendarCardLocally(board,newProduction);assert.equal(withProduction.days[0].totalKnownShopHours,7);assert.equal(withProduction.days[0].remainingHours,1);
const reordered = reorderCalendarDayLocally(board, '2026-08-24', ['b', 'a']);
assert.deepEqual(reordered.days[0].cards.map((item) => item.bookingId), ['b', 'a']);
assert.equal(reordered.days[0].cards[0].completedAt, completed.completedAt);
const moved = moveCalendarBookingLocally(board, 'a', '2026-08-25');
assert.deepEqual(moved.days[1].cards.map((item) => item.bookingId), ['c', 'a']);
assert.equal(moved.days[0].remainingHours, 6);
assert.equal(moved.days[1].remainingHours, 1);

const movedSecond = moveCalendarBookingLocally(board, 'b', '2026-08-25');
assert.deepEqual(movedSecond.days[1].cards.map((item) => item.bookingId), ['c', 'b']);
const movedBack = moveCalendarBookingLocally(moved, 'a', '2026-08-24');
assert.deepEqual(movedBack.days[0].cards.map((item) => item.bookingId), ['b', 'a']);
const successive = moveCalendarBookingLocally(moveCalendarBookingLocally(board, 'a', '2026-08-25'), 'b', '2026-08-25');
assert.deepEqual(successive.days[1].cards.map((item) => item.bookingId), ['c', 'a', 'b']);
const needsAttention = placeCalendarBookingLocally(board, 'a', null);
assert.deepEqual(needsAttention.needsAttentionCards.map((item) => item.bookingId), ['a']);
assert.equal(needsAttention.days[0].remainingHours, 6);
const scheduledAgain = placeCalendarBookingLocally(needsAttention, 'a', '2026-08-25');
assert.deepEqual(scheduledAgain.days[1].cards.map((item) => item.bookingId), ['c', 'a']);
assert.equal(scheduledAgain.days[1].remainingHours, 1);
const pile={...needsAttention,needsAttentionCards:[{...first,productionDate:null},{...completed,productionDate:null,completedAt:null}]} as ProductionBoardViewModel;
assert.equal(placeCalendarBookingLocally(pile,'a','2026-08-25').needsAttentionCards[0].bookingId,'b');
assert.deepEqual(needsAttentionDismissal('calendar'),{close:true,consume:true});
assert.deepEqual(needsAttentionDismissal('toolbar'),{close:true,consume:false});
assert.deepEqual(needsAttentionDismissal('inside'),{close:false,consume:false});

assert.deepEqual(getCalendarMoveRequirements('2026-08-10', '2026-08-11', '2026-08-20', false), {
  requiresClosedOverride: false,
});
assert.deepEqual(getCalendarMoveRequirements('2026-08-20','2026-08-11','2026-08-20',false),{requiresClosedOverride:false});
assert.deepEqual(getCalendarMoveRequirements('2026-08-24','2026-08-11','2026-08-20',false),{requiresClosedOverride:false});
assert.equal(getCalendarMoveRequirements('2026-08-24', '2026-08-25', '2026-08-20', true).requiresClosedOverride, true);

assert.deepEqual(
  clampCalendarDetailPosition({ x: -100, y: 900 }, { width: 300, height: 240 }, { left: 80, top: 40, right: 1000, bottom: 700 }, { width: 900, height: 650 }),
  { x: 88, y: 402 },
);

assert.deepEqual(resolveExpandedCalendarInteraction('2026-08-24', { kind: 'day', date: '2026-08-24', interactiveChild: false }), { collapse: true, consume: true, interact: false });
assert.deepEqual(resolveExpandedCalendarInteraction('2026-08-24', { kind: 'day', date: '2026-08-24', interactiveChild: true }), { collapse: false, consume: false, interact: true });
assert.deepEqual(resolveExpandedCalendarInteraction('2026-08-24', { kind: 'day', date: '2026-08-25', interactiveChild: false }), { collapse: true, consume: false, interact: true });
assert.deepEqual(resolveExpandedCalendarInteraction('2026-08-24', { kind: 'day', date: '2026-08-25', interactiveChild: true }), { collapse: true, consume: false, interact: true });
assert.deepEqual(resolveExpandedCalendarInteraction(null, { kind: 'day', date: '2026-08-25', interactiveChild: true }), { collapse: false, consume: false, interact: true });
assert.deepEqual(resolveExpandedCalendarInteraction('2026-08-24', { kind: 'toolbar' }), { collapse: true, consume: false, interact: true });
assert.equal(viewportAnchorAdjustment({top:240},{top:176}),-64);
assert.equal(viewportAnchorAdjustment({top:120},{top:124}),4);
const activeDragElement={closest:(selector:string)=>selector==='[data-booking-id][draggable="true"]'?{}:null} as unknown as Element;
const completedElement={closest:()=>null} as unknown as Element;
assert.equal(isActiveCalendarDragOrigin(activeDragElement),true);
assert.equal(isActiveCalendarDragOrigin(completedElement),false);
assert.equal(isActiveCalendarDragOrigin(null),false);

console.log('Calendar interaction tests passed');
