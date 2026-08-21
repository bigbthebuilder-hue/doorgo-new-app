import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260821010000_add_production_needs_attention.sql','utf8');
const workspace=fs.readFileSync('components/CalendarWorkspace.tsx','utf8');
const queries=fs.readFileSync('lib/production-board/queries.ts','utf8');
for(const text of ['place_production_booking','reorder_production_needs_attention','production_date IS NULL','dg_native_jobs_sync_shop_date_to_production','jobs_permission_required']) assert.match(migration,new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
assert.match(queries,/\.is\('production_date', null\)/);
assert.match(workspace,/Needs Attention · \{count\}/);
assert.match(workspace,/calendar-needs-attention-dropdown/);
assert.match(workspace,/preview\?<CalendarProductionCard/);
assert.doesNotMatch(workspace,/needsAttentionPosition|NeedsAttentionPanel/);
assert.match(workspace,/placeCalendarProductionBooking/);
assert.doesNotMatch(migration,/1900-01-01|9999-12-31/);
console.log('Calendar Needs Attention static verification passed');
