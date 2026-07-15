import assert from 'node:assert/strict';
import type { DailyCapacity } from './capacity-types';
import type { ConfirmedFlowCheckpoint } from '../production-flow/checkpoint-types';
import { selectCheckpointAwareCalculationStart } from '../production-flow/checkpoint-window';
import {
  classifyFlowOperationalStatus,
  dailyFlowStatusLabel,
  startsOnlyBalanceLabel,
  weeklyFlowStatusLabel,
} from './flow-presentation';
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

function capacities(
  startDate: string,
  count: number,
  availableHours: number,
): DailyCapacity[] {
  const [year, month, day] = startDate.split('-').map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1, day + index));
    return capacity({
      productionDate: date.toISOString().slice(0, 10),
      availableHours,
    });
  });
}

function checkpoint(
  overrides: Partial<ConfirmedFlowCheckpoint>,
): ConfirmedFlowCheckpoint {
  return {
    checkpointId: 'checkpoint-1',
    checkpointSeriesId: 'series-1',
    productionDate: '2026-07-07',
    openingCarryHours: 6,
    revisionNumber: 1,
    calculatedOpeningCarrySnapshot: null,
    adjustmentHoursSnapshot: null,
    calculationVersion: null,
    note: null,
    recordedAt: '2026-07-07T15:00:00Z',
    recordedByUserId: 'user-1',
    actorType: 'office_user',
    confirmedAt: '2026-07-07T15:05:00Z',
    confirmedByUserId: 'user-1',
    sourceSystem: 'doorgo',
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
  assert.equal(closure.days[0].isExplicitlyClosed, true);
  assert.equal(closure.days[0].availableHours, 0);
  assert.equal(closure.days[0].remainingHours, 0);
  assert.equal(closure.summary.scheduledDays, 0);
  assert.equal(closure.weekGroups[0].closureCount, 1);
  assert.equal(closure.weekGroups[0].totalAvailableHours, 0);
  assert.equal(closure.weekGroups[0].comparisonComplete, true);

  const displayClosureOnly = normalizeProductionBoard(
    [],
    [],
    [capacity({ availableHours: 0, source: 'closure', isClosed: false })],
    params,
  );
  assert.equal(displayClosureOnly.days[0].isClosed, true);
  assert.equal(displayClosureOnly.days[0].isExplicitlyClosed, false);

  const explicitClosureWithCalculatedSource = normalizeProductionBoard(
    [],
    [],
    [capacity({ availableHours: 8, source: 'calculated', isClosed: true })],
    params,
  );
  assert.equal(explicitClosureWithCalculatedSource.days[0].isExplicitlyClosed, true);

  const noCapacityRow = normalizeProductionBoard([booking({})], [], [], params);
  assert.equal(noCapacityRow.days[0].isExplicitlyClosed, false);

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

  const baseline = normalizeProductionBoard([], [], capacities('2026-07-06', 7, 8), params);
  assert.equal(baseline.days[0].openingCarryIn, 0);
  assert.equal(baseline.days[0].openingCarryKnown, true);

  const weekdayCarry = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 12 })],
    [],
    capacities('2026-07-06', 7, 8),
    params,
  );
  assert.equal(weekdayCarry.days[0].endingCarryOut, 4);
  assert.equal(weekdayCarry.days[1].openingCarryIn, 4);
  assert.equal(weekdayCarry.days[1].endingCarryOut, 0);

  const crossWeek = normalizeProductionBoard(
    [booking({ production_date: '2026-07-12', shop_hours: 12 })],
    [],
    capacities('2026-07-06', 14, 8),
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-20',
      weeks: 2,
    },
  );
  assert.equal(crossWeek.weekGroups[0].endingCarryOut, 4);
  assert.equal(crossWeek.weekGroups[1].openingCarryIn, 4);

  const closureFlow = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 12 })],
    [],
    [
      capacity({ productionDate: '2026-07-06', availableHours: 8 }),
      capacity({
        productionDate: '2026-07-07',
        availableHours: 0,
        source: 'closure',
        isClosed: true,
      }),
    ],
    params,
  );
  assert.equal(closureFlow.days[1].openingCarryIn, 4);
  assert.equal(closureFlow.days[1].endingCarryOut, 4);

  const closureBooking = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 3 })],
    [],
    [capacity({ availableHours: 0, source: 'closure', isClosed: true })],
    params,
  );
  assert.equal(closureBooking.days[0].endingCarryOut, 3);

  const zeroCapacity = normalizeProductionBoard(
    [booking({ shop_hours: 5 })],
    [],
    [capacity({ availableHours: 0 })],
    params,
  );
  assert.equal(zeroCapacity.days[0].endingCarryOut, 5);

  const unknownPositive = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 5 })],
    [],
    [
      capacity({ productionDate: '2026-07-06', availableHours: null, source: 'unknown' }),
      capacity({ productionDate: '2026-07-07', availableHours: 8 }),
    ],
    params,
  );
  assert.equal(unknownPositive.days[0].endingCarryOut, null);
  assert.equal(unknownPositive.days[0].flowUnresolvedReason, 'unknown_capacity');
  assert.equal(unknownPositive.days[1].endingCarryOut, null);
  assert.equal(unknownPositive.days[1].flowUnresolvedReason, 'upstream_unresolved');

  const unknownZero = normalizeProductionBoard(
    [],
    [],
    [capacity({ availableHours: null, source: 'unknown' })],
    params,
  );
  assert.equal(unknownZero.days[0].endingCarryOut, 0);
  assert.equal(unknownZero.days[0].flowStatus, 'resolved');

  const missingHoursFlow = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: null })],
    [],
    capacities('2026-07-06', 2, 8),
    params,
  );
  assert.equal(missingHoursFlow.days[0].plannedStartsKnown, false);
  assert.equal(missingHoursFlow.days[0].endingCarryOut, null);
  assert.equal(missingHoursFlow.days[1].endingCarryOut, null);

  const weekendFlow = normalizeProductionBoard(
    [booking({ production_date: '2026-07-11', shop_hours: 3 })],
    [],
    [
      capacity({ productionDate: '2026-07-10', availableHours: 0 }),
      capacity({ productionDate: '2026-07-13', availableHours: 0 }),
    ],
    {
      startDate: '2026-07-10',
      endDateExclusive: '2026-07-14',
      weeks: 1,
      calculationStartDate: '2026-07-06',
    },
  );
  assert.equal(weekendFlow.days.some((day) => day.date === '2026-07-11'), false);
  assert.equal(weekendFlow.days.some((day) => day.date === '2026-07-12'), false);
  assert.equal(weekendFlow.days.find((day) => day.date === '2026-07-13')?.openingCarryIn, 3);
  assert.equal(weekendFlow.weekGroups[0].weekendBookingExceptionCount, 1);
  assert.equal(weekendFlow.weekGroups[0].weekendExceptions[0].cards[0].title, 'Test booking');
  assert.equal(weekendFlow.weekGroups[0].plannedStarts, 3);
  assert.equal(weekendFlow.summary.totalKnownShopHours, 3);

  const fridayCarryAcrossEmptyWeekend = normalizeProductionBoard(
    [booking({ production_date: '2026-07-10', shop_hours: 5 })],
    [],
    [
      ...capacities('2026-07-06', 4, 8),
      capacity({ productionDate: '2026-07-10', availableHours: 0 }),
      capacity({ productionDate: '2026-07-13', availableHours: 0 }),
    ],
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-14',
      weeks: 2,
    },
  );
  assert.equal(
    fridayCarryAcrossEmptyWeekend.days.find((day) => day.date === '2026-07-13')?.openingCarryIn,
    5,
  );
  assert.equal(fridayCarryAcrossEmptyWeekend.weekGroups[0].unresolvedFlow, false);

  const emptyWeekend = normalizeProductionBoard(
    [],
    [],
    [
      ...capacities('2026-07-06', 5, 8),
      capacity({ productionDate: '2026-07-13', availableHours: 8 }),
    ],
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-14',
      weeks: 2,
    },
  );
  assert.equal(emptyWeekend.days.find((day) => day.date === '2026-07-13')?.openingCarryIn, 0);

  const weekendMissingHours = normalizeProductionBoard(
    [booking({ production_date: '2026-07-11', shop_hours: null })],
    [],
    [
      ...capacities('2026-07-06', 5, 8),
      capacity({ productionDate: '2026-07-13', availableHours: 8 }),
    ],
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-14',
      weeks: 2,
    },
  );
  assert.equal(weekendMissingHours.weekGroups[0].plannedStartsKnown, false);
  assert.equal(
    weekendMissingHours.days.find((day) => day.date === '2026-07-13')?.flowStatus,
    'unresolved',
  );

  const explicitWeekendCapacity = normalizeProductionBoard(
    [booking({ production_date: '2026-07-11', shop_hours: 5 })],
    [],
    [
      ...capacities('2026-07-06', 5, 8),
      capacity({ productionDate: '2026-07-11', availableHours: 3 }),
      capacity({ productionDate: '2026-07-13', availableHours: 0 }),
    ],
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-14',
      weeks: 2,
    },
  );
  assert.equal(
    explicitWeekendCapacity.days.find((day) => day.date === '2026-07-13')?.openingCarryIn,
    2,
  );

  const nullCapacityClosure = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 4 })],
    [],
    [capacity({ availableHours: null, source: 'closure', isClosed: true })],
    params,
  );
  assert.equal(nullCapacityClosure.days[0].capacityKnown, true);
  assert.equal(nullCapacityClosure.days[0].availableHours, 0);
  assert.equal(nullCapacityClosure.days[0].endingCarryOut, 4);

  const laterVisibleWindow = normalizeProductionBoard(
    [
      booking({ booking_id: 'before', production_date: '2026-07-06', shop_hours: 12 }),
      booking({ booking_id: 'visible', production_date: '2026-07-08', shop_hours: 1 }),
    ],
    [],
    [
      capacity({ productionDate: '2026-07-06', availableHours: 8 }),
      capacity({ productionDate: '2026-07-07', availableHours: 0 }),
      capacity({ productionDate: '2026-07-08', availableHours: 8 }),
      capacity({ productionDate: '2026-07-09', availableHours: 8 }),
      capacity({ productionDate: '2026-07-10', availableHours: 8 }),
    ],
    {
      startDate: '2026-07-08',
      endDateExclusive: '2026-07-13',
      weeks: 1,
      calculationStartDate: '2026-07-06',
    },
  );
  assert.equal(laterVisibleWindow.days.some((day) => day.date === '2026-07-06'), false);
  assert.equal(laterVisibleWindow.days[0].date, '2026-07-08');
  assert.equal(laterVisibleWindow.days[0].openingCarryIn, 4);

  const preBaseline = normalizeProductionBoard(
    [],
    [],
    capacities('2026-07-03', 5, 8),
    {
      startDate: '2026-07-03',
      endDateExclusive: '2026-07-08',
      weeks: 1,
      calculationStartDate: '2026-07-03',
    },
  );
  assert.equal(preBaseline.days[0].openingCarryKnown, false);
  assert.equal(preBaseline.days[0].flowUnresolvedReason, 'before_baseline');
  const resetDay = preBaseline.days.find((day) => day.date === '2026-07-06');
  assert.equal(resetDay?.openingCarryKnown, true);
  assert.equal(resetDay?.openingCarryIn, 0);
  assert.equal(resetDay?.flowStatus, 'resolved');

  assert.equal(
    weekendFlow.weekGroups[0].days.every((day) => {
      const dayOfWeek = new Date(`${day.date}T00:00:00Z`).getUTCDay();
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    }),
    true,
  );

  assert.equal(
    classifyFlowOperationalStatus({
      unresolved: true,
      openingCarry: 0,
      endingCarry: null,
    }),
    'unresolved',
  );
  assert.equal(
    classifyFlowOperationalStatus({
      unresolved: false,
      openingCarry: 9,
      endingCarry: 10,
    }),
    'building',
  );
  assert.equal(
    classifyFlowOperationalStatus({
      unresolved: false,
      openingCarry: 9,
      endingCarry: 8,
    }),
    'reducing',
  );
  assert.equal(
    classifyFlowOperationalStatus({
      unresolved: false,
      openingCarry: 0.3,
      endingCarry: 0.1 + 0.2,
    }),
    'unchanged',
  );
  assert.equal(
    classifyFlowOperationalStatus({
      unresolved: false,
      openingCarry: 0,
      endingCarry: 4,
    }),
    'building',
  );
  assert.equal(
    classifyFlowOperationalStatus({
      unresolved: false,
      openingCarry: 9,
      endingCarry: 0,
    }),
    'clear',
  );
  assert.equal(dailyFlowStatusLabel('building'), 'Carry building');
  assert.equal(dailyFlowStatusLabel('reducing'), 'Carry reducing');
  assert.equal(dailyFlowStatusLabel('unchanged'), 'Carry unchanged');
  assert.equal(dailyFlowStatusLabel('clear'), 'Clear after flow');
  assert.equal(weeklyFlowStatusLabel('unchanged'), 'Carry unchanged');
  assert.equal(weeklyFlowStatusLabel('clear'), 'Accumulated load clears');
  assert.equal(
    startsOnlyBalanceLabel({
      comparisonComplete: true,
      remainingHours: 1,
      overloadHours: 0,
    }),
    'Starts 1.00 hr under capacity',
  );
  assert.equal(
    startsOnlyBalanceLabel({
      comparisonComplete: true,
      remainingHours: 0,
      overloadHours: 1.25,
    }),
    'Starts 1.25 hrs over capacity',
  );
  assert.equal(
    startsOnlyBalanceLabel({
      comparisonComplete: true,
      remainingHours: 0,
      overloadHours: 0,
    }),
    'Starts match capacity',
  );

  const checkpointAnchor = normalizeProductionBoard(
    [booking({ production_date: '2026-07-10', shop_hours: 3 })],
    [],
    [capacity({ productionDate: '2026-07-10', availableHours: 8 })],
    {
      startDate: '2026-07-10',
      endDateExclusive: '2026-07-11',
      weeks: 1,
      calculationStartDate: '2026-07-10',
      checkpoints: [
        checkpoint({
          productionDate: '2026-07-10',
          openingCarryHours: 5,
          calculatedOpeningCarrySnapshot: 9,
          adjustmentHoursSnapshot: -4,
          note: 'Shop count',
          calculationVersion: 'phase-2e',
        }),
      ],
    },
  );
  assert.equal(checkpointAnchor.calculationStartDate, '2026-07-10');
  assert.equal(checkpointAnchor.days[0].calculatedOpeningCarry, 9);
  assert.equal(checkpointAnchor.days[0].actualOpeningCarry, 5);
  assert.equal(checkpointAnchor.days[0].authoritativeOpeningCarry, 5);
  assert.equal(checkpointAnchor.days[0].openingCarryIn, 5);
  assert.equal(checkpointAnchor.days[0].adjustmentHours, -4);
  assert.equal(checkpointAnchor.days[0].flowLoad, 8);
  assert.equal(checkpointAnchor.days[0].endingCarryOut, 0);
  assert.equal(checkpointAnchor.days[0].checkpointNote, 'Shop count');
  assert.equal(checkpointAnchor.days[0].checkpointCalculationVersion, 'phase-2e');
  assert.equal(checkpointAnchor.weekGroups[0].checkpointCount, 1);
  assert.equal(checkpointAnchor.weekGroups[0].hasActualCarryReset, true);

  const calculatedAdjustment = normalizeProductionBoard(
    [],
    [],
    capacities('2026-07-06', 3, 0),
    {
      ...params,
      checkpoints: [
        checkpoint({ productionDate: '2026-07-07', openingCarryHours: 4 }),
      ],
    },
  );
  const calculatedAdjustmentDay = calculatedAdjustment.days.find(
    (day) => day.date === '2026-07-07',
  );
  assert.equal(calculatedAdjustmentDay?.calculatedOpeningCarry, 0);
  assert.equal(calculatedAdjustmentDay?.actualOpeningCarry, 4);
  assert.equal(calculatedAdjustmentDay?.adjustmentHours, 4);
  assert.equal(calculatedAdjustmentDay?.endingCarryOut, 4);

  const multipleResets = normalizeProductionBoard(
    [],
    [],
    capacities('2026-07-06', 5, 0),
    {
      ...params,
      checkpoints: [
        checkpoint({ productionDate: '2026-07-07', openingCarryHours: 4 }),
        checkpoint({
          checkpointId: 'checkpoint-2',
          productionDate: '2026-07-09',
          openingCarryHours: 2,
          revisionNumber: 1,
        }),
      ],
    },
  );
  assert.equal(
    multipleResets.days.find((day) => day.date === '2026-07-08')?.openingCarryIn,
    4,
  );
  assert.equal(
    multipleResets.days.find((day) => day.date === '2026-07-09')?.calculatedOpeningCarry,
    4,
  );
  assert.equal(
    multipleResets.days.find((day) => day.date === '2026-07-09')?.openingCarryIn,
    2,
  );
  assert.equal(multipleResets.weekGroups[0].checkpointCount, 2);

  const resolvesUnknown = normalizeProductionBoard(
    [booking({ production_date: '2026-07-06', shop_hours: 5 })],
    [],
    [
      capacity({ productionDate: '2026-07-06', availableHours: null, source: 'unknown' }),
      capacity({ productionDate: '2026-07-07', availableHours: 8 }),
      capacity({ productionDate: '2026-07-08', availableHours: 8 }),
    ],
    {
      ...params,
      checkpoints: [
        checkpoint({ productionDate: '2026-07-08', openingCarryHours: 3 }),
      ],
    },
  );
  const resetAfterUnknown = resolvesUnknown.days.find(
    (day) => day.date === '2026-07-08',
  );
  assert.equal(resetAfterUnknown?.calculatedOpeningCarry, null);
  assert.equal(resetAfterUnknown?.openingCarryIn, 3);
  assert.equal(resetAfterUnknown?.flowStatus, 'resolved');
  assert.equal(resetAfterUnknown?.endingCarryOut, 0);

  const checkpointClosure = normalizeProductionBoard(
    [],
    [],
    [capacity({ availableHours: null, source: 'closure', isClosed: true })],
    {
      ...params,
      checkpoints: [
        checkpoint({ productionDate: '2026-07-06', openingCarryHours: 7 }),
      ],
    },
  );
  assert.equal(checkpointClosure.days[0].openingCarryIn, 7);
  assert.equal(checkpointClosure.days[0].availableHours, 0);
  assert.equal(checkpointClosure.days[0].endingCarryOut, 7);

  const mondayCheckpoint = normalizeProductionBoard(
    [booking({ production_date: '2026-07-10', shop_hours: 5 })],
    [],
    [
      ...capacities('2026-07-06', 4, 8),
      capacity({ productionDate: '2026-07-10', availableHours: 0 }),
      capacity({ productionDate: '2026-07-13', availableHours: 0 }),
    ],
    {
      startDate: '2026-07-06',
      endDateExclusive: '2026-07-14',
      weeks: 2,
      checkpoints: [
        checkpoint({ productionDate: '2026-07-13', openingCarryHours: 2 }),
      ],
    },
  );
  const checkpointMonday = mondayCheckpoint.days.find(
    (day) => day.date === '2026-07-13',
  );
  assert.equal(checkpointMonday?.calculatedOpeningCarry, 5);
  assert.equal(checkpointMonday?.openingCarryIn, 2);

  assert.throws(
    () =>
      normalizeProductionBoard([], [], [], {
        ...params,
        checkpoints: [
          checkpoint({ productionDate: '2026-07-07' }),
          checkpoint({ checkpointId: 'duplicate', productionDate: '2026-07-07' }),
        ],
      }),
    /Multiple confirmed production flow checkpoints found for 2026-07-07/,
  );

  assert.equal(
    selectCheckpointAwareCalculationStart({
      boardStart: '2026-08-03',
      checkpointAnchorDate: '2026-07-31',
    }),
    '2026-07-31',
  );
  assert.equal(
    selectCheckpointAwareCalculationStart({
      boardStart: '2026-08-03',
      checkpointAnchorDate: null,
    }),
    '2026-07-06',
  );
  assert.equal(
    selectCheckpointAwareCalculationStart({
      boardStart: '2026-07-03',
      checkpointAnchorDate: null,
    }),
    '2026-07-03',
  );

  const preBaselineCheckpoint = normalizeProductionBoard(
    [],
    [],
    capacities('2026-07-03', 5, 0),
    {
      startDate: '2026-07-03',
      endDateExclusive: '2026-07-08',
      weeks: 1,
      calculationStartDate: '2026-07-03',
      checkpoints: [
        checkpoint({ productionDate: '2026-07-03', openingCarryHours: 6 }),
      ],
    },
  );
  assert.equal(
    preBaselineCheckpoint.days.find((day) => day.date === '2026-07-06')
      ?.openingCarryIn,
    6,
  );

  const zeroPreBaselineCheckpoint = normalizeProductionBoard(
    [booking({ production_date: '2026-07-03', shop_hours: null })],
    [],
    capacities('2026-07-03', 5, 8),
    {
      startDate: '2026-07-03',
      endDateExclusive: '2026-07-08',
      weeks: 1,
      calculationStartDate: '2026-07-03',
      checkpoints: [
        checkpoint({ productionDate: '2026-07-03', openingCarryHours: 0 }),
      ],
    },
  );
  const julySixAfterZeroCheckpoint = zeroPreBaselineCheckpoint.days.find(
    (day) => day.date === '2026-07-06',
  );
  assert.equal(julySixAfterZeroCheckpoint?.openingCarryKnown, false);
  assert.equal(julySixAfterZeroCheckpoint?.flowStatus, 'unresolved');

  const julySixFallbackWithoutCheckpoint = normalizeProductionBoard(
    [],
    [],
    capacities('2026-07-03', 5, 8),
    {
      startDate: '2026-07-03',
      endDateExclusive: '2026-07-08',
      weeks: 1,
      calculationStartDate: '2026-07-03',
    },
  );
  assert.equal(
    julySixFallbackWithoutCheckpoint.days.find(
      (day) => day.date === '2026-07-06',
    )?.openingCarryIn,
    0,
  );

  const checkpointOnBaseline = normalizeProductionBoard(
    [],
    [],
    [capacity({ productionDate: '2026-07-06', availableHours: 0 })],
    {
      ...params,
      checkpoints: [
        checkpoint({ productionDate: '2026-07-06', openingCarryHours: 5 }),
      ],
    },
  );
  assert.equal(checkpointOnBaseline.days[0].calculatedOpeningCarry, 0);
  assert.equal(checkpointOnBaseline.days[0].actualOpeningCarry, 5);
  assert.equal(checkpointOnBaseline.days[0].openingCarryIn, 5);
  assert.equal(checkpointOnBaseline.days[0].endingCarryOut, 5);

  const laterAuthorityReset = normalizeProductionBoard(
    [],
    [],
    capacities('2026-07-03', 6, 0),
    {
      startDate: '2026-07-03',
      endDateExclusive: '2026-07-09',
      weeks: 1,
      calculationStartDate: '2026-07-03',
      checkpoints: [
        checkpoint({ productionDate: '2026-07-03', openingCarryHours: 6 }),
        checkpoint({
          checkpointId: 'later-checkpoint',
          productionDate: '2026-07-07',
          openingCarryHours: 2,
        }),
      ],
    },
  );
  assert.equal(
    laterAuthorityReset.days.find((day) => day.date === '2026-07-07')
      ?.calculatedOpeningCarry,
    6,
  );
  assert.equal(
    laterAuthorityReset.days.find((day) => day.date === '2026-07-07')
      ?.openingCarryIn,
    2,
  );

  console.log('production-board capacity verification passed');
}

run();
