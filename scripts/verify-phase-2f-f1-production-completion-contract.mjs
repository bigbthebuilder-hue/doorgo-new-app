import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const paths = {
  migration: 'supabase/migrations/20260716000000_create_production_booking_completion_contract.sql',
  contract: 'lib/production-bookings/production-booking-completion-contract.ts',
  service: 'lib/production-bookings/production-booking-completion-service.ts',
  actions: 'lib/production-bookings/production-booking-completion-actions.ts',
  tests: 'lib/production-bookings/production-booking-completion-contract.test.ts',
  docs: 'docs/production-booking-completion-contract.md',
  legacyDocs: 'docs/production-status-events-contract.md',
  e2bMigration: 'supabase/migrations/20260715000000_extend_production_booking_reschedule_contract.sql',
  e2cVerifier: 'scripts/verify-phase-2f-e2c-production-schedule-move-ui.mjs',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing F1 dependency: ${path}`);

const read = (path) => readFileSync(path, 'utf8');
const normalize = (text) => text.replace(/--.*$/gm, '').replace(/\s+/g, ' ').trim().toLowerCase();
const sql = normalize(read(paths.migration));
const contract = read(paths.contract);
const service = read(paths.service);
const actions = read(paths.actions);
const tests = read(paths.tests);
const docs = read(paths.docs);
const legacyDocs = read(paths.legacyDocs);
const normalizedLegacyDocs = legacyDocs.replace(/\s+/g, ' ');
const e2b = normalize(read(paths.e2bMigration));

assert.match(sql, /^begin;/, 'F1 migration must begin transactionally');
assert.match(sql, /commit;$/, 'F1 migration must commit transactionally');
assert.equal((sql.match(/\bbegin;/g) ?? []).length, 1, 'F1 migration must have one outer BEGIN');
assert.equal((sql.match(/\bcommit;/g) ?? []).length, 1, 'F1 migration must have one outer COMMIT');

const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort();
assert.deepEqual(
  migrations.filter((name) => /production_booking_completion_contract/i.test(name)),
  ['20260716000000_create_production_booking_completion_contract.sql'],
  'Exactly one F1 migration is required',
);
const previousMigrationHashes = {
  '20260710000000_create_dg_daily_capacity.sql': 'A6001E0A332494361A5D5ADC7AA86F9640533636069CD8A178C53B94B7CD6C24',
  '20260711000000_create_dg_production_status_events.sql': 'D9CF956340856BAEA9B610508985FC6670ACCFB6AD75CCE3C3F8F4C9F360C7DB',
  '20260711010000_create_dg_production_flow_checkpoints.sql': '054E83BC4DF50220327EC256E31659927F66035DE107C180052D881D400969E6',
  '20260712000000_create_dg_user_profiles.sql': '947068DF2812D8200FD5C907436472B96C356F75457ADB3254BFFA997DA09DD9',
  '20260712010000_create_dg_user_permissions.sql': '2955B1CEF4DC6A20EA0D761DBE9B72B92B25039C0984BCDCE7CAB149F5CC0AD5',
  '20260712020000_add_dg_password_setup_requirement.sql': '523FB9E023CD8CEEDBBC60C0286EC6344BD23E11C28AD4564145026C2536655A',
  '20260712030000_create_production_flow_checkpoint_rpcs.sql': '9CB91780169640D33381FE7AD96F390556156C3BD565336E6BCCF487D1583151',
  '20260712040000_secure_production_flow_checkpoint_link_validator.sql': 'D205364D7D7585676F46A991664F5615A86413F8D9BFAFBBD2B7C810B390A94A',
  '20260713000000_create_production_flow_checkpoint_read_rpcs.sql': '155666268B943A5943921A34798D1B4BB1EC4FC47E5E9369AD0DABCEB4B89F05',
  '20260714000000_create_production_booking_move_contract.sql': '372D7146EA0E0E921BE2D63E89F3383158C46BFBC9AFCEAAEEF8BD9EFD72A3B0',
  '20260715000000_extend_production_booking_reschedule_contract.sql': '96CB1B8C251DB8F1905AE49F9983232E0E8A7C4CCE845A384C91F96859BC83CC',
};
for (const [name, expected] of Object.entries(previousMigrationHashes)) {
  const actual = createHash('sha256')
    .update(read(`supabase/migrations/${name}`).replace(/\r\n?/g, '\n'))
    .digest('hex')
    .toUpperCase();
  assert.equal(actual, expected, `Previous migration changed: ${name}`);
}

assert.match(sql, /create table public\.dg_production_booking_completion_events \(/);
for (const declaration of [
  /event_id uuid primary key default extensions\.gen_random_uuid\(\)/,
  /command_id uuid not null/,
  /booking_id text not null/,
  /production_date date not null/,
  /action_type text not null/,
  /actor_user_id uuid null/,
  /actor_display_name_snapshot text not null/,
  /occurred_at timestamptz not null/,
  /previous_completed_at timestamptz null/,
  /resulting_completed_at timestamptz null/,
  /reopen_reason text null/,
]) assert.match(sql, declaration);
assert.match(sql, /unique \(command_id\)/, 'Command UUID must be unique');
assert.match(sql, /foreign key \(booking_id\) references public\.dg_production_bookings\(booking_id\) on delete restrict/);
assert.match(sql, /foreign key \(actor_user_id\) references auth\.users\(id\) on delete set null/);
assert.match(sql, /check \(action_type in \('completed', 'reopened'\)\)/, 'Only completed/reopened actions are allowed');
assert.match(sql, /action_type = 'completed' and previous_completed_at is null and resulting_completed_at is not null and reopen_reason is null/);
assert.match(sql, /action_type = 'reopened' and previous_completed_at is not null and resulting_completed_at is null and reopen_reason is not null/);
assert.match(sql, /reopen_reason = pg_catalog\.btrim\(reopen_reason\)[\s\S]*length\(reopen_reason\) between 1 and 500/);

assert.match(sql, /create trigger dg_production_booking_completion_events_immutable before update or delete/);
assert.match(sql, /old\.actor_user_id is not null and new\.actor_user_id is null/);
assert.match(sql, /production booking completion history is immutable/);
assert.match(sql, /alter function public\.reject_production_booking_completion_event_mutation\(\) owner to postgres/);
assert.match(sql, /revoke all on function public\.reject_production_booking_completion_event_mutation\(\) from public, anon, authenticated/);
assert.match(sql, /enable row level security/);
assert.match(sql, /revoke all on table public\.dg_production_booking_completion_events from public, anon, authenticated/);

const functionStart = (name) => sql.indexOf(`create or replace function public.${name}(`);
const completeStart = functionStart('complete_production_booking');
const reopenStart = functionStart('reopen_production_booking');
assert.ok(completeStart >= 0 && reopenStart > completeStart, 'Both explicit completion RPCs are required');
const complete = sql.slice(completeStart, reopenStart);
const reopen = sql.slice(reopenStart, sql.indexOf('revoke all on function public.complete_production_booking'));
assert.match(complete, /p_command_id uuid, p_booking_id text, p_expected_production_date date/);
assert.match(reopen, /p_command_id uuid, p_booking_id text, p_expected_production_date date, p_expected_completed_at timestamptz, p_reason text/);
for (const block of [complete, reopen]) {
  assert.match(block, /returns table \( event_id uuid, booking_id text, production_date date, previous_completed_at timestamptz, resulting_completed_at timestamptz, occurred_at timestamptz, action_type text, status text \)/);
  assert.match(block, /security definer set search_path = ''/);
  assert.match(block, /auth\.uid\(\)/);
  assert.match(block, /dg_user_profiles[\s\S]*profile\.active/);
  assert.match(block, /permission_key = 'production' and permission\.access_level = 'use'/);
  assert.doesNotMatch(block, /is_manager|permission_key = '(?:calendar|production_checkpoints)'|company_location/);
  assert.match(block, /public\.parse_production_booking_date\(v_booking\.production_date\)/);
  assert.match(block, /v_current_date is distinct from p_expected_production_date[\s\S]*stale_booking/);
  const commandLock = block.indexOf("'dg_production_booking_completion_command:' || p_command_id::text");
  const bookingLock = block.indexOf("'dg_production_booking_move_booking:' || p_booking_id");
  const existingLookup = block.indexOf('where completion_event.command_id = p_command_id');
  const rowLock = block.indexOf('for update');
  assert.ok(commandLock >= 0 && bookingLock > commandLock, 'Command lock must precede booking lock');
  assert.ok(existingLookup > bookingLock, 'Stored-command lookup must follow both advisory locks');
  assert.ok(rowLock > existingLookup, 'Exact booking row lock must follow idempotency lookup');
  assert.match(block, /command_uuid_collision/);
  assert.match(block, /booking_kind is distinct from 'production'/);
  assert.match(block, /deleted_at is not null/);
  assert.match(block, /cancelled_at is not null/);
  assert.match(block, /status is distinct from 'active'/);
  assert.match(block, /schedule_status is distinct from 'confirmed'/);
  assert.match(block, /board_visible is not distinct from false/);
  assert.match(block, /locked is not distinct from true/);
  assert.match(block, /update public\.dg_production_bookings as booking set completed_at =/);
  assert.match(block, /insert into public\.dg_production_booking_completion_events/);
  assert.ok(block.indexOf('update public.dg_production_bookings') < block.indexOf('insert into public.dg_production_booking_completion_events'), 'Booking update must precede atomic history insert');
  assert.doesNotMatch(block, /insert into public\.dg_production_bookings/);
  assert.doesNotMatch(block, /update public\.(?:dg_jobs|dg_daily_capacity|dg_production_flow_checkpoints|dg_job_lines)/);
  assert.doesNotMatch(block, /set [^;]*(?:production_date|shop_hours|status|schedule_status|board_visible|locked|cancelled_at|deleted_at|calendar|start_time|end_time)\s*=/);
}

const assertTimestampOrdering = (block, finalValidationToken, expectedInsertUses, operation) => {
  const declareStart = block.indexOf('declare');
  const bodyStart = block.indexOf('begin', declareStart);
  assert.ok(declareStart >= 0 && bodyStart > declareStart, `${operation} must have a separable declaration block`);
  const declarations = block.slice(declareStart, bodyStart);
  assert.match(declarations, /v_occurred_at timestamptz;/, `${operation} must declare the operation timestamp without initialization`);
  assert.doesNotMatch(declarations, /v_occurred_at\s+timestamptz\s*:=|clock_timestamp\(\)/, `${operation} cannot capture operational time in declarations`);

  const existingLookup = block.indexOf('where completion_event.command_id = p_command_id');
  const retryReturn = block.indexOf('return;', existingLookup);
  const rowLock = block.indexOf('for update', existingLookup);
  const finalValidation = block.lastIndexOf(finalValidationToken);
  const timestampAssignment = block.indexOf('v_occurred_at := pg_catalog.clock_timestamp();');
  const bookingUpdate = block.indexOf('update public.dg_production_bookings as booking');
  const eventInsert = block.indexOf('insert into public.dg_production_booking_completion_events');

  assert.equal((block.match(/v_occurred_at := pg_catalog\.clock_timestamp\(\);/g) ?? []).length, 1, `${operation} must capture one operational timestamp`);
  assert.equal((block.match(/pg_catalog\.clock_timestamp\(\)/g) ?? []).length, 1, `${operation} cannot use multiple operational timestamps`);
  assert.ok(retryReturn > existingLookup && retryReturn < timestampAssignment, `${operation} idempotent retry must return before timestamp capture`);
  assert.ok(rowLock > retryReturn && finalValidation > rowLock, `${operation} must row-lock and validate first execution after retry handling`);
  assert.ok(timestampAssignment > finalValidation, `${operation} timestamp capture must follow final eligibility/state validation`);
  assert.ok(bookingUpdate > timestampAssignment && eventInsert > bookingUpdate, `${operation} timestamp capture must immediately precede mutation ordering`);

  const insertEnd = block.indexOf('return query', eventInsert);
  const insert = block.slice(eventInsert, insertEnd);
  assert.equal((insert.match(/v_occurred_at/g) ?? []).length, expectedInsertUses, `${operation} event insert must consistently reuse the captured timestamp`);
};

assertTimestampOrdering(
  complete,
  'production_booking_completion.already_completed',
  3,
  'complete_production_booking',
);
assertTimestampOrdering(
  reopen,
  'production_booking_completion.stale_booking',
  2,
  'reopen_production_booking',
);
assert.match(complete, /v_existing\.action_type is distinct from 'completed'/);
assert.match(complete, /v_booking\.completed_at is not null[\s\S]*already_completed/);
assert.match(complete, /set completed_at = v_occurred_at/);
assert.match(reopen, /v_existing\.action_type is distinct from 'reopened'/);
assert.match(reopen, /v_existing\.previous_completed_at is distinct from p_expected_completed_at/);
assert.match(reopen, /v_existing\.reopen_reason is distinct from v_reason/);
assert.match(reopen, /v_reason is null[\s\S]*reason_required/);
assert.match(reopen, /length\(v_reason\) > 500[\s\S]*invalid_reason/);
assert.match(reopen, /v_booking\.completed_at is distinct from p_expected_completed_at[\s\S]*stale_booking/);
assert.match(reopen, /v_booking\.completed_at is null[\s\S]*not_completed/);
assert.match(reopen, /set completed_at = null/);

for (const signature of [
  'public.complete_production_booking(uuid, text, date)',
  'public.reopen_production_booking(uuid, text, date, timestamptz, text)',
]) {
  assert.ok(sql.includes(`alter function ${signature} owner to postgres`), `${signature} owner must be postgres`);
  assert.ok(sql.includes(`revoke all on function ${signature} from public, anon`), `${signature} must reject public/anon`);
  assert.ok(sql.includes(`grant execute on function ${signature} to authenticated`), `${signature} must grant authenticated execute`);
}
assert.match(sql, /revoke insert, update, delete, truncate on public\.dg_production_bookings from anon, authenticated/);

assert.match(e2b, /'dg_production_booking_move_booking:' \|\| p_booking_id/, 'E2B must retain the shared booking lock namespace');
assert.match(e2b, /v_booking\.completed_at is not null/, 'E2B must keep completed bookings immovable');
assert.doesNotMatch(sql, /alter table public\.dg_production_status_events/, 'Legacy status-event semantics must remain untouched');
assert.doesNotMatch(sql, /\b(?:started|partially_completed|paused|cancelled|archived|restored|corrected)\b/, 'F1 SQL action vocabulary must stay narrow');
assert.match(normalizedLegacyDocs, /earlier Phase 2F-A legacy status-event structure/i);
assert.match(normalizedLegacyDocs, /not the native completion\/reopen audit authority introduced in Phase 2F-F1/i);
assert.match(normalizedLegacyDocs, /native F1 completion and reopen events are stored only in .*public\.dg_production_booking_completion_events/i);
assert.match(normalizedLegacyDocs, /(?:the legacy table|it) remains present and unchanged/i);
assert.match(normalizedLegacyDocs, /no runtime workflow writes a completion action to both tables/i);
assert.match(normalizedLegacyDocs, /must not be used for a new completion\/reopen implementation without a separate, deliberate migration decision/i);
assert.match(docs, /dg_production_booking_completion_events[\s\S]*rather than an extension of the legacy `dg_production_status_events`/i);

assert.match(service, /^import 'server-only';/);
assert.match(service, /createAuthenticatedSupabaseServerClient/);
assert.match(service, /getCurrentDoorGoAccess/);
assert.match(service, /getProductionCompletionAuthorizationError/);
assert.doesNotMatch(`${service}\n${actions}`, /trusted-read-server|service[_-]?role|\.from\(|calendar/i);
assert.match(actions, /^'use server';/);
assert.match(actions, /completeProductionBooking/);
assert.match(actions, /reopenProductionBooking/);
for (const path of ['/production-board', '/production-schedule', '/production-recovery', '/production-checkpoints']) {
  assert.ok(contract.includes(`'${path}'`), `Missing successful revalidation path: ${path}`);
}
assert.match(actions, /revalidatePath\(path\)/);
assert.match(contract, /COMPLETE_PRODUCTION_BOOKING_RPC = 'complete_production_booking'/);
assert.match(contract, /REOPEN_PRODUCTION_BOOKING_RPC = 'reopen_production_booking'/);
assert.match(contract, /getPermissionAccess\(access, 'production'\) === 'use'/);
assert.match(contract, /TIMESTAMP_WITH_ZONE[\s\S]*Date\.parse/);
assert.match(contract, /item\.status !== item\.action_type/);
const publicEventType = contract.slice(
  contract.indexOf('export type ProductionBookingCompletionEvent'),
  contract.indexOf('export type ProductionBookingCompletionErrorCode'),
);
assert.doesNotMatch(publicEventType, /commandId|actorUserId|actorDisplayName|reopenReason/);

const applicationUi = [
  ...readdirSync('app', { recursive: true }).filter((path) => /\.(?:ts|tsx)$/.test(path)).map((path) => `app/${path}`),
  ...readdirSync('components', { recursive: true }).filter((path) => /\.(?:ts|tsx)$/.test(path)).map((path) => `components/${path}`),
].map(read).join('\n');
assert.doesNotMatch(applicationUi, /production-booking-completion-actions|completeProductionBooking|reopenProductionBooking/, 'F1 cannot add visible completion controls');

for (const marker of [
  "access('none')",
  "access('view')",
  "access('use')",
  'calendar',
  'production_checkpoints',
  'authentication_required',
  'active_profile_required',
  'ready booking completes',
  'completed booking reopens',
  'reason_required',
  'invalid_reason',
  'exact retry returns the original stored event after later state changes',
  'changed complete request collides',
  'changed reopen request collides',
  'complete UUID used for reopen collides',
  'reopen UUID used for complete collides',
  'secret SQL details',
  'timestamps require an explicit timezone',
  'completed response invariants are enforced',
]) assert.ok(tests.includes(marker), `Missing focused F1 test marker: ${marker}`);

for (const phrase of [
  'Ready for production',
  'no Started or partial-completion state',
  'Actual carry',
  'production=use',
  'immutable',
  'does not move the booking',
  'does not freeze Shop Hours',
  'archive and restore are separate',
  'no visible completion controls',
  'parallel testing system',
]) assert.ok(docs.toLowerCase().includes(phrase.toLowerCase()), `Missing F1 documentation: ${phrase}`);

assert.ok(JSON.parse(read('package.json')).scripts['verify:phase-2f-f1-production-completion-contract']);
console.log('Phase 2F-F1 production completion static contract verification passed (PostgreSQL execution not proven)');
