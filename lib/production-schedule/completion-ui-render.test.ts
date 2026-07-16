import { strict as assert } from 'node:assert';
import { createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ProductionBookingCard } from '../../components/ProductionBookingCard';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import { getProductionCompletionAuthorizationError } from '../production-bookings/production-booking-completion-contract';
import { canRescheduleProductionBooking } from '../production-bookings/production-booking-reschedule-contract';
import type { ProductionBoardCard } from '../production-board/types';
import type { ProductionBoardInteraction } from '../../components/production-board-interaction';
import { getProductionScheduleCompletionBlockReason } from './completion-ui-contract';
import { getProductionScheduleCardMoveBlockReason } from './move-ui-contract';

const ready: ProductionBoardCard = {
  bookingId: 'booking-ready',
  type: 'doorgo_linked',
  typeLabel: 'DoorGo-linked',
  productionDate: '2026-07-16',
  title: 'Ready test booking',
  customer: null,
  jobId: null,
  calendarId: null,
  calendarEventId: null,
  shopHours: 4,
  shopHoursKnown: true,
  salesperson: null,
  source: null,
  sourceSystem: null,
  bookingKind: 'production',
  locked: false,
  completedAt: null,
};
const completed: ProductionBoardCard = {
  ...ready,
  bookingId: 'booking-completed',
  title: 'Completed test booking',
  completedAt: '2026-07-16T18:22:31.123456+00:00',
};

function interaction(pendingBookingId: string | null = null): ProductionBoardInteraction {
  return {
    mode: 'reschedule',
    pendingBookingId,
    hoveredDate: null,
    getMoveBlockReason: (card) => getProductionScheduleCardMoveBlockReason(
      card,
      card.bookingId === pendingBookingId,
    ),
    canDragCard: (card) => getProductionScheduleCardMoveBlockReason(card, false) === null,
    onMoveRequest() {},
    getCompletionBlockReason: (card) => getProductionScheduleCompletionBlockReason(
      card,
      card.bookingId === pendingBookingId,
    ),
    onCompletionRequest() {},
    onCardDragStart() {},
    onCardDragEnd() {},
    onCardClickCapture() {},
    onDayDragEnter() {},
    onDayDragOver() {},
    onDayDragLeave() {},
    onDayDrop() {},
  };
}

function render(card: ProductionBoardCard, cardInteraction?: ProductionBoardInteraction): string {
  return renderToStaticMarkup(createElement(ProductionBookingCard, {
    card,
    interaction: cardInteraction,
  }));
}

const readyUse = render(ready, interaction());
assert.match(readyUse, />Ready</);
assert.match(readyUse, />Complete</);
assert.match(readyUse, />Move</);
assert.doesNotMatch(readyUse, />Reopen</);
assert.match(readyUse, /draggable="true"/);
const readyElement = ProductionBookingCard({ card: ready, interaction: interaction() }) as ReactElement<{
  draggable?: boolean;
  onDragStart?: unknown;
}>;
assert.equal(readyElement.props.draggable, true);
assert.equal(typeof readyElement.props.onDragStart, 'function');

const readyView = render(ready);
assert.match(readyView, />Ready</);
assert.doesNotMatch(readyView, /<button/);
assert.doesNotMatch(readyView, />Complete<|>Reopen<|>Move</);
assert.doesNotMatch(readyView, /draggable=/);

const completedUse = render(completed, interaction());
assert.match(completedUse, />Completed</);
assert.match(completedUse, />Reopen</);
assert.doesNotMatch(completedUse, />Complete<|>Move</);
assert.doesNotMatch(completedUse, /draggable=/);
const completedElement = ProductionBookingCard({ card: completed, interaction: interaction() }) as ReactElement<{
  draggable?: boolean;
  onDragStart?: unknown;
  onDragEnd?: unknown;
}>;
assert.equal(completedElement.props.draggable, undefined);
assert.equal(completedElement.props.onDragStart, undefined);
assert.equal(completedElement.props.onDragEnd, undefined);

const completedView = render(completed);
assert.match(completedView, />Completed</);
assert.doesNotMatch(completedView, /<button|draggable=/);

const readyPending = render(ready, interaction(ready.bookingId));
assert.match(readyPending, /aria-busy="true"/);
assert.match(readyPending, /disabled=""/);
assert.match(readyPending, />Move pending</);
assert.match(readyPending, />Action pending</);
const unrelatedPending = render(ready, interaction('another-booking'));
assert.doesNotMatch(unrelatedPending, /aria-busy="true"|disabled=""/);
assert.match(unrelatedPending, />Move</);
assert.match(unrelatedPending, />Complete</);

const managerWithoutUse = resolveCurrentDoorGoAccess({
  user: { id: '00000000-0000-4000-8000-000000000001' },
  profile: {
    user_id: '00000000-0000-4000-8000-000000000001',
    display_name: 'Manager without production use',
    active: true,
    is_manager: true,
    company_location: 'Office',
    must_change_password: false,
  },
  permissionRows: [
    { permission_key: 'production', access_level: 'view' },
    { permission_key: 'calendar', access_level: 'use' },
    { permission_key: 'production_checkpoints', access_level: 'use' },
  ],
});
assert.equal(getProductionCompletionAuthorizationError(managerWithoutUse), 'permission_required');
assert.equal(canRescheduleProductionBooking(managerWithoutUse), false);
const managerView = render(ready);
assert.doesNotMatch(managerView, /<button|draggable=/);

console.log('Phase 2F-F2 rendered permission and card behavior tests passed');
