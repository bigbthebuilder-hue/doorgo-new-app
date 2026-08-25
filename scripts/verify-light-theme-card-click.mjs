import assert from 'node:assert/strict';
import fs from 'node:fs';

const css=fs.readFileSync('app/globals.css','utf8');
const workspace=fs.readFileSync('components/CalendarWorkspace.tsx','utf8');
const interaction=fs.readFileSync('lib/calendar/interaction.ts','utf8');

assert.match(css,/@media \(prefers-color-scheme: light\)/);
for(const token of ['--app-color-panel','--app-color-input','--app-color-readonly','--app-color-divider','--app-color-hover-border','--app-color-focus'])assert.match(css,new RegExp(token));
assert.match(css,/input:not\(\[type="checkbox"\]\)[\s\S]*background-color: var\(--app-color-input\)/);
assert.match(css,/:is\(:disabled, \[readonly\]\)[\s\S]*background-color: var\(--app-color-readonly\)/);
assert.match(css,/:focus-visible[\s\S]*var\(--app-color-focus\)/);
assert.match(css,/@media \(prefers-color-scheme: light\) and \(hover: hover\) and \(pointer: fine\)/);
assert.doesNotMatch(css,/\.calendar-production-card[^\n]*background:\s*var\(--app-color-(?:surface|panel|readonly|input)\)/);
assert.doesNotMatch(css,/\.calendar-day\[data-capacity-state[^\n]*var\(--app-color-(?:surface|panel|readonly|input)\)/);

assert.match(interaction,/shouldExpandCollapsedCalendarCard/);
assert.match(interaction,/!input\.dragGesture&&!input\.interactiveChild&&input\.expandedDate!==input\.dayDate/);
assert.match(workspace,/suppressCardClick/);
assert.match(workspace,/shouldExpandCollapsedCalendarCard\(\{dayDate:day\.date,expandedDate,interactiveChild,dragGesture:suppressCardClick\.current\}\)/);
assert.match(workspace,/onClick=\{\(event\)=>\{event\.stopPropagation\(\);onClick\?\./);

console.log('Light-theme contrast primitives and collapsed-card click wiring verified.');
