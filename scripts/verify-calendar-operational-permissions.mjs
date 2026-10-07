import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Module, { createRequire } from 'node:module';
import ts from 'typescript';

const migration = '20261006201036_calendar_operational_permissions.sql';
const read = file => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const sql = read('supabase/migrations/' + migration);
const extract = (source, name) => new RegExp('CREATE OR REPLACE FUNCTION public\\.' + name + '\\s*\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$\\s*;', 'i').exec(source)?.[0];
const historical = fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql') && name < migration).sort();
const names = ['place_production_booking', 'complete_production_booking', 'reopen_production_booking', 'reschedule_production_booking', 'reorder_production_day', 'reorder_production_needs_attention', 'create_calendar_item', 'reorder_calendar_items', 'delete_calendar_production_booking', 'convert_calendar_note', 'dg_staff_away_scope'];
assert.equal((sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, names.length);
for (const [index, name] of names.entries()) {
  const old = historical.map(file => extract(read('supabase/migrations/' + file), name)).filter(Boolean).at(-1);
  assert.ok(old, name);
  const clone = index < 6;
  const target = clone ? 'calendar_' + name : name;
  let expected = old;
  if (clone) {
    expected = expected.replace('public.' + name + '(', 'public.' + target + '(').replace(/permission_key\s*=\s*'production'/g, "permission_key = 'calendar'");
    if (name === 'place_production_booking') expected = expected.replace(/  IF FOUND AND NOT EXISTS\(SELECT 1 FROM public\.dg_user_permissions[^\n]*jobs_permission_required[^\n]*\n/, '');
    assert.equal(extract(sql, name), undefined, 'planning RPC must remain untouched');
    assert.match(sql, new RegExp('REVOKE ALL ON FUNCTION public\\.' + target + '\\([^)]*\\) FROM PUBLIC, anon;'));
    assert.match(sql, new RegExp('GRANT EXECUTE ON FUNCTION public\\.' + target + '\\([^)]*\\) TO authenticated;'));
  } else if (name === 'dg_staff_away_scope') {
    expected = expected.replace("p.permission_key='production'\n      AND (p.access_level='use' OR (NOT p_require_use AND p.access_level='view'))", "((p_require_use AND p.permission_key='calendar' AND p.access_level='use')\n        OR (NOT p_require_use AND p.permission_key IN ('calendar','production') AND p.access_level IN ('view','use')))");
  } else {
    expected = expected.replace(/dg_calendar_require_use\((?:true|p_item_type='production'|p_destination IN\('production','staff_away'\))\)/g, 'dg_calendar_require_use(false)');
    if (name === 'reorder_calendar_items') expected = expected.replace(/      IF NOT EXISTS \(SELECT 1 FROM public\.dg_user_permissions[^\n]*production_permission_required[^\n]*\n/, '');
  }
  assert.equal(extract(sql, target), expected, target + ': preserve signature, security, validation, mutations and audit exactly outside authorization');
}
assert.doesNotMatch(sql, /CREATE POLICY|DROP |DELETE FROM public\.dg_native_jobs|permission_key\s*=\s*'production_checkpoints'/);
assert.match(sql, /shop_date IS NOT DISTINCT FROM v_date/);
assert.match(sql, /completed_booking/);
assert.match(sql, /INSERT INTO public\.dg_production_booking_delete_events/);

// Run actual server actions with mocked identity/transport, never a database.
const require = createRequire(import.meta.url);
const originalLoad = Module._load;
require.extensions['.ts'] = (module, file) => module._compile(ts.transpileModule(read(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, file);
let access;
const calls = [];
let responseError = null;
const id = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-10-06T20:00:00Z';
const card = { bookingId: 'booking-1', productionDate: '2026-10-07', completedAt: null };
const rpc = async (name, args) => {
  calls.push({ name, args });
  if (responseError) return { data: null, error: { message: responseError } };
  let data = { id: 'booking-1', record_kind: 'production', revision: 2, periodId: id };
  if (name.includes('complete_production') || name.includes('reopen_production')) {
    const reopen = name.includes('reopen');
    data = [{ event_id: id, booking_id: 'booking-1', production_date: '2026-10-07', previous_completed_at: reopen ? timestamp : null, resulting_completed_at: reopen ? null : timestamp, occurred_at: timestamp, action_type: reopen ? 'reopened' : 'completed', status: reopen ? 'reopened' : 'completed' }];
  } else if (name === 'calendar_place_production_booking') data = [{ move_id: id, booking_id: 'booking-1', previous_production_date: '2026-10-07', new_production_date: '2026-10-08', previous_day_order: 1024, new_day_order: 2048, shop_hours: 2, moved_at: timestamp, action_type: 'reschedule', destination_was_closed: false, status: 'moved' }];
  else if (name === 'calendar_reorder_production_day') data = [{ booking_id: 'booking-1', day_order: 1024, updated_at: timestamp }];
  return { data, error: null };
};
Module._load = function (name, parent, main) {
  if (name === 'server-only') return {};
  if (name === '@/lib/auth/current-access') return { getCurrentDoorGoAccess: async () => access };
  if (name === '@/lib/supabase/server') return { createAuthenticatedSupabaseServerClient: async () => ({ rpc }) };
  if (name === '@/lib/production-board/queries') return { loadProductionBoardReadOnly: async () => ({ needsAttentionCards: [card, { ...card, bookingId: 'item:' + id }], days: [] }) };
  if (['@/lib/jobs/job-intake-repository', '@/lib/jobs/job-intake-service', '@/lib/supabase/trusted-read-server'].includes(name)) return {};
  return originalLoad.call(this, name.startsWith('@/') ? path.resolve(name.slice(2)) : name, parent, main);
};
const { resolveCurrentDoorGoAccess, canUse } = require('../lib/auth/access.ts');
const { canMutateCalendar } = require('../lib/calendar/permissions.ts');
const actions = require('../lib/production-bookings/calendar-production-actions.ts');
const items = require('../lib/calendar/calendar-item-actions.ts');
const away = require('../lib/calendar/staff-away-actions.ts');
const fulfill = require('../lib/calendar/fulfillment-actions.ts');
const base = { commandId: id, bookingId: 'booking-1', expectedProductionDate: '2026-10-07' };
const item = { commandId: id, itemId: id, expectedRevision: 1 };
const operations = [
  () => items.searchCalendarLinkableJobs({query:'Customer',itemType:'note'}),
  () => items.loadCalendarEdit('booking-1'),
  () => items.saveCalendarEdit({key:'booking-1'},{name:'Test',date:'2026-10-08'},false),
  () => actions.placeCalendarProductionBooking({ ...base, destinationProductionDate: '2026-10-08', whollyUnstartedAcknowledged: false, backdateReason: null, closedDateOverrideAcknowledged: false }),
  () => actions.reorderCalendarProductionDay({ productionDate: '2026-10-07', expectedBookingIds: ['booking-1'], orderedBookingIds: ['booking-1'] }),
  () => actions.reorderCalendarNeedsAttention({ expectedBookingIds: [], orderedBookingIds: [] }),
  () => actions.completeCalendarProductionBooking(base),
  () => actions.reopenCalendarProductionBooking({ ...base, expectedCompletedAt: timestamp }),
  () => actions.deleteCalendarProductionBooking({ ...base, expectedUpdatedAt: timestamp }),
  () => items.createCalendarItem({ commandId: id, itemType: 'production', linkedInternalJobId: null, name: 'Unlinked', salesperson: 'Staff', scheduledDate: '2026-10-07' }),
  () => items.moveCalendarItem({ ...item, destinationDate: null, closedAcknowledged: false }),
  () => items.setCalendarItemCompletion({ ...item, completed: true }),
  () => items.setCalendarItemCompletion({ ...item, completed: false }),
  () => items.deleteCalendarItem(item),
  () => items.reorderCalendarItems({ scheduledDate: null, expectedKeys: ['production:booking-1', 'item:' + id], orderedKeys: ['item:' + id, 'production:booking-1'] }),
  () => items.updateCalendarNote({ ...item, title: 'Note', linkedInternalJobId: null }),
  ...['production', 'delivery', 'customer_pickup', 'staff_away'].map(destination => () => items.convertCalendarNote({ ...item, destination })),
  () => away.saveStaffAway({ commandId: id, periodId: null, expectedRevision: null, staffId: id, startDate: '2026-10-07', endDate: '2026-10-07', mode: 'full_day', partialDragHours: null, reason: 'Away' }),
  () => away.deleteStaffAway({ commandId: id, periodId: id, expectedRevision: 1 }),
  () => fulfill.setFulfillmentItemType({ ...item, itemType: 'customer_pickup' }),
];
for (const level of ['none', 'view', 'use']) for (const planning of ['none', 'use']) {
  access = resolveCurrentDoorGoAccess({ user: { id }, profile: { user_id: id, display_name: 'Staff', active: true, is_manager: false, company_location: null, must_change_password: false }, permissionRows: [{ permission_key: 'calendar', access_level: level }, { permission_key: 'production', access_level: planning }, { permission_key: 'production_checkpoints', access_level: planning }] });
  assert.equal(canMutateCalendar(access), level === 'use');
  assert.equal(canUse(access, 'settings'), false);
  for (const operation of operations) {
    calls.length = 0;
    const result = await operation();
    assert.equal(result.ok, level === 'use', JSON.stringify(result));
    assert.equal(calls.length, level === 'use' ? 1 : 0);
  }
}
responseError = 'production_booking_delete.completed_booking';
assert.equal((await actions.deleteCalendarProductionBooking({ ...base, expectedUpdatedAt: timestamp })).code, 'completed_booking');
responseError = 'production_placement.closed_date_override_required';
assert.equal((await actions.placeCalendarProductionBooking({ ...base, destinationProductionDate: '2026-10-08', whollyUnstartedAcknowledged: false, backdateReason: null, closedDateOverrideAcknowledged: false })).code, 'closed_date_override_required');
responseError = null;
assert.ok(calls.every(call => !call.name.includes('checkpoint')));
const { getCalendarProductionMoveBlockReason: manualMove } = require('../lib/calendar/production-move-eligibility.ts');
const { getProductionScheduleCardMoveBlockReason: planningMove } = require('../lib/production-schedule/move-ui-contract.ts');
const unknownHours = { ...card, bookingKind: 'production', shopHours: null, shopHoursKnown: false, locked: false };
assert.equal(planningMove(unknownHours, false), 'This booking is not eligible to move.');
assert.equal(manualMove(unknownHours, false), null);
assert.equal(manualMove({ ...unknownHours, completedAt: timestamp }, false), 'Reopen this Calendar item before moving it.');
assert.equal(manualMove({ ...unknownHours, locked: true }, false), 'This booking is locked and cannot be moved.');
assert.ok(manualMove({ ...unknownHours, shopHours: -1 }, false));
assert.ok(manualMove(unknownHours, true));
assert.equal(manualMove({ ...unknownHours, completedAt: null }, false), null);
Module._load = originalLoad;
console.log('Calendar permissions: SQL preservation, planning isolation, server view/use matrix, mixed ordering, lifecycle, Staff Away and conversions PASS (mocked RPCs; no database writes).');
