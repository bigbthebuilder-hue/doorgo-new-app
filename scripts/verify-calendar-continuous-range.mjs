import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync('app/calendar/page.tsx', 'utf8');
const workspace = readFileSync('components/CalendarWorkspace.tsx', 'utf8');
const actions = readFileSync('lib/production-bookings/calendar-production-actions.ts', 'utf8');

assert.match(page, /initialCalendarRange\(today\)/);
assert.match(page, /initialTargetMonday=\{requested\.startDate\}/);
assert.match(workspace, /nextCalendarChunk\(base,direction,bounds\)/);
assert.match(workspace, /mergeContinuousCalendarBoards\(current,result\.board\)/);
assert.match(workspace, /preservedPrependScrollTop\(beforeTop,beforeHeight,stream\.scrollHeight\)/);
assert.match(workspace, /scrollTop<480[\s\S]*fetchChunk\(displayBoard,'prepend',true\)/);
assert.match(workspace, /clientHeight<640[\s\S]*fetchChunk\(displayBoard,'append',false\)/);
assert.match(workspace, /navigate\(addDaysToDateOnly\(navigationMonday, -28\)\)/);
assert.match(workspace, /navigate\(currentMonday\)/);
assert.match(workspace, /navigate\(addDaysToDateOnly\(navigationMonday, 28\)\)/);
assert.match(workspace, /ensureDateLoaded\(target\.productionDate\)/);
assert.match(workspace, /outside the operational Calendar range/);
assert.doesNotMatch(workspace, /router\.refresh|router\.replace/);
assert.match(actions, /const orderedDates = \[\.\.\.new Set\(request\.dates\)\]\.sort\(\)/);
assert.match(actions, /boardEndExclusive = orderedDates\.length \? addDaysToDateOnly/);

console.log('Continuous Calendar range wiring verification passed');
