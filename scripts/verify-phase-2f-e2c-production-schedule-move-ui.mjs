import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const paths = {
  publicPage: 'app/production-board/page.tsx',
  privatePage: 'app/production-schedule/page.tsx',
  interactive: 'components/ProductionScheduleInteractiveBoard.tsx',
  navigation: 'components/ProductionScheduleNavigation.tsx',
  view: 'components/ProductionBoardView.tsx',
  summary: 'components/ProductionBoardSummary.tsx',
  week: 'components/ProductionBoardWeekSection.tsx',
  day: 'components/ProductionBoardDay.tsx',
  card: 'components/ProductionBookingCard.tsx',
  interaction: 'components/production-board-interaction.ts',
  toast: 'components/AppConfirmationToast.tsx',
  contract: 'lib/production-schedule/move-ui-contract.ts',
  boardTypes: 'lib/production-board/types.ts',
  boardNormalize: 'lib/production-board/normalize.ts',
  boardQueries: 'lib/production-board/queries.ts',
  dateUtils: 'lib/production-board/date-utils.ts',
  dateTests: 'lib/production-board/date-utils.test.ts',
  capacityTests: 'lib/production-board/capacity-normalize.test.ts',
  boardTests: 'lib/production-board/normalize-capacity.test.ts',
  tests: 'lib/production-schedule/move-ui-contract.test.ts',
  previewAction: 'lib/production-schedule/destination-preview-action.ts',
  previewService: 'lib/production-schedule/destination-preview-service.ts',
  e2bAction: 'lib/production-bookings/production-booking-reschedule-actions.ts',
  e2bContract: 'lib/production-bookings/production-booking-reschedule-contract.ts',
  docs: 'docs/production-schedule-move-ui-contract.md',
};
for (const path of Object.values(paths)) assert.ok(existsSync(path), `Missing E2C path: ${path}`);
const read = (path) => readFileSync(path, 'utf8');
const publicPage = read(paths.publicPage);
const privatePage = read(paths.privatePage);
const interactive = read(paths.interactive);
const navigation = read(paths.navigation);
const shared = [paths.view, paths.week, paths.day, paths.card, paths.interaction].map(read).join('\n');
const card = read(paths.card);
const day = read(paths.day);
const contract = read(paths.contract);
const boardTypes = read(paths.boardTypes);
const boardNormalize = read(paths.boardNormalize);
const boardQueries = read(paths.boardQueries);
const dateUtils = read(paths.dateUtils);
const dateTests = read(paths.dateTests);
const capacityTests = read(paths.capacityTests);
const boardTests = read(paths.boardTests);
const tests = read(paths.tests);
const previewAction = read(paths.previewAction);
const previewService = read(paths.previewService);
const toast = read(paths.toast);
const docs = read(paths.docs);

assert.doesNotMatch(publicPage, /ProductionScheduleInteractiveBoard|interaction=|reschedule|destination-preview|use server|requireDoorGoProtectedAccess|redirect\s*\(/i);
assert.match(publicPage, /ProductionBoardView/);
assert.match(publicPage, /statusLabel: 'Read only'/);
assert.match(publicPage, /parseProductionBoardParams\(params, today\)/);
assert.doesNotMatch(publicPage, /ProductionScheduleNavigation/);
assert.match(privatePage, /requireDoorGoProtectedAccess/);
assert.match(privatePage, /canViewProductionSchedule\(access\)/);
assert.match(privatePage, /canRescheduleProductionBooking\(access\)[\s\S]*ProductionScheduleInteractiveBoard/);
assert.match(privatePage, /ProductionBoardView/);
assert.match(privatePage, /ProductionScheduleNavigation/);
assert.match(privatePage, /<ProductionScheduleNavigation[\s\S]*key=\{startDate\}/);
assert.match(privatePage, /windowNavigation=\{windowNavigation\}/);
assert.doesNotMatch(privatePage, /isManager|permission_key.*(?:calendar|production_checkpoints)|company_location|\.rpc\(/i);

assert.match(read(paths.view), /interaction\?: ProductionBoardInteraction/);
assert.match(read(paths.week), /interaction\?: ProductionBoardInteraction/);
assert.match(day, /interaction\?: ProductionBoardInteraction/);
assert.match(card, /draggable=\{canDrag \|\| undefined\}/);
assert.match(card, /interaction \? \([\s\S]*\{pending \? 'Move pending' : 'Move'\}/);
assert.match(card, /Completed bookings cannot be moved|blockReason/);
assert.match(day, /onDragEnter=.*interaction/);
assert.match(day, /onDrop=.*interaction/);
assert.match(day, /hoveredDate === day\.date[\s\S]*border-sky-600[\s\S]*shadow-xl/);
assert.doesNotMatch(`${shared}\n${publicPage}`, /production-booking-reschedule-actions|rescheduleProductionBooking|previewProductionScheduleDestination/);

assert.match(interactive, /^'use client';/);
assert.match(interactive, /rescheduleProductionBooking/);
assert.match(interactive, /previewProductionScheduleDestination/);
assert.equal((interactive.match(/rescheduleProductionBooking\s*\(/g) ?? []).length, 1, 'UI must have one E2B action call site');
assert.doesNotMatch(interactive, /(?:supabase|client)\.from\(|\.rpc\(|service[_-]?role|createClient|supabase|calendar|shop_date|dg_jobs|dg_production_flow_checkpoints|dg_daily_capacity/i);
assert.match(interactive, /matchMedia\('\(hover: hover\) and \(pointer: fine\)'\)/);
assert.doesNotMatch(interactive, /scrollIntoView|scrollBy|scrollTo|autoScroll/i);
assert.match(interactive, /draggedCard\.current/);
assert.match(interactive, /if \(date === dragged\.card\.productionDate\) return/);
assert.match(interactive, /moveProductionBoardCardLocally/);
assert.ok(interactive.indexOf('setDisplayBoard(optimisticBoard)') < interactive.indexOf('setActive(base)'), 'Visible card must land before review state opens');
assert.match(interactive, /justDragged[\s\S]*event\.preventDefault\(\)[\s\S]*event\.stopPropagation\(\)/);
assert.match(interactive, /type="date"/);
assert.doesNotMatch(interactive, /\bmin=/);
assert.match(interactive, /<dialog/);
assert.equal((interactive.match(/aria-labelledby="production-move-title"/g) ?? []).length, 1, 'Use one combined move dialog');
for (const text of [
  'The whole job was not started.',
  'Reason for moving this booking to a past date',
  'This production date is marked closed. Move the booking here anyway?',
  'This move will put the day over its planned production capacity.',
  'Capacity could not be confirmed for this date.',
]) assert.ok(interactive.includes(text), `Missing review text: ${text}`);
assert.match(interactive, /review\?\.warnsOverload/);
assert.match(interactive, /review\?\.warnsUnknownCapacity/);
assert.match(interactive, /disabled=\{!validation\.valid \|\| active\.submitting\}/);
assert.match(interactive, /pendingBookingId: active\?\.card\.bookingId \?\? completion\?\.card\.bookingId \?\? null/);
assert.doesNotMatch(interactive, /pendingBookingId: active\?\.optimistic/);
assert.match(interactive, /This date is outside the currently visible schedule\./);
assert.match(interactive, /let optimistic = snapshot\.optimistic/);
assert.match(interactive, /aria-invalid=\{validation\.reasonError \? true : undefined\}/);
assert.match(interactive, /aria-describedby=\{validation\.reasonError \? 'production-move-reason-error' : undefined\}/);
assert.match(interactive, /id="production-move-reason-error"[\s\S]*role="alert"/);
assert.match(interactive, /typeof element\.showModal === 'function'/);
assert.match(interactive, /element\.setAttribute\('open', ''\)/);
assert.match(interactive, /role="dialog"/);
assert.match(interactive, /aria-modal="true"/);
assert.match(interactive, /setDisplayBoard\(board\)[\s\S]*setActive\(null\)/);
assert.match(interactive, /stale_booking[\s\S]*router\.refresh\(\)/);
assert.match(interactive, /isMaterialProductionScheduleMoveFailure\(result\.code\)/);
assert.match(interactive, /unchanged|failed|updateProductionScheduleMoveAttempt/);
assert.match(interactive, /crypto\.randomUUID/);
assert.match(interactive, /crypto\.getRandomValues/);

assert.match(navigation, /^'use client';/);
for (const label of ['Previous week', 'Today', 'Next week', 'Go to date']) {
  assert.ok(navigation.includes(label), `Missing Schedule navigation control: ${label}`);
}
assert.match(navigation, /router\.push\(`\/production-schedule\?week=\$\{encodeURIComponent\(monday\)\}`\)/);
assert.match(navigation, /normalizeProductionWeekAnchor\(selectedDate, currentMonday\)/);
assert.match(navigation, /Loading schedule…/);
assert.doesNotMatch(navigation, /rescheduleProductionBooking|createSecureCommandId|\.rpc\(/);

assert.match(previewAction, /^'use server';/);
assert.match(previewService, /^import 'server-only';/);
assert.match(previewService, /getCurrentDoorGoAccess/);
assert.match(previewService, /getPermissionAccess\(access, 'production'\) === 'none'/);
assert.doesNotMatch(previewService, /isManager|calendar|production_checkpoints|company_location/);
assert.match(previewService, /createTrustedReadOnlySupabaseClient/);
assert.ok(previewService.indexOf('getCurrentDoorGoAccess()') < previewService.indexOf('createTrustedReadOnlySupabaseClient()'), 'Authorization must precede trusted reads');
assert.match(previewService, /loadDailyCapacityReadOnly/);
assert.match(previewService, /booking\?\.shop_hours/);
assert.match(previewService, /const isClosed = capacity\?\.isClosed === true/);
assert.doesNotMatch(previewService, /const isClosed[^;]*(?:capacity\?\.source|source === 'closure')/);
assert.doesNotMatch(`${previewAction}\n${previewService}`, /\.(?:insert|update|upsert|delete)\s*\(|\.rpc\(|revalidatePath|service[_-]?role[_-]?key/i);

assert.match(contract, /sourceDate <= input\.today/);
assert.match(contract, /destinationDate < input\.today/);
assert.match(boardTypes, /isExplicitlyClosed: boolean/);
assert.match(boardNormalize, /const isExplicitlyClosed = capacity\?\.isClosed === true/);
assert.match(boardNormalize, /for \([\s\S]*date < params\.endDateExclusive[\s\S]*dayOfWeek >= 1 && dayOfWeek <= 5[\s\S]*visibleDates\.push\(date\)/);
assert.match(boardNormalize, /dateState: classifyProductionBoardDay\(date, today\)/);
assert.match(boardNormalize, /const weekdayEndExclusive = addDaysToDateOnly\(startDate, 5\)/);
assert.match(boardTypes, /dateState: ProductionBoardDayState/);
assert.match(boardTypes, /weekdayEndExclusive: string/);
assert.match(boardTypes, /visibleWeekdayEndExclusive: string/);
assert.match(read(paths.summary), /board\.visibleWeekdayEndExclusive/);
assert.match(read(paths.week), /week\.weekdayEndExclusive/);
assert.match(day, /data-day-state=\{day\.dateState\}/);
assert.match(day, /day\.dateState === 'past'[\s\S]*bg-slate-200/);
assert.match(day, /day\.dateState === 'today'[\s\S]*ring-2 ring-sky-400/);
assert.match(day, /\{day\.dateState === 'today' \? 'Today' : 'Past'\}/);
assert.match(card, /const completed = card\.completedAt !== null/);
assert.match(card, /completed \? 'Completed' : 'Ready'/);
assert.match(card, /completed \? 'bg-slate-200 text-slate-700'/);
assert.match(capacityTests, /is_closed: null as unknown as boolean[\s\S]*isClosed, false/);
assert.match(boardTests, /source: 'closure', isClosed: false[\s\S]*isExplicitlyClosed, false/);
assert.match(boardTests, /source: 'calculated', isClosed: true[\s\S]*isExplicitlyClosed, true/);
assert.match(boardTests, /noCapacityRow[\s\S]*isExplicitlyClosed, false/);
assert.match(contract, /isClosed: day\.isExplicitlyClosed/);
assert.doesNotMatch(contract, /isClosed: day\.isClosed/);
assert.match(contract, /requiresClosedDateOverride = input\.preview\.isClosed/);
assert.match(contract, /warnsOverload = input\.preview\.overload/);
assert.match(contract, /warnsUnknownCapacity = !input\.preview\.capacityKnown/);
assert.match(contract, /reason\.length > 500/);
assert.match(contract, /current\.failed && materialMoveAttemptChanged/);
assert.match(contract, /completedAt !== null/);
assert.match(contract, /card\.locked/);
assert.match(contract, /card\.bookingKind !== 'production'/);
assert.match(contract, /card\.bookingId\.length === 0/);
assert.match(contract, /card\.bookingId\.length > 500/);
assert.match(contract, /card\.bookingId !== card\.bookingId\.trim\(\)/);
assert.match(contract, /Number\.isFinite\(shopHours\)/);
assert.match(contract, /shopHours < 0/);
assert.match(contract, /shopHours > 99_999_999\.99/);
assert.match(contract, /Number\(shopHours\.toFixed\(2\)\) === shopHours/);
assert.match(contract, /'invalid_booking_id'/);

assert.match(dateUtils, /PRODUCTION_BOARD_WEEK_COUNT = 8/);
assert.match(dateUtils, /searchParams\?\.week/);
assert.match(dateUtils, /normalizeProductionWeekAnchor/);
assert.match(dateUtils, /getMondayForDate/);
assert.match(dateUtils, /function getSingleValue\([\s\S]*Array\.isArray\(value\) \? undefined : value/);
assert.doesNotMatch(dateUtils, /value\s*\[\s*0\s*\]|value\.at\(\s*0\s*\)|value\s*\[\s*value\.length\s*-\s*1\s*\]|value\.at\(\s*-1\s*\)|value\.(?:shift|pop)\s*\(/);
assert.match(dateUtils, /weekdayDates: \[0, 1, 2, 3, 4\]/);
assert.match(dateUtils, /weekendDates: \[5, 6\]/);
assert.match(dateUtils, /classifyProductionBoardDay/);
assert.doesNotMatch(dateUtils, /searchParams\?\.(?:start|weeks)/);
for (const marker of [
  'Monday stays first', 'Tuesday today keeps Monday first', 'Friday today keeps Monday first',
  "Saturday uses that calendar week's Monday", "Sunday uses that calendar week's Monday",
  'default uses current Vancouver workweek', 'Go to Wednesday', 'Go to Saturday',
  'invalid query fallback', 'strict query rejects whitespace', 'leap day', 'year boundary',
  'Vancouver spring DST week', 'Vancouver fall DST week', 'Previous shifts seven calendar days',
  'Next shifts seven calendar days', 'Today returns current Monday',
  'valid scalar date normalizes to Monday', 'scalar Monday remains unchanged',
  'invalid scalar falls back', 'repeated valid array falls back',
  'repeated identical array falls back', 'valid and invalid array falls back',
  'single-element array falls back', 'undefined query falls back',
]) assert.ok(dateTests.includes(marker), `Missing date-window test marker: ${marker}`);
assert.match(boardTests, /fixedEightWeeks\.weekGroups\.length, 8/);
assert.match(boardTests, /week\.days\.length === 5/);
assert.match(boardTests, /'past', 'past', 'past', 'today', 'future'/);
assert.match(boardTests, /weekendExceptions\[0\]\.date, '2026-07-18'/);
assert.match(tests, /past unfinished booking remains movable/);

assert.match(boardQueries, /loadLatestConfirmedCheckpointOnOrBefore\(params\.boardStart\)/);
assert.match(boardQueries, /selectCheckpointAwareCalculationStart/);
assert.match(boardQueries, /\.gte\('production_date', calculationStart\)/);
assert.match(boardQueries, /\.lt\('production_date', params\.boardEndExclusive\)/);
assert.doesNotMatch(boardQueries, /\.(?:insert|update|upsert|delete)\s*\(|\.rpc\(/);

assert.match(toast, /fixed inset-x-3 top-3/);
assert.match(toast, /pointer-events-none/);
assert.match(toast, /role="status"/);
assert.match(toast, /message\.tone === 'success' \? 1100 : 6000/);
assert.doesNotMatch(toast, /focus\s*\(/);

for (const marker of [
  'future to future', 'future to today', 'future to past', 'today to future',
  'today to past', 'past to today', 'past to future', 'past to past',
  'closed destination requires override', 'overload warns but remains enabled',
  "capacity_source='closure' with is_closed=false", 'zero available hours with is_closed=false',
  'raw is_closed=true requires override', 'invalid booking ID guidance', 'invalid Shop Hours guidance',
  'invalid booking ID reverts, refreshes, closes, and discards UUID',
  'unknown capacity', 'completed bookings', 'locked', 'pending',
  'blank backdate reason rejected', 'whitespace reason rejected', '500',
  'valid drop lands locally', 'same-date drop is no-op', 'outside-visible drop',
  'unchanged Retry preserves UUID', 'material request change rotates UUID',
]) assert.ok(tests.toLowerCase().includes(marker.toLowerCase()), `Missing focused E2C test marker: ${marker}`);

assert.match(docs, /public.*read-only/i);
assert.match(docs, /production=view.*read-only/i);
assert.match(docs, /whole.*card.*drag/i);
assert.match(docs, /one modal review dialog/i);
assert.match(docs, /no Started status/i);
assert.match(docs, /no.*placeholders/i);
assert.match(docs, /controlled Vercel parallel testing/i);
assert.match(docs, /eight fixed calendar workweeks/i);
assert.match(docs, /Previous week, Today, Next week, and Go to date/i);
assert.match(docs, /Completed.*immovable/i);

const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql'));
assert.deepEqual(migrations.filter((name) => /e2c|schedule_move_ui|production_schedule_move/i.test(name)), [], 'E2C must not add a migration');
assert.equal(migrations.filter((name) => name === '20260715000000_extend_production_booking_reschedule_contract.sql').length, 1);
assert.ok(existsSync(paths.e2bAction) && existsSync(paths.e2bContract));

const e2cRuntime = `${interactive}\n${contract}\n${previewAction}\n${previewService}`;
assert.doesNotMatch(e2cRuntime, /create production booking|add booking|duplicate booking|split booking|copy booking|placeholder booking|schedule hold|started status|shop hours edit/i);
assert.ok(JSON.parse(read('package.json')).scripts['verify:phase-2f-e2c-production-schedule-move-ui']);

console.log('Phase 2F-E2C Production Schedule move UI verification passed');
