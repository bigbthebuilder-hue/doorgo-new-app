import assert from 'node:assert/strict';
import { parseCalendarViewport, viewportOffset, calendarViewportKey } from './viewport';
assert.deepEqual(parseCalendarViewport({week:'2026-12-28',offset:-73.5}),{week:'2026-12-28',offset:-73.5});
assert.deepEqual(parseCalendarViewport({week:'2027-01-04',offset:-15}),{week:'2027-01-04',offset:-15});
for(const value of [null,{}, {week:'2026-02-30',offset:0},{week:'2026-11-24',offset:0},{week:'2026-12-28',offset:Infinity},{week:'bad',offset:2}])assert.equal(parseCalendarViewport(value),null);
assert.equal(viewportOffset(-900,200),-176,'a shorter week keeps the anchor week visible');
assert.equal(viewportOffset(-80,900),-80);assert.equal(viewportOffset(15,200),0);
assert.notEqual(calendarViewportKey('user-a'),calendarViewportKey('user-b'));
console.log('Calendar viewport date validation, account separation and week-height clamping passed');
