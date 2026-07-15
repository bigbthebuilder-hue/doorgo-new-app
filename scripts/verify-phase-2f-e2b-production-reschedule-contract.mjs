import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const paths = {
  migration: 'supabase/migrations/20260715000000_extend_production_booking_reschedule_contract.sql',
  d2Migration: 'supabase/migrations/20260714000000_create_production_booking_move_contract.sql',
  contract: 'lib/production-bookings/production-booking-reschedule-contract.ts',
  tests: 'lib/production-bookings/production-booking-reschedule-contract.test.ts',
  service: 'lib/production-bookings/production-booking-reschedule-service.ts',
  actions: 'lib/production-bookings/production-booking-reschedule-actions.ts',
  schedule: 'app/production-schedule/page.tsx',
  docs: 'docs/production-booking-reschedule-contract.md',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing E2B path: ${path}`);
const read = (path) => readFileSync(path, 'utf8');
const normalized = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sql = normalized(read(paths.migration));
const contract = read(paths.contract);
const tests = read(paths.tests);
const service = read(paths.service);
const actions = read(paths.actions);
const schedule = read(paths.schedule);
const docs = read(paths.docs);

assert.match(sql, /^begin;[\s\S]*commit;$/);
assert.ok(sql.includes("add column action_type text null default 'recovery_to_today'"));
assert.ok(sql.includes('add column reason text null'));
assert.ok(sql.includes('add column destination_was_closed boolean null default false'));
assert.ok(sql.includes('add column closed_date_override_acknowledged boolean null default false'));
assert.doesNotMatch(sql, /update public\.dg_production_booking_moves/);
assert.doesNotMatch(sql, /alter table public\.dg_production_booking_moves disable trigger|drop trigger dg_production_booking_moves_immutable/);
for (const field of ['action_type', 'destination_was_closed', 'closed_date_override_acknowledged']) assert.match(sql, new RegExp(`alter column ${field} set not null`));
for (const field of ['action_type', 'destination_was_closed', 'closed_date_override_acknowledged']) assert.match(sql, new RegExp(`alter column ${field} drop default`));
assert.doesNotMatch(sql, /alter column (?:action_type|destination_was_closed|closed_date_override_acknowledged) set default/);
assert.match(sql, /action_type in \('recovery_to_today', 'reschedule', 'backdate'\)/);
assert.match(sql, /reason = pg_catalog\.btrim\(reason\)[\s\S]*length\(reason\) between 1 and 500/);
assert.match(sql, /\(action_type = 'backdate'\) = \(reason is not null\)/);
assert.match(sql, /destination_was_closed = closed_date_override_acknowledged/);
assert.match(sql, /action_type <> 'recovery_to_today' or wholly_unstarted_acknowledged = true/);
const addColumns = sql.indexOf("add column action_type text null default 'recovery_to_today'");
const notNull = sql.indexOf('alter column action_type set not null');
const constraints = sql.indexOf('add constraint dg_production_booking_moves_action_type_allowed');
const dropDefaults = sql.indexOf('alter column action_type drop default');
const replaceImmutableFunction = sql.indexOf('create or replace function public.reject_production_booking_move_mutation()');
assert.ok(addColumns >= 0 && addColumns < notNull && notNull < constraints && constraints < dropDefaults && dropDefaults < replaceImmutableFunction, 'Temporary-default backfill ordering is unsafe');

for (const field of ['new.action_type', 'new.reason', 'new.destination_was_closed', 'new.closed_date_override_acknowledged', 'old.action_type', 'old.reason', 'old.destination_was_closed', 'old.closed_date_override_acknowledged']) assert.ok(sql.includes(field), `Immutable trigger omits ${field}`);
assert.match(sql, /old\.actor_user_id is not null and new\.actor_user_id is null/);

const general = sql.match(/create or replace function public\.reschedule_production_booking\([\s\S]*?\$\$;/)?.[0] ?? '';
assert.ok(general, 'Missing general reschedule RPC');
assert.match(general, /p_command_id uuid, p_booking_id text, p_expected_production_date date, p_destination_production_date date, p_wholly_unstarted_acknowledged boolean, p_backdate_reason text, p_closed_date_override_acknowledged boolean/);
for (const result of ['move_id uuid', 'booking_id text', 'previous_production_date date', 'new_production_date date', 'shop_hours numeric(10,2)', 'moved_at timestamptz', 'action_type text', 'destination_was_closed boolean', 'status text']) assert.ok(general.includes(result), `Missing result ${result}`);
assert.match(general, /security definer set search_path = ''/);
assert.match(general, /auth\.uid\(\)/);
assert.match(general, /not v_profile\.active/);
assert.match(general, /permission_key = 'production' and permission\.access_level = 'use'/);
assert.doesNotMatch(general, /is_manager|company_location|permission_key = '(?:calendar|production_checkpoints)'/);
assert.match(general, /clock_timestamp\(\) at time zone 'america\/vancouver'/);
assert.match(general, /public\.parse_production_booking_date\(v_booking\.production_date\)/);
assert.match(general, /v_current_date is distinct from p_expected_production_date[\s\S]*stale_booking/);
assert.match(general, /v_current_date = p_destination_production_date[\s\S]*no_change/);
assert.match(general, /v_current_date <= v_today[\s\S]*acknowledgement_required/);
assert.match(general, /p_destination_production_date < v_today[\s\S]*v_action_type := 'backdate'[\s\S]*backdate_reason_required/);
assert.match(general, /capacity\.production_date = p_destination_production_date and capacity\.is_closed is true/);
assert.match(general, /v_destination_was_closed[\s\S]*closed_date_override_required/);
assert.doesNotMatch(general, /available_hours|overload/);

const commandLock = general.indexOf('dg_production_booking_move_command:');
const bookingLock = general.indexOf('dg_production_booking_move_booking:');
const existingLookup = general.indexOf('where move.command_id = p_command_id');
const rowLock = general.indexOf('where booking.booking_id = p_booking_id for update');
assert.ok(commandLock >= 0 && commandLock < existingLookup && existingLookup < bookingLock && bookingLock < rowLock, 'Required retry-first lock order is absent');
assert.ok(rowLock < general.indexOf('v_today :='), 'Vancouver today must be derived only on the first-execution path after the booking row lock');
for (const comparison of ['actor_user_id', 'booking_id', 'from_production_date', 'to_production_date', 'wholly_unstarted_acknowledged', 'reason', 'closed_date_override_acknowledged']) assert.match(general, new RegExp(`v_existing\.${comparison}`));
assert.match(general, /v_existing\.action_type not in \('reschedule', 'backdate'\)/);
const completedRetry = general.slice(existingLookup, bookingLock);
assert.doesNotMatch(completedRetry, /dg_daily_capacity|v_today|v_action_type|v_booking|updated_at/);
assert.match(completedRetry, /v_existing\.action_type, v_existing\.destination_was_closed, 'moved'::text; return;/);
assert.ok(completedRetry.indexOf('return;') < general.indexOf('update public.dg_production_bookings'), 'Completed retry must return before mutation');
assert.match(general, /command_uuid_collision/);
for (const predicate of ["booking_kind is distinct from 'production'", 'deleted_at is not null', 'cancelled_at is not null', "status is distinct from 'active'", "schedule_status is distinct from 'confirmed'", 'board_visible is not distinct from false', 'locked is not distinct from true', 'completed_at is not null', 'shop_hours is null']) assert.ok(general.includes(predicate), `Missing eligibility: ${predicate}`);
assert.match(general, /update public\.dg_production_bookings as booking set production_date = pg_catalog\.to_char\(p_destination_production_date, 'yyyy-mm-dd'\), updated_at = v_moved_at where booking\.booking_id = p_booking_id/);
assert.doesNotMatch(sql, /insert into public\.dg_production_bookings/);
assert.match(general, /insert into public\.dg_production_booking_moves/);
assert.doesNotMatch(general, /dg_jobs|shop_date|calendar_id|calendar_event_id|calendar_sync|start_time|end_time|dg_production_flow_checkpoints|update public\.dg_daily_capacity/);

const d2 = sql.match(/create or replace function public\.move_production_booking_to_today\([\s\S]*?\$\$;/)?.[0] ?? '';
assert.match(d2, /action_type[\s\S]*'recovery_to_today'/);
assert.match(d2, /reason[\s\S]*null/);
assert.match(d2, /destination_was_closed[\s\S]*false/);
assert.match(d2, /closed_date_override_acknowledged[\s\S]*false/);
const d2CommandLock = d2.indexOf('dg_production_booking_move_command:');
const d2ExistingLookup = d2.indexOf('where move.command_id = p_command_id');
const d2BookingLock = d2.indexOf('dg_production_booking_move_booking:');
const d2ClosedCheck = d2.indexOf('capacity.production_date = v_today and capacity.is_closed is true');
const d2RowLock = d2.indexOf('where booking.booking_id = p_booking_id for update');
assert.ok(d2CommandLock >= 0 && d2CommandLock < d2ExistingLookup && d2ExistingLookup < d2BookingLock && d2BookingLock < d2ClosedCheck && d2ClosedCheck < d2RowLock, 'D2 retry/closed-date lock order is absent');
assert.match(d2, /v_destination_was_closed[\s\S]*production_booking_move\.closed_date_override_required/);
assert.doesNotMatch(d2.slice(d2ExistingLookup, d2BookingLock), /dg_daily_capacity|v_destination_was_closed/);
assert.match(sql, /alter function public\.move_production_booking_to_today\(uuid, text, date, boolean\) owner to postgres/);
assert.match(sql, /alter function public\.reschedule_production_booking\(uuid, text, date, date, boolean, text, boolean\) owner to postgres/);
assert.match(sql, /revoke all on function public\.reschedule_production_booking\(uuid, text, date, date, boolean, text, boolean\) from public, anon/);
assert.match(sql, /grant execute on function public\.reschedule_production_booking\(uuid, text, date, date, boolean, text, boolean\) to authenticated/);
assert.match(sql, /revoke select, insert, update, delete, truncate on public\.dg_production_booking_moves from anon, authenticated/);

assert.match(service, /^import 'server-only';/);
assert.match(service, /createAuthenticatedSupabaseServerClient/);
assert.match(service, /getCurrentDoorGoAccess/);
assert.match(service, /getPermissionAccess\(access, 'production'\) !== 'use'/);
assert.doesNotMatch(service + actions, /trusted-read-server|service[_-]?role|\.from\(|calendar/i);
assert.match(actions, /^'use server';/);
assert.match(actions, /rescheduleProductionBooking/);
for (const path of ['/production-board', '/production-schedule', '/production-recovery', '/production-checkpoints']) assert.ok(contract.includes(`'${path}'`), `Missing revalidation ${path}`);
assert.match(actions, /revalidatePath\(path\)/);
assert.doesNotMatch(schedule, /production-booking-reschedule-actions|rescheduleProductionBooking|<form|<button|drag/i);

for (const marker of ["access('none')", "access('view')", "access('use')", 'acknowledgement_required', 'backdate_reason_required', 'invalid_backdate_reason', 'closed_date_override_required', 'command_uuid_collision', 'stale_booking', 'secret SQL details', '1.234', 'Vancouver rollover', 'open-to-closed', 'closed-to-open', 'stored action type', 'original closed snapshot', 'materially different acknowledgement', 'materially different normalized reason']) assert.ok(tests.includes(marker), `Missing focused test marker ${marker}`);
const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).map((name) => `supabase/migrations/${name}`);
assert.deepEqual(migrations.filter((path) => /create or replace function public\.reschedule_production_booking\s*\(/i.test(read(path))), [paths.migration]);
const d2Hash = createHash('sha256').update(read(paths.d2Migration).replace(/\r\n/g, '\n')).digest('hex').toUpperCase();
assert.equal(d2Hash, '372D7146EA0E0E921BE2D63E89F3383158C46BFBC9AFCEAAEEF8BD9EFD72A3B0', 'Applied D2 migration changed');
assert.match(docs, /operationally read-only[\s\S]*final cutover/i);
assert.match(docs, /no Started state/i);
assert.match(docs, /first-valid-move-wins/i);
assert.match(docs, /No booking is cloned/i);
assert.ok(JSON.parse(read('package.json')).scripts['verify:phase-2f-e2b-production-reschedule-contract']);

console.log('Phase 2F-E2B production reschedule static contract verification passed (PostgreSQL execution not proven)');
