import assert from 'node:assert/strict';
import {
  addDaysToDateOnly,
  classifyProductionBoardDay,
  generateProductionWorkweeks,
  getMondayForDate,
  normalizeProductionWeekAnchor,
  parseProductionBoardParams,
  PRODUCTION_BOARD_WEEK_COUNT,
} from './date-utils';

assert.equal(getMondayForDate('2026-07-13'), '2026-07-13'); // Monday stays first
assert.equal(getMondayForDate('2026-07-14'), '2026-07-13'); // Tuesday today keeps Monday first
assert.equal(getMondayForDate('2026-07-17'), '2026-07-13'); // Friday today keeps Monday first
assert.equal(getMondayForDate('2026-07-18'), '2026-07-13'); // Saturday uses that calendar week's Monday
assert.equal(getMondayForDate('2026-07-19'), '2026-07-13'); // Sunday uses that calendar week's Monday

const window = parseProductionBoardParams(undefined, '2026-07-16');
assert.deepEqual(window, {
  startDate: '2026-07-13',
  weeks: 8,
  endDateExclusive: '2026-09-07',
  visibleWeekdayEndExclusive: '2026-09-05',
}); // default uses current Vancouver workweek and eight complete calendar weeks
assert.equal(PRODUCTION_BOARD_WEEK_COUNT, 8);
assert.equal(parseProductionBoardParams({ week: '2026-07-15' }, '2026-07-16').startDate, '2026-07-13'); // Go to Wednesday
assert.equal(parseProductionBoardParams({ week: '2026-07-18' }, '2026-07-16').startDate, '2026-07-13'); // Go to Saturday
assert.equal(parseProductionBoardParams({ week: 'not-a-date' }, '2026-07-16').startDate, '2026-07-13'); // invalid query fallback
assert.equal(parseProductionBoardParams({ week: ' 2026-07-15 ' }, '2026-07-16').startDate, '2026-07-13'); // strict query rejects whitespace

const scalarFallbackToday = '2026-07-22';
assert.equal(parseProductionBoardParams({ week: '2026-07-15' }, scalarFallbackToday).startDate, '2026-07-13'); // valid scalar date normalizes to Monday
assert.equal(parseProductionBoardParams({ week: '2026-07-13' }, scalarFallbackToday).startDate, '2026-07-13'); // scalar Monday remains unchanged
assert.equal(parseProductionBoardParams({ week: 'not-a-date' }, scalarFallbackToday).startDate, '2026-07-20'); // invalid scalar falls back
assert.equal(parseProductionBoardParams({ week: ['2026-07-15', '2026-08-01'] }, scalarFallbackToday).startDate, '2026-07-20'); // repeated valid array falls back
assert.equal(parseProductionBoardParams({ week: ['2026-07-15', '2026-07-15'] }, scalarFallbackToday).startDate, '2026-07-20'); // repeated identical array falls back
assert.equal(parseProductionBoardParams({ week: ['2026-07-15', 'not-a-date'] }, scalarFallbackToday).startDate, '2026-07-20'); // valid and invalid array falls back
assert.equal(parseProductionBoardParams({ week: ['2026-07-15'] }, scalarFallbackToday).startDate, '2026-07-20'); // single-element array falls back
assert.equal(parseProductionBoardParams({ week: undefined }, scalarFallbackToday).startDate, '2026-07-20'); // undefined query falls back

const weeks = generateProductionWorkweeks(window.startDate);
assert.equal(weeks.length, 8);
for (const week of weeks) {
  assert.equal(week.weekdayDates.length, 5);
  assert.deepEqual(week.weekdayDates.map((date) => new Date(`${date}T00:00:00Z`).getUTCDay()), [1, 2, 3, 4, 5]);
  assert.deepEqual(week.weekendDates.map((date) => new Date(`${date}T00:00:00Z`).getUTCDay()), [6, 0]);
}

assert.equal(getMondayForDate('2024-02-29'), '2024-02-26'); // leap day
assert.equal(getMondayForDate('2027-01-01'), '2026-12-28'); // year boundary
assert.equal(getMondayForDate('2026-03-08'), '2026-03-02'); // Vancouver spring DST week
assert.equal(getMondayForDate('2026-11-01'), '2026-10-26'); // Vancouver fall DST week
assert.equal(addDaysToDateOnly('2026-07-13', -7), '2026-07-06'); // Previous shifts seven calendar days
assert.equal(addDaysToDateOnly('2026-07-13', 7), '2026-07-20'); // Next shifts seven calendar days
assert.equal(normalizeProductionWeekAnchor(undefined, '2026-07-16'), '2026-07-13'); // Today returns current Monday

assert.equal(classifyProductionBoardDay('2026-07-15', '2026-07-16'), 'past');
assert.equal(classifyProductionBoardDay('2026-07-16', '2026-07-16'), 'today');
assert.equal(classifyProductionBoardDay('2026-07-17', '2026-07-16'), 'future');

console.log('Production Board fixed-workweek date helper tests passed');
