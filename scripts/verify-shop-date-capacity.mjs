import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
import ts from 'typescript';

function load(file, dependencies = {}) {
  const { outputText } = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInThisContext(`(function(require, exports) { ${outputText}\n})`, { filename: file })(
    (name) => {
      assert.ok(Object.hasOwn(dependencies, name), `Unmocked dependency: ${name}`);
      return dependencies[name];
    },
    exports,
  );
  return exports;
}

const dateUtils = load('lib/production-board/date-utils.ts', { './flow-constants': load('lib/production-board/flow-constants.ts') });
dateUtils.getCurrentDateInTimeZone = () => '2026-11-10';
const dates = load('lib/jobs/date-only-picker.ts', { '../production-board/date-utils': dateUtils });
const range = load('lib/calendar/continuous-range.ts', { '../production-board/date-utils': dateUtils });
const capacity = load('lib/jobs/shop-date-capacity.ts');
const accessContract = load('lib/auth/access.ts');
const month = '2026-11';
const job = 'aaaaaaaa-1111-4111-8111-111111111111';
const other = 'bbbbbbbb-1111-4111-8111-111111111111';
const closed = '2026-11-11';
const actual = '2026-11-13';
const full = '2026-11-16';
const zero = '2026-11-17';
const unconfirmed = '2026-11-18';
const card = (bookingId, shopHours) => ({ bookingId, shopHours, shopHoursKnown: shopHours !== null });
const day = (date, availableHours, cards, isClosed = false) => ({
  date, availableHours, cards, isClosed, capacityKnown: availableHours !== null,
  totalKnownShopHours: cards.reduce((sum, value) => sum + (value.shopHours ?? 0), 0),
  missingShopHoursCount: cards.filter(value => !value.shopHoursKnown).length,
});
const board = {days: [
  day(closed, 0, [card('closed-job', 4)], true),
  day(actual, 16, [card('linked', 4), card('independent', 6)]),
  day(full, 16, [card('full', 16)]), day(zero, 0, []),
  day(unconfirmed, 16, [card('unknown', null)]),
]};
let access;
let reads = 0;
let linkedBooking = { booking_id: 'linked', production_date: actual };
const calls = [];
const query = {};
for (const method of ['select', 'eq', 'is', 'neq']) {
  query[method] = (...args) => { calls.push([method, ...args]); return query; };
}
query.maybeSingle = async () => ({ data: linkedBooking, error: null });
const reader = load('lib/jobs/shop-date-capacity-queries.ts', {
  'server-only': {},
  '@/lib/calendar/continuous-range': range,
  '@/lib/production-board/queries': { loadProductionBoardReadOnly: async window => {
    reads++;
    assert.equal(window.boardStart, '2026-10-26');
    assert.equal(window.boardEndExclusive, '2026-12-14');
    assert.ok(window.includeStaffAway && window.includeCapacityExceptions && window.includeOperationalCalendarItems);
    return board;
  }},
  '@/lib/production-board/date-utils': dateUtils,
  '@/lib/supabase/trusted-read-server': { createTrustedReadOnlySupabaseClient: () => ({
    from: table => { assert.equal(table, 'dg_production_bookings'); return query; },
  }) },
  './date-only-picker': dates,
  './shop-date-capacity': capacity,
});
let resolvedJob = { internalJobId: job, shopDate: '2026-11-10' };
const actions = load('lib/jobs/job-intake-actions.ts', {
  'next/cache': {}, './sales-order-check-contract': {}, './job-intake-repository': {},
  '@/lib/auth/access': accessContract,
  '@/lib/auth/current-access': { getCurrentDoorGoAccess: async () => access },
  './job-intake-contract': {
    canWriteJobs: level => level === 'use', isUuid: value => [job, other].includes(value.toLowerCase()),
    jobFailureMessage: code => code,
  },
  './door-line-contract': {},
  './job-intake-service': { findJobWithAccess: async (_access, id) => id === job ? resolvedJob : null },
  './legacy-transfer-mapping': {},
  './shop-date-capacity-queries': reader,
  './job-intake-types': { JobIntakeFailure: Error },
});
const check = actions.loadShopDateAvailabilityAction;
const actor = (permissions, state = 'active', mustChangePassword = false) =>
  ({ state, profile: { mustChangePassword }, permissions });
for (const denied of [
  actor({jobs:'use',calendar:'use'}, 'unauthenticated'),
  actor({jobs:'use',calendar:'use'}, 'inactive_profile'),
  actor({jobs:'use',calendar:'use'}, 'active', true),
  actor({jobs:'use'}), actor({calendar:'use'}), actor({jobs:'use',calendar:'view'}),
  actor({jobs:'view',calendar:'use'}),
]) {
  access = denied;
  for (const estimate of [0, 4, 7, 12]) {
    assert.equal(await check(month, job, estimate), null);
    assert.equal(await check(month, null, estimate), null);
  }
}
access = actor({ jobs: 'use', calendar: 'use', production: 'none' });
assert.equal(await check(month, other, 7), null);
resolvedJob = { internalJobId: other };
assert.equal(await check(month, job, 7), null);
resolvedJob = { internalJobId: job, archivedAt: '2026-11-11' };
assert.equal(await check(month, job, 7), null);
resolvedJob = { internalJobId: job, shopDate: '2026-11-10' };
assert.equal(await check(month, job, -1), null);
assert.deepEqual(await check('2050-01', job, 7), {});
assert.equal(reads, 0);
const baseline = await check(month, null, 7);
assert.equal(baseline[actual], 'exceeds');
const edit = await check(month, job.toUpperCase(), 7);
assert.deepEqual(edit, {
  [closed]: 'unavailable', [actual]: 'fits', [full]: 'full', [zero]: 'full', [unconfirmed]: 'unavailable',
});
assert.equal((await check(month, job, 10))[actual], 'fits');
assert.equal((await check(month, job, 10.01))[actual], 'exceeds');
assert.equal((await check(month, job, 0))[full], 'full');
assert.equal((await check(month, job, 0))[closed], 'unavailable');
assert.equal((await check(month, job, null))[actual], 'unavailable');
assert.ok(calls.some(call => call[0] === 'eq' && call[1] === 'linked_internal_job_id' && call[2] === job));
for (const estimate of [0, 4, 6, 6.01, 7, 10, 11, 100]) {
  const expected = await check(month, null, estimate);
  for (const production_date of [actual, '2026-11-15', '2040-01-01']) {
    linkedBooking = { booking_id: 'not-in-calendar-projection', production_date };
    assert.deepEqual(await check(month, job, estimate), expected,
      'A linked row absent from Calendar cannot alter any repeated response');
  }
}
access = actor({administration:'use'});
linkedBooking = { booking_id: 'linked', production_date: actual };
assert.equal((await check(month, job, 7))[actual], 'fits');
console.log('PASS: CAL-03 permission, substitution, repeated disclosure, projection and capacity boundary checks.');
