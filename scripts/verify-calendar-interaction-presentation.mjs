import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace=readFileSync('components/CalendarWorkspace.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');
const presentation=readFileSync('lib/calendar/presentation.ts','utf8');

assert.match(workspace,/setExpandedWithAnchor[\s\S]*viewportAnchorAdjustment/);
assert.match(workspace,/dragOwnedGesture\.current/);
assert.match(workspace,/isActiveCalendarDragOrigin\(event\.target as Element\)/);
assert.match(workspace,/onPointerUpCapture[^\n]+consumeOutsideCalendarClick\.current=false/);
assert.match(workspace,/onCardDragStart[\s\S]*draggedCard\.current = card[\s\S]*dataTransfer\.setData/);
assert.doesNotMatch(workspace,/onPointerDownCapture=[\s\S]*setExpandedDate\(null\)/);
assert.doesNotMatch(workspace,/onFocus=\{\(\) => \{ setExpandedDate\(null\)/);
assert.match(workspace,/calendar-month-row[^\n]+setExpandedWithAnchor\(null\)/);
assert.doesNotMatch(workspace,/Link status|DoorGo-linked|'Unlinked'/);
assert.match(workspace,/Open Job/);
assert.match(css,/calendar-day:not\(\[data-expanded="true"\]\):hover[^\n]+rgb\(0 0 0\)/);
assert.match(css,/calendar-day\[data-expanded="true"\][^\n]+rgb\(14 165 233\)/);
assert.match(css,/prefers-reduced-motion: reduce/);
for(const state of ['free','full','over','closed','unknown'])assert.match(css,new RegExp(`data-capacity-state="${state}"`));
assert.match(presentation,/CALENDAR_LAYER_PALETTE/);
assert.match(presentation,/CALENDAR_LAYER_PALETTE = \[[\s\S]*id: 'brown'/);
assert.doesNotMatch(presentation,/#ecfdf5|#fef9c3|#fee2e2|#f1f5f9|#f8fafc/);

console.log('Calendar interaction and presentation static verification passed');
