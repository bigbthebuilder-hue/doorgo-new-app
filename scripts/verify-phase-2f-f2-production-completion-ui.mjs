import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const paths = {
  schedulePage: 'app/production-schedule/page.tsx',
  publicPage: 'app/production-board/page.tsx',
  recoveryPage: 'app/production-recovery/page.tsx',
  checkpointPage: 'app/production-checkpoints/page.tsx',
  board: 'components/ProductionScheduleInteractiveBoard.tsx',
  card: 'components/ProductionBookingCard.tsx',
  interaction: 'components/production-board-interaction.ts',
  contract: 'lib/production-schedule/completion-ui-contract.ts',
  tests: 'lib/production-schedule/completion-ui-contract.test.ts',
  renderTests: 'lib/production-schedule/completion-ui-render.test.ts',
  lifecycleTests: 'lib/production-schedule/completion-ui-lifecycle.test.ts',
  actions: 'lib/production-bookings/production-booking-completion-actions.ts',
  migration: 'supabase/migrations/20260716000000_create_production_booking_completion_contract.sql',
  migrationInventory: 'scripts/phase-2f-f2-protected-migrations.json',
  testConfig: 'tsconfig.phase-2f-f2-tests.json',
  docs: 'docs/production-completion-ui-contract.md',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing F2 dependency: ${path}`);

const read = (path) => readFileSync(path, 'utf8');
const schedulePage = read(paths.schedulePage);
const publicPage = read(paths.publicPage);
const recoveryPage = read(paths.recoveryPage);
const checkpointPage = read(paths.checkpointPage);
const board = read(paths.board);
const card = read(paths.card);
const interaction = read(paths.interaction);
const contract = read(paths.contract);
const tests = read(paths.tests);
const renderTests = read(paths.renderTests);
const lifecycleTests = read(paths.lifecycleTests);
const docs = read(paths.docs);

const normalizedSha256 = (source) => createHash('sha256')
  .update(source.replace(/\r\n?/g, '\n'), 'utf8')
  .digest('hex')
  .toUpperCase();

const normalizedMigration = read(paths.migration).replace(/\r\n?/g, '\n');
assert.equal(
  normalizedSha256(normalizedMigration),
  'C67CC92A948C662271C7E15C463D767718786FF7D100DA236B2EAFAA124F25CE',
  'F1 migration changed during F2',
);
const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
const protectedMigrations = JSON.parse(read(paths.migrationInventory));
for (const [name, checksum] of Object.entries(protectedMigrations)) {
  const migrationPath = `supabase/migrations/${name}`;
  assert.ok(existsSync(migrationPath), `Protected pre-F2 migration is missing: ${name}`);
  assert.equal(normalizedSha256(read(migrationPath)), checksum, `Protected pre-F2 migration changed: ${name}`);
}
const additionalMigrations = migrations.filter((name) => !(name in protectedMigrations));
for (const name of additionalMigrations) {
  assert.doesNotMatch(
    read(`supabase/migrations/${name}`),
    /complete_production_booking|reopen_production_booking|dg_production_booking_completion_events|\bcompleted_at\b|production[-_ ]completion UI/i,
    `Post-F2 migration changes the protected completion contract: ${name}`,
  );
}

assert.match(schedulePage, /getProductionCompletionAuthorizationError\(access\) === null/);
assert.match(schedulePage, /canMoveBookings && canChangeCompletion/);
const completionAuthorization = read('lib/production-bookings/production-booking-completion-contract.ts').slice(
  read('lib/production-bookings/production-booking-completion-contract.ts').indexOf('export function getProductionCompletionAuthorizationError'),
  read('lib/production-bookings/production-booking-completion-contract.ts').indexOf('const messages:'),
);
assert.match(completionAuthorization, /getPermissionAccess\(access, 'production'\) === 'use'/);
assert.doesNotMatch(completionAuthorization, /isManager|is_manager|calendar|production_checkpoints|companyLocation|company_location/);
assert.match(schedulePage, /ProductionScheduleInteractiveBoard/);
assert.match(board, /completeProductionBooking/);
assert.match(board, /reopenProductionBooking/);
assert.doesNotMatch(publicPage, /ProductionScheduleInteractiveBoard|completion-actions|completeProductionBooking|reopenProductionBooking/);
for (const source of [publicPage, recoveryPage, checkpointPage]) {
  assert.doesNotMatch(source, /onCompletionRequest|Mark Complete|Reopen Booking|completion-actions/);
}

assert.match(card, /card\.completedAt !== null/);
assert.match(card, /completed \? 'Completed' : 'Ready'/);
assert.match(card, /completed \? 'Reopen' : 'Complete'/);
assert.match(card, /!completed[\s\S]*onMoveRequest/);
assert.match(interaction, /onCompletionRequest/);
assert.match(board, /getProductionScheduleCompletionBlockReason/);
assert.match(board, /pendingBookingId: active\?\.card\.bookingId \?\? completion\?\.card\.bookingId/);
assert.match(board, /!active && !completion/);
assert.match(board, /submitProductionScheduleCompletionAttempt/);
assert.match(board, /isSameProductionScheduleCompletionAttempt/);
assert.match(board, /applyProductionScheduleCompletionOutcome/);

assert.match(board, /Mark production complete\?/);
assert.match(board, /marks the entire production booking Completed/);
assert.match(board, /does not archive the job or change Shop Hours/);
assert.match(board, /Reopen production booking\?/);
assert.match(board, /Reason for reopening/);
assert.match(board, /maxLength=\{500\}/);
assert.match(board, /Marking complete/);
assert.match(board, /Reopening/);
assert.match(contract, /Production booking marked complete\./);
assert.match(contract, /Production booking reopened\./);
assert.match(board, /router\.refresh\(\)/);
assert.match(contract, /catch \{[\s\S]*kind: 'failure'[\s\S]*finally \{[\s\S]*guard\.current = null/);
assert.match(board, /role="dialog"/);
assert.match(board, /aria-modal="true"/);
assert.match(board, /role="alert"/);
assert.match(board, /disabled=\{active\.submitting/);

assert.match(contract, /normalizeProductionScheduleReopenReason\(reason: string\)/);
assert.match(contract, /reason\.trim\(\)/);
assert.match(contract, /getNormalizedProductionScheduleReopenReasonLength[\s\S]*normalizeProductionScheduleReopenReason\(reason\)\.length/);
assert.match(board, /getNormalizedProductionScheduleReopenReasonLength\(active\.attempt\.reason\)\}\/500/);
assert.doesNotMatch(board, /active\.attempt\.reason\.length\}\/500/);
assert.match(contract, /normalized\.length === 0 \|\| normalized\.length > 500/);
assert.match(contract, /commandId: changed \? createCommandId\(\) : attempt\.commandId/);
assert.match(contract, /expectedCompletedAt: attempt\.expectedCompletedAt/);
assert.match(contract, /expectedProductionDate: attempt\.productionDate/);
assert.match(contract, /bookingId: attempt\.bookingId/);

const completeBuilder = contract.slice(
  contract.indexOf('export function buildCompleteProductionScheduleRequest'),
  contract.indexOf('export function buildReopenProductionScheduleRequest'),
);
assert.match(completeBuilder, /commandId[\s\S]*bookingId[\s\S]*expectedProductionDate/);
assert.doesNotMatch(completeBuilder, /actor|timestamp|permission|shopHours|completedAt|reason/);
const reopenBuilder = contract.slice(
  contract.indexOf('export function buildReopenProductionScheduleRequest'),
  contract.indexOf('export function getProductionScheduleCompletionFailurePresentation'),
);
assert.match(reopenBuilder, /commandId[\s\S]*bookingId[\s\S]*expectedProductionDate[\s\S]*expectedCompletedAt[\s\S]*reason/);
assert.doesNotMatch(reopenBuilder, /new Date|Date\.parse|actor|permission|shopHours/);

for (const phrase of [
  'You no longer have permission to change production bookings.',
  'This booking changed since the schedule loaded. The schedule has been refreshed.',
  'This booking is already completed. The schedule has been refreshed.',
  'This booking is no longer completed. The schedule has been refreshed.',
  'This booking cannot be changed in its current state.',
  'Enter a reason between 1 and 500 characters.',
  'This action no longer matches the original request. Review the refreshed booking and try again.',
  'The production booking could not be updated. Please try again.',
]) assert.ok(contract.includes(phrase), `Missing safe F2 message: ${phrase}`);

const forbiddenServerAuthority = new RegExp(
  `\\.from\\(\\s*['\"\`]|
${['service', 'role'].join('[_-]?')}|trusted-read-server|${['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_')}`.replace('\n', ''),
  'i',
);
assert.doesNotMatch(`${board}\n${contract}`, forbiddenServerAuthority);
assert.doesNotMatch(`${board}\n${contract}`, /\b(?:update|insert|delete)\b[\s\S]{0,80}\b(?:dg_jobs|shop_date|calendar_event|checkpoint|capacity|archive|shop_hours)\b/i);
assert.doesNotMatch(`${board}\n${contract}`, /['">](?:Started|In Progress|Partially Complete)['"<]|completion percentage/i);
assert.match(tests, /getProductionScheduleCompletionAction\(ready, false\), null/);
assert.match(tests, /getProductionScheduleCompletionAction\(completed, false\), null/);
assert.match(tests, /x'\.repeat\(500\)/);
assert.match(tests, /x'\.repeat\(501\)/);
assert.match(tests, /expectedCompletedAt: '2026-07-16T18:22:31\.123456\+00:00'/);
for (const marker of [
  'renderToStaticMarkup',
  'Manager without production use',
  'completedElement.props.draggable, undefined',
  'readyPending',
  'unrelatedPending',
]) assert.ok(renderTests.includes(marker), `Missing rendered F2 behavior coverage: ${marker}`);
for (const marker of [
  'duplicateCalls, 1',
  "message: 'Production booking marked complete.'",
  "message: 'Production booking reopened.'",
  "code: 'stale_booking'",
  "kind: 'superseded'",
  'exactCompletedAt',
  'transport detail must be sanitized',
]) assert.ok(lifecycleTests.includes(marker), `Missing F2 lifecycle coverage: ${marker}`);
const packageJson = read('package.json');
const testConfig = read(paths.testConfig);
for (const testPath of [paths.tests, paths.renderTests, paths.lifecycleTests]) {
  assert.ok(testConfig.includes(`"${testPath}"`), `F2 test config does not compile ${testPath}`);
}
assert.ok(packageJson.includes('tsconfig.phase-2f-f2-tests.json'));
assert.ok(packageJson.includes('completion-ui-render.test.js'));
assert.ok(packageJson.includes('completion-ui-lifecycle.test.js'));
assert.match(docs, /public Production Board remains read-only/i);
assert.match(docs, /No Started, partial-completion/i);
assert.match(docs, /does not archive/i);
assert.match(docs, /(?:does not|neither action) freezes? or changes? Shop Hours/i);
assert.match(docs, /Live authenticated mutation.*deferred/i);

const repositoryExtensions = ['.ts', '.tsx', '.mjs', '.js'];
const readOnlyGraphBoundaries = new Map([
  ['lib/production-board/queries.ts', '3E9E47A48EDDD2F39A50974616FCC19EB12E8C7B96E1E342A9FC1DB1D6BA13AD'],
  ['lib/production-schedule/destination-preview-action.ts', '8419A8ABB4A00B7F3EF35C63585DF7B7B35C2D4F195D8843E13E0D2BEBBEF4B7'],
]);
for (const [file, checksum] of readOnlyGraphBoundaries) {
  assert.equal(normalizedSha256(read(file)), checksum, `Pre-existing read-only graph boundary changed: ${file}`);
}
const resolveLocalImport = (fromPath, specifier) => {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null;
  const base = specifier.startsWith('@/')
    ? specifier.slice(2)
    : path.posix.normalize(path.posix.join(path.posix.dirname(fromPath), specifier));
  const candidates = [
    base,
    ...repositoryExtensions.map((extension) => `${base}${extension}`),
    ...repositoryExtensions.map((extension) => `${base}/index${extension}`),
  ];
  return candidates.find((candidate) => existsSync(candidate) && !candidate.includes('node_modules')) ?? null;
};
const collectLocalGraph = (entries) => {
  const visited = new Set();
  const visit = (file) => {
    const normalized = file.replaceAll('\\', '/');
    if (visited.has(normalized)) return;
    visited.add(normalized);
    if (readOnlyGraphBoundaries.has(normalized)) return;
    const source = read(normalized);
    const specifiers = [
      ...source.matchAll(/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g),
      ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
    ].map((match) => match[1]);
    for (const specifier of specifiers) {
      const resolved = resolveLocalImport(normalized, specifier);
      if (resolved) visit(resolved);
    }
  };
  entries.forEach(visit);
  return [...visited].sort();
};
const integrationGraph = collectLocalGraph([
  paths.schedulePage,
  paths.board,
  paths.card,
  paths.contract,
  paths.actions,
]);
assert.ok(integrationGraph.includes('lib/production-bookings/production-booking-completion-service.ts'));
assert.ok(integrationGraph.includes('lib/production-bookings/production-booking-completion-contract.ts'));
const trustedCredentialPattern = new RegExp([
  ['SUPABASE', 'SERVICE', 'ROLE', 'KEY'].join('_'),
  ['service', 'role'].join('_'),
  ['create', 'Trusted', 'ReadOnly', 'Supabase', 'Client'].join(''),
].join('|'));
for (const file of integrationGraph) {
  if (readOnlyGraphBoundaries.has(file)) continue;
  const source = read(file);
  assert.doesNotMatch(source, trustedCredentialPattern);
  assert.doesNotMatch(source, /\.from\([^)]*\)\s*\.(?:insert|update|upsert|delete)\s*\(/s);
  if (/\.rpc\s*\(/.test(source)) {
    assert.match(
      file,
      /(?:completion|reschedule)-service\.ts$|(?:move|completion|reschedule)-contract\.ts$/,
      `Direct RPC bypasses an approved Server Action service or tested contract seam: ${file}`,
    );
  }
  assert.doesNotMatch(
    source,
    /\b(?:executeRaw|queryRaw|unsafeSql)\b|googleapis|calendar\.events|events\.(?:insert|update|delete)|\bcalendar(?:Event)?\.(?:insert|update|delete)\b/i,
  );
  assert.doesNotMatch(source, /(?:shop_hours|shopHours|dg_jobs\.shop_date|checkpoint|capacity|archive)[\s\S]{0,80}\.(?:insert|update|upsert|delete)\s*\(/i);
}

console.log('Phase 2F-F2 Production Schedule completion UI static verification passed');
