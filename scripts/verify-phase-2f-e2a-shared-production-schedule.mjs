import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const read = (path) => readFileSync(path, 'utf8');
const paths = {
  publicPage: 'app/production-board/page.tsx',
  privatePage: 'app/production-schedule/page.tsx',
  account: 'app/account/page.tsx',
  sharedView: 'components/ProductionBoardView.tsx',
  summary: 'components/ProductionBoardSummary.tsx',
  access: 'lib/production-schedule/view-access.ts',
  accessTest: 'lib/production-schedule/view-access.test.ts',
  recovery: 'app/production-recovery/page.tsx',
  checkpoints: 'app/production-checkpoints/page.tsx',
  d2Migration: 'supabase/migrations/20260714000000_create_production_booking_move_contract.sql',
  docs: 'docs/shared-production-schedule-architecture.md',
};

for (const path of Object.values(paths)) {
  assert.ok(existsSync(path), `Missing required E2A path: ${path}`);
}

const publicPage = read(paths.publicPage);
const privatePage = read(paths.privatePage);
const account = read(paths.account);
const sharedView = read(paths.sharedView);
const summary = read(paths.summary);
const access = read(paths.access);
const accessTest = read(paths.accessTest);
const recovery = read(paths.recovery);
const checkpoints = read(paths.checkpoints);
const docs = read(paths.docs);

for (const route of [publicPage, privatePage]) {
  assert.match(route, /ProductionBoardView/);
  assert.match(route, /parseProductionBoardParams/);
  assert.match(route, /addDaysToDateOnly/);
  assert.match(route, /loadProductionBoardReadOnly/);
  assert.equal(
    (route.match(/loadProductionBoardReadOnly\s*\(/g) ?? []).length,
    1,
    'Each route must load the Board exactly once',
  );
}

assert.match(publicPage, /title: 'Production Board'/);
assert.match(publicPage, /statusLabel: 'Read only'/);
assert.doesNotMatch(publicPage, /requireDoorGoProtectedAccess|getCurrentDoorGoAccess|getPermissionAccess|hasAtLeastView|canViewProductionSchedule|redirect\s*\(/);
assert.doesNotMatch(publicPage, /production-schedule|production-recovery|production-checkpoints|use server|checkpoint-actions|production-booking-actions/);

assert.match(privatePage, /requireDoorGoProtectedAccess/);
assert.match(privatePage, /canViewProductionSchedule\(access\)/);
assert.match(privatePage, /redirect\('\/account'\)/);
assert.ok(
  privatePage.indexOf('await requireDoorGoProtectedAccess()') < privatePage.indexOf('await loadProductionBoardReadOnly({'),
  'Private authorization must precede trusted loading',
);
assert.ok(
  privatePage.indexOf('canViewProductionSchedule(access)') < privatePage.indexOf('await loadProductionBoardReadOnly({'),
  'Production permission must precede trusted loading',
);
assert.match(privatePage, /href="\/production-board"/);
assert.match(privatePage, /href="\/production-recovery"/);
assert.match(privatePage, /hasAtLeastView\(access, 'production_checkpoints'\)[\s\S]*href="\/production-checkpoints"/);
assert.match(privatePage, /href="\/account"/);
assert.doesNotMatch(privatePage, /isManager|calendar['"]|production_checkpoints['"]\s*\)\s*\|\||\.rpc\(|checkpoint-actions|production-booking-actions/);

assert.match(access, /getPermissionAccess\(access, 'production'\)/);
assert.match(access, /title: 'Production Schedule'/);
assert.match(access, /statusLabel: 'Schedule view'/);
assert.doesNotMatch(access, /isManager|calendar|production_checkpoints/);
assert.match(account, /hasAtLeastView\(access, 'production'\)[\s\S]*href="\/production-schedule"[\s\S]*Production Schedule/);

assert.match(sharedView, /ProductionBoardSummary/);
assert.match(sharedView, /ProductionBoardWeekSection/);
assert.match(sharedView, /headerActions\?: ReactNode/);
assert.match(summary, /presentation\.title/);
assert.match(summary, /presentation\.statusLabel/);
for (const code of [sharedView, summary]) {
  assert.doesNotMatch(code, /use client|use server|@\/lib\/auth|@\/lib\/supabase|server action|\.rpc\(|calendar|checkpoint-actions|production-booking-actions/i);
}

assert.match(recovery, /requireDoorGoProtectedAccess/);
assert.match(recovery, /hasAtLeastView\(access, 'production'\)/);
assert.match(checkpoints, /requireDoorGoProtectedAccess/);
assert.match(checkpoints, /hasAtLeastView\(access, 'production_checkpoints'\)/);

for (const marker of [
  'unauthenticated',
  'missingProfile',
  'inactiveProfile',
  "production: 'none'",
  "production: 'view'",
  "production: 'use'",
  'isManager: true',
  "permission_key: 'calendar'",
  "permission_key: 'production_checkpoints'",
]) {
  assert.ok(accessTest.includes(marker), `Missing focused access test marker: ${marker}`);
}

const productionBoardSources = readdirSync('lib/production-board')
  .filter((name) => /\.(?:ts|tsx)$/.test(name))
  .map((name) => read(`lib/production-board/${name}`));
assert.equal(
  productionBoardSources.filter((source) => /export function normalizeProductionBoard\s*\(/.test(source)).length,
  1,
  'Board normalization must have one implementation',
);
assert.doesNotMatch(`${publicPage}\n${privatePage}\n${sharedView}`, /normalizeProductionBoard|normalizeDailyCapacity|classifyFlowOperationalStatus/);

const routeAndSharedCode = `${publicPage}\n${privatePage}\n${sharedView}\n${summary}`;
assert.doesNotMatch(routeAndSharedCode, /\.(?:insert|update|upsert|delete)\s*\(|create_production_flow_checkpoint|revise_production_flow_checkpoint|void_production_flow_checkpoint|move_production_booking_to_today|dg_jobs|shop_date|calendar\.events|events\.(?:insert|update|delete)/i);
assert.doesNotMatch(routeAndSharedCode, /<form|<button|Confirm checkpoint|Move to today|Reschedule|Create booking/i);

const migrationNames = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
assert.deepEqual(
  migrationNames.filter((name) => /e2a|production_schedule|shared_production/i.test(name)),
  [],
  'E2A must not create a migration',
);
const d2Hash = createHash('sha256')
  .update(read(paths.d2Migration).replace(/\r\n/g, '\n'))
  .digest('hex')
  .toUpperCase();
assert.equal(d2Hash, '372D7146EA0E0E921BE2D63E89F3383158C46BFBC9AFCEAAEEF8BD9EFD72A3B0', 'D2 migration must remain unchanged');

assert.match(docs, /one server-rendered component tree/i);
assert.match(docs, /production=view.*production=use/i);
assert.match(docs, /after authorization/i);
assert.match(docs, /adds no create, move, reschedule/i);
assert.match(docs, /No migration or Calendar runtime behavior/i);

const packageJson = JSON.parse(read('package.json'));
assert.ok(packageJson.scripts['verify:phase-2f-e2a-shared-production-schedule']);

console.log('Phase 2F-E2A shared Production Schedule verification passed');
