import assert from 'node:assert/strict';
import type { DailyCapacity } from './capacity-types';
import { normalizeProductionBoard } from './normalize';
import type { ProductionBookingRow } from './types';

const params = {
  startDate: '2026-07-06',
  endDateExclusive: '2026-07-13',
  weeks: 1,
};

function booking(overrides: Partial<ProductionBookingRow>): ProductionBookingRow {
  return {
    booking_id: 'booking-1',
    job_id: null,
    calendar_id: null,
    calendar_event_id: null,
    title: 'Test booking',
    production_date: '2026-07-06',
    shop_hours: 5,
    salesperson: null,
    status: 'active',
    schedule_status: 'confirmed',
    booking_kind: 'production',
    board_visible: true,
    all_day: true,
    calendar_sync_state: null,
    source: null,
    source_system: null,
    locked: false,
    ...overrides,
  };
}

function capacity(overrides: Partial<DailyCapacity>): DailyCapacity {
  return {
    productionDate: '2026-07-06',
    availableHours: 12,
    staffCapacityHours: 12,
    deductionHours: 0,
    source: 'calculated',
    isClosed: false,
    notes: null,
    details: {},
    calculatedAt: null,
    mirroredAt: null,
    ...overrides,
  };
}

function run(): void {
  const normal = normalizeProductionBoard(
    [booking({ shop_hours: 10.5 })],
    [],
    [capacity({ availableHours: 12 })],
    params,
  );
  assert.equal(normal.days[0].remainingHours, 1.5);
  assert.equal(normal.days[0].overloadHours, 0);
  assert.equal(normal.weekGroups.length, 1);
  assert.equal(normal.weekGroups[0].totalKnownShopHours, 10.5);
  assert.equal(normal.weekGroups[0].totalAvailableHours, 12);
  assert.equal(normal.weekGroups[0].remainingHours, 1.5);
  assert.equal(normal.weekGroups[0].overloadHours, 0);
  assert.equal(normal.weekGroups[0].comparisonComplete, true);

  const overloaded = normalizeProductionBoard(
    [booking({ shop_hours: 15 })],
    [],
    [capacity({ availableHours: 12 })],
    params,
  );
  assert.equal(overloaded.days[0].remainingHours, 0);
  assert.equal(overloaded.days[0].overloadHours, 3);
  assert.equal(overloaded.weekGroups[0].overloadHours, 3);
  assert.equal(overloaded.weekGroups[0].dailyOverloadCount, 1);

  const closure = normalizeProductionBoard(
    [],
    [],
    [capacity({ availableHours: 0, source: 'closure', isClosed: true })],
    params,
  );
  assert.equal(closure.days.length, 1);
  assert.equal(closure.days[0].capacityKnown, true);
  assert.equal(closure.days[0].availableHours, 0);
  assert.equal(closure.days[0].remainingHours, 0);
  assert.equal(closure.summary.scheduledDays, 0);
  assert.equal(closure.weekGroups[0].closureCount, 1);
  assert.equal(closure.weekGroups[0].totalAvailableHours, 0);
  assert.equal(closure.weekGroups[0].comparisonComplete, true);

  const unknown = normalizeProductionBoard(
    [booking({ shop_hours: 4 })],
    [],
    [capacity({ availableHours: null, source: 'unknown' })],
    params,
  );
  assert.equal(unknown.days[0].capacityKnown, false);
  assert.equal(unknown.days[0].remainingHours, null);
  assert.equal(unknown.days[0].overloadHours, null);
  assert.equal(unknown.weekGroups[0].unknownCapacityDayCount, 1);
  assert.equal(unknown.weekGroups[0].capacityComplete, false);
  assert.equal(unknown.weekGroups[0].remainingHours, null);

  const missingHours = normalizeProductionBoard(
    [booking({ shop_hours: null })],
    [],
    [capacity({ availableHours: 12 })],
    params,
  );
  assert.equal(missingHours.days[0].missingShopHoursCount, 1);
  assert.equal(missingHours.days[0].remainingHours, null);
  assert.equal(missingHours.days[0].overloadHours, null);
  assert.equal(missingHours.weekGroups[0].comparisonComplete, false);
  assert.equal(missingHours.weekGroups[0].remainingHours, null);

  const capacityOnlyDay = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 5 })],
    [],
    [
      capacity({ productionDate: '2026-07-06' }),
      capacity({ productionDate: '2026-07-07', availableHours: 12 }),
    ],
    params,
  );
  assert.equal(capacityOnlyDay.days.length, 2);
  assert.equal(capacityOnlyDay.summary.scheduledDays, 1);
  assert.equal(capacityOnlyDay.days[1].bookingCount, 0);
  assert.equal(capacityOnlyDay.weekGroups[0].totalAvailableHours, 24);

  const dailyOverloadButWeekOpen = normalizeProductionBoard(
    [
      booking({
        booking_id: 'booking-monday',
        production_date: '2026-07-06',
        shop_hours: 15,
      }),
      booking({
        booking_id: 'booking-tuesday',
        production_date: '2026-07-07',
        shop_hours: 3,
      }),
    ],
    [],
    [
      capacity({
        productionDate: '2026-07-06',
        availableHours: 12,
      }),
      capacity({
        productionDate: '2026-07-07',
        availableHours: 12,
      }),
    ],
    params,
  );
  assert.equal(dailyOverloadButWeekOpen.weekGroups[0].dailyOverloadCount, 1);
  assert.equal(dailyOverloadButWeekOpen.weekGroups[0].overloadHours, 0);
  assert.equal(dailyOverloadButWeekOpen.weekGroups[0].remainingHours, 6);

  const twoWeeks = normalizeProductionBoard(
    [],
    [],
    [
      capacity({ productionDate: '2026-07-06' }),
      capacity({ productionDate: '2026-07-13' }),
    ],
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-20',
      weeks: 2,
    },
  );
  assert.equal(twoWeeks.weekGroups.length, 2);
  assert.equal(twoWeeks.weekGroups[0].days[0].date, '2026-07-06');
  assert.equal(twoWeeks.weekGroups[1].days[0].date, '2026-07-13');

  console.log('production-board capacity verification passed');
}

run();
