import assert from 'node:assert/strict';
import fs from 'node:fs';

const loader=fs.readFileSync('lib/production-board/queries.ts','utf8');
const links=fs.readFileSync('lib/production-board/native-job-links.ts','utf8');
const search=fs.readFileSync('lib/calendar/calendar-item-actions.ts','utf8');
const scheduledSearch=search.slice(search.indexOf('export async function searchScheduledCalendar'),search.indexOf('export async function createCalendarItem'));
const calendar=fs.readFileSync('components/CalendarWorkspace.tsx','utf8');
const backorder=fs.readFileSync('components/calendar/AddBackorderDialog.tsx','utf8');
const nav=fs.readFileSync('components/app-shell/DesktopNav.tsx','utf8');
const jobs=fs.readFileSync('components/jobs/JobHeaderForm.tsx','utf8');
const guardrails=fs.readFileSync('docs/DOORGO_CALENDAR_PERFORMANCE_GUARDRAILS.md','utf8');

assert.match(loader,/loadCalendarNativeJobLinks/);
assert.doesNotMatch(loader,/repository\.findById/);
assert.doesNotMatch(loader,/dg_calendar_item_order_memberships|dg_fulfillment_order_portions/);
assert.match(links,/byVisibleIdentifier/);
assert.match(links,/byInternalJobId/);
assert.match(links,/listPage\(\{ limit: 100, cursor \}\)/);
assert.doesNotMatch(scheduledSearch,/repository\.findById/);
assert.match(nav,/useLinkStatus/);
assert.match(nav,/Loading…/);
assert.match(nav,/aria-busy/);
assert.match(calendar,/Searching…/);
assert.match(calendar,/Completing…/);
assert.match(calendar,/Reopening…/);
assert.match(calendar,/Deleting…/);
assert.match(backorder,/if\(pending\)return/);
assert.match(backorder,/finally\{setPending\(false\);\}/);
assert.match(jobs,/pendingSaveIntent/);
assert.match(jobs,/Save and Exit/);
assert.match(guardrails,/Do not perform per-card database or RPC enrichment/);
assert.match(guardrails,/Load detail, history, fulfillment-family, and full Job aggregate data only/);
assert.match(guardrails,/acknowledge itself immediately at the initiating control/);

console.log('Calendar performance and pending-action guardrails verified.');
