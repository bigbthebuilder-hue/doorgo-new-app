import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20260825000000_unified_active_calendar_item_delete.sql','utf8');
const nullSync=fs.readFileSync('supabase/migrations/20260825010000_fix_null_fulfillment_sync.sql','utf8');
const hardenedGrants=fs.readFileSync('supabase/migrations/20260825020000_harden_production_delete_event_grants.sql','utf8');
const workspace=fs.readFileSync('components/CalendarWorkspace.tsx','utf8');
const calendarActions=fs.readFileSync('lib/calendar/calendar-item-actions.ts','utf8');
const productionActions=fs.readFileSync('lib/production-bookings/calendar-production-actions.ts','utf8');
const normalize=fs.readFileSync('lib/production-board/normalize.ts','utf8');

for(const token of ['delete_calendar_item','completed_item','backorder_delete_required','primary_fulfillment','linked_fulfillment','fulfillment_plan=NULL','unified_active_delete'])assert.match(migration,new RegExp(token,'i'));
assert.match(migration,/current_portion_id IS NOT NULL[\s\S]*sales_order IS DISTINCT FROM v_primary[\s\S]*backorder_delete_required/);
assert.doesNotMatch(migration,/DELETE FROM public\.dg_native_jobs|DELETE FROM public\.dg_fulfillment_order_portions/);
for(const token of ['dg_production_booking_delete_events','ENABLE ROW LEVEL SECURITY','SECURITY DEFINER SET search_path','delete_calendar_production_booking','completed_booking','stale_booking','shop_date=NULL','shop_hours_snapshot','history_immutable'])assert.match(migration,new RegExp(token,'i'));
assert.match(migration,/dg_calendar_require_use\(true\)/i);
assert.match(migration,/REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public\.dg_production_booking_delete_events FROM anon,authenticated/);
assert.match(migration,/REVOKE ALL ON FUNCTION public\.delete_calendar_production_booking\(uuid,text,date,timestamptz\) FROM PUBLIC,anon/);
assert.match(migration,/GRANT EXECUTE ON FUNCTION public\.delete_calendar_production_booking\(uuid,text,date,timestamptz\) TO authenticated/);
assert.match(nullSync,/fulfillment_plan IS NULL OR NEW\.fulfillment_plan NOT IN\('Delivery','Customer Pickup'\)/);
assert.match(nullSync,/SECURITY DEFINER SET search_path=''/);
assert.match(hardenedGrants,/REVOKE ALL ON TABLE public\.dg_production_booking_delete_events FROM anon,authenticated/);
assert.match(hardenedGrants,/GRANT SELECT ON TABLE public\.dg_production_booking_delete_events TO authenticated/);
assert.match(workspace,/Delete Backorder \{card\.nativeSalesOrder\}/);
assert.match(workspace,/deleteAllowed&&!card\.completedAt/);
assert.match(workspace,/Reopen before deleting\./);
assert.match(workspace,/card\.recordKind==='calendar_item'\?await deleteCalendarItem[\s\S]*deleteCalendarProductionBooking/);
assert.match(calendarActions,/backorder_delete_required:'Use Delete Backorder/);
assert.match(calendarActions,/completed_item:'Reopen this Calendar item before deleting it\.'/);
assert.match(productionActions,/export async function deleteCalendarProductionBooking/);
assert.match(productionActions,/getPermissionAccess\(access,'production'\)!=='use'/);
assert.match(normalize,/updatedAt: row\.updated_at/);

console.log('Unified active Calendar delete lifecycle verification passed');
