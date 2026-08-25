import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workspace=readFileSync('components/CalendarWorkspace.tsx','utf8');
const css=readFileSync('app/globals.css','utf8');
const presentation=readFileSync('lib/calendar/presentation.ts','utf8');

assert.match(workspace,/setExpandedWithAnchor[\s\S]*viewportAnchorAdjustment/);
assert.match(workspace,/dragOwnedGesture\.current/);
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
assert.doesNotMatch(presentation,/#dcfce7|#fef3c7|#ffe4e6/);

console.log('Calendar interaction and presentation static verification passed');
