# Calendar visibility — prepared release

Base: `main`, `f9bbaa02019fe6a0bd2853e85423aa75b8934646`. All changes remain uncommitted. No production mutation, migration application, push or deployment occurred. The follow-up below records separately authorized read-only production metadata inspection.

## Approved behavior and root causes

DoorGo has one shared operational Calendar. Calendar View and Use see the same employee-facing Calendar information, including all Staff Away events regardless of descriptive company/location. Calendar Use additionally permits authorized changes. Jobs No Access does not hide Calendar projections or grant unrestricted Jobs access.

Linked-note failure: `20261015120000` calls `dg_calendar_require_use(false)`; false disables the extra Production requirement, not the Calendar Use requirement. The shared reader previously threw its optional enrichment error, failing initial load, refresh or range extension.

Staff Away discrepancy: the old range RPC explicitly restricts periods to the caller's normalized `company_location`. Calendar View/Use have the same behavior at the same location; administrators have no bypass. Different locations therefore hide different events. The authentication contract describes this field as non-tenant descriptive information. The current approved decision removes that visibility restriction, not the location-specific staffing/editing rules. No hosted definitions or account/event values were inspected, so this mechanism has not been proven to be the exact production incident.

## Implementation

### Linked notes

`20261102120000_calendar_view_linked_fulfillment_notes.sql` replaces only the notes RPC. It checks identity, business eligibility, active profile and Calendar View/Use. It preserves the SELECT/ACL suffix: requested nonarchived Jobs directly linked to nondeleted Delivery/Pickup entries, including completed entries; postgres owner, empty search path and authenticated execution. No arbitrary/unlinked/archived/deleted-only/note-only/indirect-only Job notes qualify. Optional enrichment failures clear linked-note projections and keep Calendar entries; Calendar notes/unlinked content are untouched and no privileged Jobs fallback is used.

### Calendar-only Staff Away read

`20261102130000_calendar_shared_staff_away_read.sql` creates `load_calendar_staff_away_range(date,date)` with explicit authenticated, active/business-eligible Calendar View/Use authorization, bounded date-range validation, SECURITY DEFINER, empty search path and authenticated-only EXECUTE. Production-only permission and administrator status do not replace Calendar permission.

It returns nondeleted overlapping Staff Away periods across all viewer locations, retaining original employee identity, location, dates, revision and notes. Occurrences use `dg_staff_away_is_working_day(a.company_location,date)` and existing `dg_staff_away_full_day_impact(staff_id,date)`; partial drag hours remain authoritative stored values. Each absence's own location/workweek determines displayed dates.

The selectable `activeStaff` roster remains caller-location-specific. Per-period `inEditScope` reflects the existing write-location scope. Calendar cards preserve `companyLocation` and this edit metadata. The details panel displays original location and narrows existing Calendar Use edit controls for newly visible foreign-location periods. Server mutation checks remain authoritative and unchanged; seeing another employee does not authorize editing or move them into the selectable roster.

The shared reader calls the new RPC for initial Calendar load, refresh and range extension. It adds occurrence dates to Calendar's existing exceptional-visible-date input so another location's Saturday workday remains visible. No production capacity/flow calculator, staffing configuration, Job persistence or scheduling formula changes.

### Unchanged boundaries

- `dg_staff_away_scope(boolean)` and the old `load_staff_away_calendar_range(date,date)` remain unchanged.
- Existing save/delete/maximum RPCs, mutation actions, roster validation, capacity deduction/recalculation and location-specific staff/workweek rules remain unchanged.
- No historical migration, table policy/grant, password/business-access function, dependency version or lockfile was changed.
- New RPCs depend on existing `dg_require_business_access()`; this release cannot bypass its coordinated password-security foundation.

## Verification and limits

Passed:

- `npx tsc --noEmit`.
- Focused ESLint on changed TypeScript/TSX/test/verifier files.
- `npm run build`.
- `node --experimental-vm-modules scripts/verify-calendar-view-visibility.mjs`: actual reader, normalization, card/layer helpers and server actions; mocked RPC/identity/checkpoint/capacity reads. Covers cross-location View/Use with Jobs none, original identity/location, caller-scoped roster and edit controls, nonstandard workday display, initial load/refresh/extension, no-access/inactive/setup denial, mutation denial and optional-note failure handling.
- `node scripts/verify-calendar-staff-away-read.mjs`: SQL authorization/projection/ACL checks and immutable historical scope/edit/capacity hashes. Not SQL execution.
- `npm run verify:staff-away-foundation`, `node scripts/verify-staff-away-maximum.mjs`, `node scripts/verify-calendar-operational-permissions.mjs`.
- `npm run verify:capacity-contract`, `npm run verify:production-board-capacity`.
- Linked-note and business-access static checks; diff whitespace and unchanged dependency/lockfile checks.

Unverified:

- Browser assertions. Previous full/headless Chromium downloads failed with invalid ZIP archives. No retry was made. The new foreign-location read-only editor scenario is authored in the focused Calendar permission suite. `npx playwright test -c playwright-calendar-permissions.config.ts --list` successfully collected 36 tests; this does not execute browser assertions.
- Real PostgreSQL/RLS/ACL execution. Prepared suites `scripts/verify-calendar-linked-notes-local.sql` and `scripts/verify-calendar-staff-away-read-local.sql` require separately seeded disposable local databases and authorization. Neither ran. The Staff Away suite checks cross-location View/Use+Jobs none, own workweek/impact projection, unchanged roster, cross-location delete denial, protected read denial, ACLs and unchanged capacity snapshot.
- Hosted effective migration state and actual employee/admin acceptance. No production application rows were read; the follow-up below records read-only schema/history inspection.

## Read-only environment/prerequisite inspection — 2026-11-02

Connected inventory contains `Commercial apps` (DoorGo's shared production project) and `Personal app files` (another application project, not an identified sandbox). DoorGo has no Supabase development branches. The documented Windows `doorgo_password_isolated` cluster is inaccessible from this execution environment and its minimal password fixture does not establish a Calendar test schema. No suitable isolated PostgreSQL test target was identified; neither prepared SQL suite ran. No new project/branch/cluster was created and passed code checks were not repeated.

Explicit READ ONLY production metadata queries verified:

- Recorded prerequisites: `20260825030000`, `20260825040000`, `20261006201036`, `20261009153600`, `20261015120000`, `20261027120000`; `20261028120000` legacy restriction is also recorded. New versions `20261102120000` and `20261102130000` are absent.
- Effective postgres-owned, empty-search-path business eligibility helpers check active profile and completed mandatory setup. Existing Calendar/Staff Away scope helpers include that business guard.
- Effective linked-notes RPC still uses the old Calendar Use guard and the expected direct nondeleted Delivery/Pickup/nonarchived-Job restriction. Its existing ACL permits authenticated and service_role, denies anon; the proposed notes migration retains this pre-existing service-role grant and its internal authorization checks.
- Required Job/Calendar/profile/permission/roster/absence columns and expected types are present. The original workday and full-day-impact helpers are present. The proposed `load_calendar_staff_away_range(date,date)` does not exist yet. Staff Away period/event tables have RLS enabled.
- Migration history includes Work Timer entries beyond DoorGo's latest source version (latest recorded overall `20261028143732`); this confirms the project is shared and must not be used for rollback-based mutation tests or broad migration replay.

This establishes reviewed structural prerequisites, not SQL compilation/behavior of the two unapplied functions, full hosted security certification, or real employee-session acceptance. No credential/key retrieval, application-row reads, Auth writes, DDL, mutation RPCs or production migration execution occurred.

**Current recommendation: NO-GO for production pending real authorization tests.** Simplest alternative is a dedicated disposable local PostgreSQL fixture on the Windows machine with PostgreSQL already installed, separate from both its normal service and preserved password-test cluster. Obtain approval for that setup; use loopback-only connection and synthetic data. Do not repurpose `Personal app files` or create a paid hosted test project.

Required local steps: create isolated `doorgo_notes_test` and `doorgo_staff_away_test` databases; prepare the minimum faithful prerequisite schema/roles/helpers from reviewed definitions and synthetic fixtures; install the two forward SQL files only there; execute the prepared suites with `psql -X -v ON_ERROR_STOP=1 -f scripts/verify-calendar-linked-notes-local.sql` and `psql -X -v ON_ERROR_STOP=1 -f scripts/verify-calendar-staff-away-read-local.sql`, explicitly targeting their guarded database names. Extend the notes denial cases to include Calendar none, inactive/setup-required and anon; test normal own-location create/edit/delete as well as foreign-location denial. Check unchanged capacity and exact View/Use projection parity. Browser acceptance remains a separate outstanding check.

## Files in the cumulative uncommitted task

| Area | Files |
| --- | --- |
| Application | `components/calendar/StaffAwayEditor.tsx`; `lib/calendar/staff-away-queries.ts`; `lib/calendar/staff-away.ts`; `lib/calendar/linked-fulfillment-notes.ts`; `lib/production-board/queries.ts`; `lib/production-board/types.ts` |
| Forward SQL | `supabase/migrations/20261102120000_calendar_view_linked_fulfillment_notes.sql`; `supabase/migrations/20261102130000_calendar_shared_staff_away_read.sql` |
| Regression coverage | `lib/calendar/staff-away.test.ts`; `scripts/verify-calendar-linked-notes-local.sql`; `scripts/verify-calendar-linked-notes.mjs`; `scripts/verify-calendar-staff-away-read-local.sql`; `scripts/verify-calendar-staff-away-read.mjs`; `scripts/verify-calendar-view-visibility.mjs`; `tests/desktop-shell/CalendarPermissionsHarness.tsx`; `tests/desktop-shell/calendar-permissions.spec.tsx` |
| Documentation | `docs/architecture/02-database-and-data-ownership.md`; `docs/architecture/03-authentication-and-security.md`; `docs/architecture/05-calendar-and-production-workflows.md`; `docs/architecture/06-testing-and-development-guide.md`; this release document |

## Production verification and release sequence — approval required

1. Review the diff and complete isolated SQL and browser acceptance before release. Browser command: `npx playwright test -c playwright-calendar-permissions.config.ts --workers=1` once the matching Chromium binary is available through a reliable environment. Do not change dependency versions to bypass the download blocker.
2. Obtain explicit commit/push approval; commit implementation, SQL, tests and architecture updates together. Migration and deployment require separate approval.
3. With separately authorized read-only hosted inspection, verify history and effective business-access foundation (`20261027120000`), compatible password setup cutover, original notes/Staff Away tables, workweek/impact helpers and grants. If these prerequisites are incomplete, stop and use the existing password-security cutover runbook under separate authorization. Do not run the pending migration chain or set cutover acknowledgements for this task.
4. After migration approval, apply only the two complete new files in order: `20261102120000_calendar_view_linked_fulfillment_notes.sql`, then `20261102130000_calendar_shared_staff_away_read.sql`, using the established migration/history process. Keep each file's transaction intact. Skip a file only after confirming it is already applied with the expected effective definition/history. Do not edit historical migrations or invent history records.
5. Verify effective definitions, postgres ownership, empty search paths and ACLs. Under real View/Use sessions with Jobs none and different profile locations, compare Staff Away employee/location/date content. Verify own-location workweek occurrences, linked-note linkage restrictions, Calendar-none/Production-only/anon/inactive/setup-required denial, unchanged selectable rosters, and unchanged foreign-location edit/delete denial. Verify normal own-location Use creation/edit/delete and administrator behavior.
6. After deployment approval, deploy the reviewed application revision with existing settings unchanged. Apply SQL first: the previous app remains compatible with the old reader, while the new app requires the new RPC. No Vercel/Supabase setting change is needed for this correction.
7. Check initial load, refresh, prepend/append date extension, Staff Away layer off/on, weekday and nonstandard-workday absences, notes/Production/Delivery/Pickup/closure/holiday layers, Jobs module denial and read-only controls. Compare existing capacity outcomes before/after. Test enrichment failure in the isolated harness, not by disrupting production.
8. If verification fails, pause rollout. The old Staff Away reader remains available for application rollback, but using it restores the withdrawn location-limited Calendar behavior. Any rollback/migration/deployment needs explicit approval; never weaken edit/business-access gates as a workaround.
