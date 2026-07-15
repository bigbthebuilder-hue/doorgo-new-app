import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const paths = {
  page: 'app/production-recovery/page.tsx',
  client: 'app/production-recovery/production-recovery-list.tsx',
  contract: 'lib/production-bookings/production-recovery-page-contract.ts',
  tests: 'lib/production-bookings/production-recovery-page-contract.test.ts',
  service: 'lib/production-bookings/production-booking-service.ts',
  actions: 'lib/production-bookings/production-booking-actions.ts',
  capacity: 'lib/production-bookings/production-recovery-capacity-server.ts',
  account: 'app/account/page.tsx',
  board: 'app/production-board/page.tsx',
  checkpoints: 'app/production-checkpoints/page.tsx',
  docs: 'docs/production-recovery-workflow.md',
  d2Migration: 'supabase/migrations/20260714000000_create_production_booking_move_contract.sql',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing D3 file: ${path}`);
const read = (path) => readFileSync(path, 'utf8');
const page = read(paths.page); const client = read(paths.client); const contract = read(paths.contract);
const tests = read(paths.tests); const service = read(paths.service); const actions = read(paths.actions);
const capacity = read(paths.capacity); const account = read(paths.account); const docs = read(paths.docs);

assert.match(page, /requireDoorGoProtectedAccess\(\)/);
assert.match(page, /hasAtLeastView\(access, 'production'\)/);
assert.ok(page.indexOf("hasAtLeastView(access, 'production')") < page.indexOf('loadAuthorizedRecentProductionRecoveryBookings(access'), 'Production permission must precede reads');
assert.match(page, /getPermissionAccess\(access, 'production'\)/);
assert.doesNotMatch(page, /isManager|is_manager|companyLocation|permission[^\n]*['"](?:calendar|production_checkpoints)['"][^\n]*(?:read|move)/i);
assert.match(account, /hasAtLeastView\(access, 'production'\)[\s\S]*href="\/production-recovery"[\s\S]*Past Scheduled Bookings/);
assert.match(page, /productionAccess === 'view'[\s\S]*view-only production access/);
assert.match(page, /canMove=\{productionAccess === 'use'\}/);
assert.match(client, /canMove && !isSelected[\s\S]*Move to today/);
assert.match(client, /grid-cols-1[\s\S]*lg:grid-cols-2/);
assert.doesNotMatch(client, /(?:[a-z0-9]+:)?grid-cols-(?:3|4|5|6|7|8|9|10|11|12)/);
assert.match(client, /isSelected \? 'lg:col-span-2' : ''/);
assert.match(client, /productionRecoveryOriginLabel\(booking\.bookingOrigin\)/);
assert.match(client, /productionRecoveryIdentifier\([\s\S]*booking\.jobId,[\s\S]*booking\.salesOrder/);
assert.match(contract, /bookingOrigin === 'doorgo'[\s\S]*return 'DoorGo-linked'/);
assert.match(contract, /bookingOrigin === 'biztrack'[\s\S]*return 'BizTrack-only'/);
assert.match(contract, /bookingOrigin === 'doorgo' && jobId[\s\S]*`Job \$\{jobId\}`/);
assert.match(contract, /bookingOrigin === 'biztrack' && salesOrder[\s\S]*`Sales order \$\{salesOrder\}`/);
assert.doesNotMatch(client, />\{booking\.bookingOrigin\}</);
assert.doesNotMatch(client, /Booking origin/);

assert.match(service, /^import 'server-only';/);
assert.match(service, /createAuthenticatedSupabaseServerClient/);
assert.match(service, /PRODUCTION_RECOVERY_READ_RPC/);
assert.match(service, /p_start_date:[\s\S]*p_end_date:[\s\S]*p_limit:/);
assert.doesNotMatch(service, /trusted-read-server|service[_-]?role|\.from\(['"]dg_production_bookings/);
assert.match(client, /moveProductionBookingToToday\(/);
assert.doesNotMatch(client, /supabase|\.rpc\(|\.from\(/i);
assert.match(actions, /export async function moveProductionBookingToToday/);

assert.match(contract, /previousFiveBusinessDays/);
assert.match(contract, /weekday >= 1 && weekday <= 5/);
assert.match(contract, /endDate >= today/);
assert.match(contract, /PRODUCTION_RECOVERY_MAX_RANGE_DAYS = 93/);
assert.match(page, /PRODUCTION_RECOVERY_LIMIT/);
assert.match(page, /name="start"[\s\S]*name="end"/);
assert.match(page, /Return to previous five business days/);

assert.match(contract, /The whole job was not started\./);
assert.match(client, /WHOLE_JOB_ACKNOWLEDGEMENT/);
assert.match(client, /checked=\{acknowledged\}/);
assert.match(client, /crypto\.randomUUID\(\)/);
assert.match(contract, /state\.commandId && state\.fingerprint === fingerprint/);
assert.match(client, /if \(!selected \|\| !canSubmitRecoveryMove\(acknowledged, pending\)\) return/);
assert.match(contract, /Partly completed jobs should stay on their original date/);
assert.match(client, /PARTLY_COMPLETED_GUIDANCE/);
assert.match(client, /PRODUCTION_RECOVERY_CARRY_WARNING/);
assert.match(client, /router\.refresh\(\)/);
assert.doesNotMatch(client, /Undo|bulk|split|destinationDate|shopHours:/i);

assert.match(capacity, /^import 'server-only';/);
assert.match(capacity, /hasAtLeastView\(access, 'production'\)/);
assert.match(capacity, /loadProductionBoardReadOnly/);
assert.doesNotMatch(capacity, /return\s+board\b|customer|calendarId|calendarEventId/);
assert.match(contract, /Moving this booking will put today approximately/);
assert.match(contract, /Today’s capacity is unavailable\. The move is still allowed\./);
assert.match(contract, /Today is marked closed[\s\S]*still allowed/);
assert.match(client, /disabled=\{!canSubmitRecoveryMove\(acknowledged, pending\)\}/);
assert.doesNotMatch(client, /disabled=\{[^}]*capacityMessage/, 'Capacity context must not disable the move');

const d3Runtime = [page, client, contract, service, actions, capacity].join('\n');
assert.doesNotMatch(d3Runtime, /googleapis|apps script|calendar[_ -]?outbox|service[_-]?role/i);
assert.doesNotMatch(d3Runtime, /dg_jobs|shop_date|dg_production_flow_checkpoints|dg_daily_capacity[\s\S]{0,200}\.(?:insert|update|upsert|delete)|\.from\(['"]dg_production_bookings['"]\)/i);
assert.doesNotMatch(d3Runtime, /calendar_id\s*:|calendar_event_id\s*:|calendar_sync_state\s*:/i);

const board = read(paths.board); const checkpoints = read(paths.checkpoints);
assert.match(board, /loadProductionBoardReadOnly/);
assert.doesNotMatch(board, /requireDoorGoProtectedAccess|getCurrentDoorGoAccess|redirect\(['"]\/login/);
assert.match(checkpoints, /requireDoorGoProtectedAccess\(\)/);
assert.match(checkpoints, /hasAtLeastView\(access, 'production_checkpoints'\)/);

const migrationFiles = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).map((name) => `supabase/migrations/${name}`);
const d2Definitions = migrationFiles.filter((path) => /create\s+or\s+replace\s+function\s+public\.(?:read_recent_production_recovery_bookings|move_production_booking_to_today)\s*\(/i.test(read(path)));
assert.deepEqual(d2Definitions, [
  paths.d2Migration,
  'supabase/migrations/20260715000000_extend_production_booking_reschedule_contract.sql',
]);
const normalizedMigration = read(paths.d2Migration).replaceAll('\r\n', '\n');
assert.equal(createHash('sha256').update(normalizedMigration).digest('hex').toUpperCase(), '372D7146EA0E0E921BE2D63E89F3383158C46BFBC9AFCEAAEEF8BD9EFD72A3B0', 'D2 migration must remain unchanged');

for (const marker of [
  "previousFiveBusinessDays('2026-07-14')", "previousFiveBusinessDays('2026-07-13')", "previousFiveBusinessDays('2026-01-05')",
  "canReadProductionRecovery('none')", "canReadProductionRecovery('view')", "canMoveProductionRecovery('use')",
  'identical retry retains command UUID', 'duplicate submission is prevented while pending', 'capacity context does not block',
  'capacityKnown: false', "recoveryMoveMessage('stale_booking')", 'manager', 'calendar', 'production_checkpoints',
  "productionRecoveryOriginLabel('doorgo')", "productionRecoveryOriginLabel('biztrack')",
  "productionRecoveryIdentifier('doorgo'", "productionRecoveryIdentifier('biztrack'",
]) assert.ok(tests.includes(marker), `Missing D3 focused test marker: ${marker}`);
assert.match(docs, /Past Scheduled Bookings/); assert.match(docs, /five previous/); assert.match(docs, /no Google Calendar or Apps Script runtime[\s\S]*behavior/i);
const packageJson = JSON.parse(read('package.json'));
assert.ok(packageJson.scripts['verify:phase-2f-d3-production-recovery-ui']);

console.log('Phase 2F-D3 production recovery UI static contract verification passed');
