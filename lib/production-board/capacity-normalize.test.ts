import assert from 'node:assert/strict';
import { normalizeDailyCapacityRow } from './capacity-normalize';

function run(): void {
  const nullCase = normalizeDailyCapacityRow({
    production_date: '2026-07-06',
    available_hours: null,
    staff_capacity_hours: null,
    deduction_hours: null,
    capacity_source: 'unknown',
    is_closed: false,
    notes: null,
    details: {},
    source_system: 'apps-script-bridge',
    calculated_at: null,
    mirrored_at: null,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  });
  assert.equal(nullCase.availableHours, null);

  const nullClosureCase = normalizeDailyCapacityRow({
    production_date: '2026-07-06',
    available_hours: 0,
    staff_capacity_hours: 0,
    deduction_hours: 0,
    capacity_source: 'closure',
    is_closed: null as unknown as boolean,
    notes: null,
    details: {},
    source_system: 'apps-script-bridge',
    calculated_at: null,
    mirrored_at: null,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  });
  assert.equal(nullClosureCase.isClosed, false);

  const malformedCase = normalizeDailyCapacityRow({
    production_date: '2026-07-06',
    available_hours: 'not-a-number',
    staff_capacity_hours: '',
    deduction_hours: '  ',
    capacity_source: 'calculated',
    is_closed: false,
    notes: null,
    details: {},
    source_system: 'apps-script-bridge',
    calculated_at: null,
    mirrored_at: null,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  });
  assert.equal(malformedCase.availableHours, null);
  assert.equal(malformedCase.staffCapacityHours, null);
  assert.equal(malformedCase.deductionHours, null);

  const zeroCase = normalizeDailyCapacityRow({
    production_date: '2026-07-06',
    available_hours: 0,
    staff_capacity_hours: 0,
    deduction_hours: 0,
    capacity_source: 'closure',
    is_closed: true,
    notes: null,
    details: {},
    source_system: 'apps-script-bridge',
    calculated_at: null,
    mirrored_at: null,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  });
  assert.equal(zeroCase.availableHours, 0);
  assert.equal(zeroCase.staffCapacityHours, 0);
  assert.equal(zeroCase.deductionHours, 0);

  const positiveCase = normalizeDailyCapacityRow({
    production_date: '2026-07-06',
    available_hours: '8.50',
    staff_capacity_hours: '10.00',
    deduction_hours: '1.50',
    capacity_source: 'calculated',
    is_closed: false,
    notes: 'ok',
    details: { source: 'bridge' },
    source_system: 'apps-script-bridge',
    calculated_at: '2026-07-10T00:00:00Z',
    mirrored_at: '2026-07-10T00:00:00Z',
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  });
  assert.equal(positiveCase.availableHours, 8.5);
  assert.equal(positiveCase.staffCapacityHours, 10);
  assert.equal(positiveCase.deductionHours, 1.5);
  assert.equal(positiveCase.productionDate, '2026-07-06');

  const dateOnlyCase = normalizeDailyCapacityRow({
    production_date: '2026-07-06',
    available_hours: 4,
    staff_capacity_hours: null,
    deduction_hours: null,
    capacity_source: 'override',
    is_closed: false,
    notes: null,
    details: {},
    source_system: 'apps-script-bridge',
    calculated_at: null,
    mirrored_at: null,
    created_at: '2026-07-10T00:00:00Z',
    updated_at: '2026-07-10T00:00:00Z',
  });
  assert.equal(dateOnlyCase.productionDate, '2026-07-06');

  console.log('capacity-normalize verification passed');
}

run();
