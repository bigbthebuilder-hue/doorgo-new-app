import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const migrationPath = 'supabase/migrations/20260714000000_create_production_booking_move_contract.sql';
const paths = {
  migration: migrationPath,
  contract: 'lib/production-bookings/production-booking-move-contract.ts',
  service: 'lib/production-bookings/production-booking-service.ts',
  actions: 'lib/production-bookings/production-booking-actions.ts',
  tests: 'lib/production-bookings/production-booking-move-contract.test.ts',
  docs: 'docs/production-booking-move-contract.md',
};
for (const path of Object.values(paths)) {
  assert.ok(existsSync(path), `Missing Phase 2F-D2 file: ${path}`);
}

const read = (path) => readFileSync(path, 'utf8');
const normalized = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sql = normalized(read(paths.migration));
const contract = read(paths.contract);
const service = read(paths.service);
const actions = read(paths.actions);
const tests = read(paths.tests);
const docs = read(paths.docs);
const packageJson = JSON.parse(read('package.json'));

function functionBlock(name) {
  const match = sql.match(new RegExp(`create or replace function public\\.${name}\\s*\\(([\\s\\S]*?)\\)\\s*(?:returns table \\([\\s\\S]*?\\)|returns [a-z]+)[\\s\\S]*?\\$\\$;`));
  assert.ok(match, `Missing function ${name}`);
  return match[0];
}

assert.match(sql, /^begin;/);
assert.match(sql, /commit;$/);
assert.match(sql, /alter table public\.dg_production_bookings alter column booking_kind set not null/);
assert.match(sql, /constraint dg_production_bookings_booking_kind_allowed check \(booking_kind in \('production', 'placeholder'\)\)/);
assert.doesNotMatch(sql, /alter column booking_kind set default/, 'Booking kind must remain an explicit choice');
assert.match(sql, /booking_kind is null[\s\S]*booking_kind not in \('production', 'placeholder'\)/);

assert.match(sql, /create table public\.dg_production_booking_moves/);
for (const field of ['move_id uuid primary key', 'command_id uuid not null', 'booking_id text not null', 'from_production_date date not null', 'to_production_date date not null', 'shop_hours_snapshot numeric\(10,2\) not null', 'actor_user_id uuid null', 'actor_display_name_snapshot text not null', 'moved_at timestamptz not null', 'original_updated_at_snapshot timestamptz null', 'wholly_unstarted_acknowledged boolean not null']) {
  assert.ok(sql.includes(field.replaceAll('\\', '')), `Missing move-history field: ${field}`);
}
assert.match(sql, /unique \(command_id\)/);
assert.match(sql, /foreign key \(booking_id\) references public\.dg_production_bookings\(booking_id\) on delete restrict/);
assert.match(sql, /foreign key \(actor_user_id\) references auth\.users\(id\) on delete set null/);
assert.match(sql, /dg_production_booking_moves_dates_differ check \(to_production_date <> from_production_date\)/);
assert.doesNotMatch(sql, /to_production_date > from_production_date/);
assert.match(sql, /dg_production_booking_moves_actor_display_name_not_empty check \(pg_catalog\.length\(pg_catalog\.btrim\(actor_display_name_snapshot\)\) > 0\)/);
assert.match(sql, /dg_production_booking_moves_acknowledged check \(wholly_unstarted_acknowledged = true\)/);
assert.match(sql, /create trigger dg_production_booking_moves_immutable before update or delete/);
assert.match(sql, /old\.actor_user_id is not null and new\.actor_user_id is null/);
assert.match(sql, /new\.actor_display_name_snapshot[\s\S]*old\.actor_display_name_snapshot/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke select, insert, update, delete, truncate on public\.dg_production_booking_moves from anon, authenticated/);
assert.match(sql, /revoke insert, update, delete, truncate on public\.dg_production_bookings from anon, authenticated/);

const parser = functionBlock('parse_production_booking_date');
assert.match(parser, /\^\[0-9\]\{4\}-\[0-9\]\{2\}-\[0-9\]\{2\}\$/);
assert.match(parser, /invalid_datetime_format or datetime_field_overflow/);
assert.match(parser, /to_char\(v_date, 'yyyy-mm-dd'\) is distinct from p_value/);

const readRpc = functionBlock('read_recent_production_recovery_bookings');
assert.match(readRpc, /p_start_date date, p_end_date date, p_limit integer/);
assert.match(readRpc, /security definer set search_path = ''/);
assert.match(sql, /alter function public\.read_recent_production_recovery_bookings\(date, date, integer\) owner to postgres/);
assert.match(readRpc, /auth\.uid\(\)/);
assert.match(readRpc, /not v_profile\.active/);
assert.match(readRpc, /permission_key = 'production' and permission\.access_level in \('view', 'use'\)/);
assert.doesNotMatch(readRpc, /is_manager|permission_key = '(?:calendar|production_checkpoints)'/);
assert.match(readRpc, /clock_timestamp\(\) at time zone 'america\/vancouver'/);
assert.match(readRpc, /p_start_date > p_end_date[\s\S]*p_end_date >= v_today[\s\S]*p_end_date - p_start_date > 93/);
assert.match(readRpc, /p_limit < 1 or p_limit > 100/);
assert.match(readRpc, /parse_production_booking_date\(booking\.production_date\)/);
for (const predicate of [
  "booking.booking_kind = 'production'", 'booking.deleted_at is null', 'booking.cancelled_at is null',
  "booking.status = 'active'", "booking.schedule_status = 'confirmed'", 'booking.board_visible is distinct from false',
  'booking.locked is distinct from true', 'booking.shop_hours is not null', 'booking.completed_at is null',
]) assert.ok(readRpc.includes(predicate), `Missing read eligibility: ${predicate}`);
assert.match(readRpc, /order by parsed\.production_date desc[\s\S]*booking\.booking_id[\s\S]*limit p_limit/);
assert.doesNotMatch(readRpc, /title\s+(?:ilike|like)|similarity\(|soundex|customer/);
assert.doesNotMatch(readRpc, /calendar_id\s+as|calendar_event_id\s+as/);

const moveRpc = functionBlock('move_production_booking_to_today');
assert.match(moveRpc, /p_command_id uuid, p_booking_id text, p_expected_production_date date, p_wholly_unstarted_acknowledged boolean/);
assert.match(moveRpc, /security definer set search_path = ''/);
assert.match(sql, /alter function public\.move_production_booking_to_today\(uuid, text, date, boolean\) owner to postgres/);
assert.match(moveRpc, /permission_key = 'production' and permission\.access_level = 'use'/);
assert.doesNotMatch(moveRpc, /is_manager|permission_key = '(?:calendar|production_checkpoints)'/);
assert.match(moveRpc, /v_profile\.display_name is null[\s\S]*length\(pg_catalog\.btrim\(v_profile\.display_name\)\) = 0/);
assert.match(moveRpc, /p_wholly_unstarted_acknowledged is distinct from true[\s\S]*acknowledgement_required/);
assert.match(moveRpc, /dg_production_booking_move_command:/);
assert.match(moveRpc, /dg_production_booking_move_booking:/);
assert.ok(moveRpc.indexOf('dg_production_booking_move_command:') < moveRpc.indexOf('dg_production_booking_move_booking:'), 'Command lock must precede booking lock');
assert.match(moveRpc, /where move\.command_id = p_command_id/);
assert.match(moveRpc, /command_uuid_collision/);
assert.match(moveRpc, /from public\.dg_production_bookings as booking where booking\.booking_id = p_booking_id for update/);
assert.match(moveRpc, /v_current_date is distinct from p_expected_production_date[\s\S]*stale_booking/);
for (const predicate of [
  "v_booking.booking_kind is distinct from 'production'", 'v_booking.deleted_at is not null', 'v_booking.cancelled_at is not null',
  "v_booking.status is distinct from 'active'", "v_booking.schedule_status is distinct from 'confirmed'",
  'v_booking.board_visible is not distinct from false', 'v_booking.locked is not distinct from true',
  'v_booking.shop_hours is null', 'v_booking.completed_at is not null',
]) assert.ok(moveRpc.includes(predicate), `Missing locked move eligibility: ${predicate}`);
assert.match(moveRpc, /update public\.dg_production_bookings as booking set production_date = pg_catalog\.to_char\(v_today, 'yyyy-mm-dd'\), updated_at = v_moved_at where booking\.booking_id = p_booking_id/);
assert.doesNotMatch(sql, /insert into public\.dg_production_bookings/);
assert.match(moveRpc, /insert into public\.dg_production_booking_moves/);
assert.match(moveRpc, /actor_display_name_snapshot[\s\S]*pg_catalog\.btrim\(v_profile\.display_name\)/);
assert.doesNotMatch(moveRpc.match(/returns table \([\s\S]*?\) language plpgsql/)?.[0] ?? '', /actor_user_id|actor_display_name_snapshot/);
assert.doesNotMatch(moveRpc, /dg_production_flow_checkpoints|dg_daily_capacity|dg_jobs|shop_date|calendar_sync|calendar_event|calendar_id|overload/);

for (const signature of [
  'read_recent_production_recovery_bookings\\(date, date, integer\\)',
  'move_production_booking_to_today\\(uuid, text, date, boolean\\)',
]) {
  assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from public`));
  assert.match(sql, new RegExp(`revoke all on function public\\.${signature} from anon`));
  assert.match(sql, new RegExp(`grant execute on function public\\.${signature} to authenticated`));
}

assert.match(service, /^import 'server-only';/);
assert.match(service, /createAuthenticatedSupabaseServerClient/);
assert.match(service, /getCurrentDoorGoAccess/);
assert.match(service, /getPermissionAccess\(access, 'production'\) !== 'use'/);
assert.match(service, /hasAtLeastView\(access, 'production'\)/);
assert.match(service, /supabase\.rpc\(name, parameters\)/);
assert.doesNotMatch(service + actions, /trusted-read-server|service[_-]?role|\.from\(|calendar/i);
assert.match(actions, /^'use server';/);
assert.match(actions, /moveProductionBookingToToday/);
for (const path of ['/production-board', '/production-checkpoints', '/production-recovery']) {
  assert.ok(contract.includes(`'${path}'`), `Missing revalidation path ${path}`);
}
assert.match(actions, /revalidatePath\(path\)/);
assert.doesNotMatch(actions, /supabase|\.rpc\(|\.from\(/);
assert.match(contract, /Do not include this moved job's hours in Actual carry\./);
assert.doesNotMatch(contract + service + actions, /calendarEventId\s*:\s*|calendarId\s*:\s*|googleapis|apps script/i);

for (const marker of [
  "canReadProductionRecovery('none')", "canReadProductionRecovery('view')", "canReadProductionRecovery('use')",
  'whollyUnstartedAcknowledged: false', "booking_kind: 'placeholder'", 'explicitly_completed: true',
  'stale_booking', 'already_moved', 'ineligible_booking', 'closed_date_override_required', 'command_uuid_collision',
  'an idempotent database retry maps to the original success', 'PRODUCTION_RECOVERY_CARRY_WARNING',
  "'actorUserId' in success.move",
]) assert.ok(tests.includes(marker), `Missing focused test marker: ${marker}`);

assert.match(docs, /Supabase is the permanent production[\s\S]*schedule source of truth/i);
assert.match(docs, /Google Calendar is import-only/i);
assert.match(docs, /booking_kind = 'production'[\s\S]*booking_kind = 'placeholder'/i);
assert.match(docs, /partly completed[\s\S]*Production Carry Checkpoint/i);
assert.match(docs, /not active until final cutover/i);
assert.match(docs, /source and destination dates[\s\S]*differ[\s\S]*past source date[\s\S]*Vancouver today/i);
assert.match(docs, /display name[\s\S]*server-derived snapshot[\s\S]*ON DELETE SET NULL/i);
assert.ok(packageJson.scripts['verify:phase-2f-d2-production-booking-move-contract']);

const migrationPaths = readdirSync('supabase/migrations')
  .filter((name) => name.endsWith('.sql'))
  .map((name) => `supabase/migrations/${name}`)
  .sort();
assert.ok(migrationPaths.includes(migrationPath), `Missing exact D2 migration: ${migrationPath}`);
for (const functionName of [
  'read_recent_production_recovery_bookings',
  'move_production_booking_to_today',
]) {
  const definingMigrations = migrationPaths.filter((path) =>
    new RegExp(`create\\s+or\\s+replace\\s+function\\s+public\\.${functionName}\\s*\\(`, 'i').test(read(path)),
  );
  const expectedDefinitions = functionName === 'move_production_booking_to_today'
    ? [migrationPath, 'supabase/migrations/20260715000000_extend_production_booking_reschedule_contract.sql']
    : [migrationPath];
  assert.deepEqual(definingMigrations, expectedDefinitions, `Only reviewed migrations may define ${functionName}`);
}
if (existsSync('app/production-recovery/page.tsx')) {
  assert.ok(existsSync('scripts/verify-phase-2f-d3-production-recovery-ui.mjs'), 'A later production-recovery UI requires its permanent D3 verifier');
}
assert.doesNotMatch(
  [sql, contract, service, actions].join('\n'),
  /googleapis|apps script|calendar[_ -]?outbox|permission_key\s*=\s*['"]calendar['"]/i,
  'D2 must not add Calendar runtime dependencies or authorization',
);
assert.doesNotMatch(
  moveRpc,
  /(?:update|insert into)\s+[^;]*(?:calendar_id|calendar_event_id|calendar_sync_state|start_time|end_time)/i,
  'The move RPC must not mutate legacy Calendar fields',
);

console.log('Phase 2F-D2 production booking move static contract verification passed');
