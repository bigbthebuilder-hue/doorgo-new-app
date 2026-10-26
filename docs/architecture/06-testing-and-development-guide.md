# 06 — Testing and development guide

Verified against `7d21f975e103c49a7cfde7e171fd9e8ab563015a` on `main`, 2026-10-15. Commands and paths were inspected, not executed as application verification. This documentation task did not install dependencies, run tests/builds, inspect hosted services or apply SQL. Series completion does not certify current test health.

Start with the [application map](01-application-overview.md), [database ownership](02-database-and-data-ownership.md), [security boundaries](03-authentication-and-security.md), [geometry](04-door-geometry-and-configuration.md) or [Calendar/production](05-calendar-and-production-workflows.md), according to the change. Recheck only affected source paths and later Git changes rather than repeating the full investigation.

## Environment and startup

[package.json](../../package.json) and [lockfile](../../package-lock.json) define Next.js 16.2.10, React 19.2.4, TypeScript 5, Tailwind 4, Supabase SSR/JS, pdf-lib, Resend, ESLint 9 and Playwright React component testing. The installed Next package declares Node `>=20.9.0`; no repository Node-version pin or root engines policy was found. `@types/node` is not a runtime requirement. Verify the installed guidance under `node_modules/next/dist/docs/` before changing Next behavior, as required by [AGENTS.md](../../AGENTS.md).

Existing commands, for use only within an authorized development task:

| Purpose | PowerShell command / prerequisite |
| --- | --- |
| Install locked dependencies | `npm.cmd ci` — installation changes local dependencies; do not run merely to inspect documentation |
| Start local app | `npm.cmd run dev` |
| Typecheck | `npx.cmd tsc --noEmit` — inspect generated/incremental artifacts in Git status afterward |
| Scoped lint | `npx.cmd eslint <changed-TS-or-TSX-paths>` — replace the placeholder with actual paths |
| Repository lint | `npm.cmd run lint` |
| Production build / serve | `npm.cmd run build`, then `npm.cmd run start` — broader than a focused unit check |
| Diff hygiene | `git diff --check` |

Environment categories (names only): public browser/auth configuration is `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; trusted server access uses `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; email uses `RESEND_API_KEY` and `DOORGO_EMAIL_FROM`. Consult [public client configuration](../../lib/supabase/public-env.ts), [trusted client](../../lib/supabase/trusted-read-server.ts), and [email provider](../../lib/jobs/work-order-email-provider.ts). Never copy real environment values into reports, fixtures or browser bundles.

The normal application uses authenticated hosted persistence; local repositories/test shims are not a production fallback. No tracked `supabase/config.toml` was found. The repository does not establish a turnkey local Supabase stack or complete baseline schema: shared legacy objects have prerequisites outside the migration chain. Do not invent a local reset/start procedure or connect to hosted Supabase just to run isolated contracts.

## What the tests actually prove

| Test layer | Locations / limits |
| --- | --- |
| Unit and domain contracts | Colocated `lib/**/*.test.ts`; many scripts compile selected files into `.tmp-*`, execute Node assertions, then clean up on success. A failed chained command can leave artifacts. No generic `npm test` script exists. |
| Service/adapter integration | [Hosted adapter tests](../../lib/jobs/hosted-job-intake-repository.test.ts), [email runtime tests](../../lib/jobs/work-order-send-runtime.test.ts), [admin tests](../../lib/admin/users-service.test.ts) exercise boundaries with controlled dependencies. “Hosted” in a filename is not proof of a remote round trip. |
| Browser components | [Desktop shell config](../../playwright-desktop-shell.config.ts), [Calendar permissions config](../../playwright-calendar-permissions.config.ts), [J3c config](../../playwright-ct.config.ts) use `@playwright/experimental-ct-react`. Action/navigation/server-only shims and component mounting do not exercise the whole Next server or live RLS. Artifacts generally go to OS temporary directories. |
| Focused Intake harness | [Door Intake config](../../playwright-door-intake.config.ts) inherits the desktop config but has an independent component cache and matches **only** `door-mode.spec.tsx` and `door-line-comparison.spec.tsx`. It cannot run arbitrary glass/slab specs just because they render Intake. |
| Static source/SQL checks | `scripts/verify-*.mjs` often assert source strings, migration structure or protected-file invariants. For example [hosted persistence verifier](../../scripts/verify-hosted-native-job-persistence.mjs) reads SQL locally. Others also compile/run contracts; inspect the script before classifying it. |
| PDF/document | [Document tests](../../lib/jobs/work-order-document-contract.test.ts), [PDF tests](../../lib/jobs/work-order-pdf-contract.test.ts) cover output contracts/layout. [HTTP route verifier](../../scripts/verify-work-order-pdf-route.mjs) exercises the actual route export with a synthetic repository; it requires compiled modules, defaulting to `.tmp-stabilization`, and does not test Next route discovery. |
| Database acceptance/probes | SQL files under [scripts](../../scripts/) include catalog reads, mutation probes, rollback-contained acceptance and destructive rollback scripts. [Calendar rollback probe](../../scripts/verify-calendar-corrections-hosted-rollback.sql) invokes mutations inside a transaction. “Rollback” does not mean read-only or permission to execute it. |
| Manual acceptance | Real print preview, readable PDF pagination, live role/RPC behavior, save/reopen and external-service behavior remain separate evidence. [Release discipline](../DOORGO_TESTING_AND_RELEASE.md) supplies review guidance; historical wording must be reconciled with current code. |

No tracked GitHub Actions workflow was found. Local verifiers are not evidence of mandatory CI or deployed checks. External CI, deployment gates and hosted runtime configuration remain unknown.

## Feature-to-test selection

These are existing commands, not a mandatory full-suite checklist. Run the smallest relevant set, then expand for demonstrated shared dependencies. `npm run` can be written `npm.cmd run` in PowerShell.

| Changed area | Starting checks and extensions |
| --- | --- |
| Intake/create/edit | `npm run verify:native-job-intake-j1`; `npm run verify:native-job-intake-j2a`; `npm run verify:hosted-native-job-adapter`. Mode/comparison UI: `npx.cmd playwright test -c playwright-door-intake.config.ts --workers=1`. |
| Geometry/calculators | `npm run verify:native-job-intake-j2b1`; `npm run verify:native-non-glass-frame-cut`; `npm run verify:native-job-intake-glass-unit-builder`. Also inspect [reconciliation tests](../../lib/jobs/glass-door-setup-reconciliation.test.ts) and [exception tests](../../lib/jobs/geometry-exception.test.ts); not every colocated test is included by these scripts. |
| Work Orders/PDF/email | `npm run verify:native-job-intake-j3a`; `npm run verify:native-job-intake-j3b`; `npm run verify:native-job-intake-j3c`; `npm run verify:native-job-intake-diagram-preference`. Browser email harness: `npm run verify:j3c:browser-isolation`, then `npm run verify:j3c:browser`. |
| Calendar/bookings | `npm run verify:calendar-interaction-presentation`; `npm run verify:calendar-production-order`; `npm run verify:calendar-needs-attention`; `node scripts/verify-calendar-operational-permissions.mjs`; `npx.cmd playwright test -c playwright-calendar-permissions.config.ts --workers=1`. |
| Production scheduling/recovery | `npm run verify:phase-2f-e2b-production-reschedule-contract`; `npm run verify:phase-2f-d3-production-recovery-ui`; `npm run verify:phase-2f-f1-production-completion-contract`; `npm run verify:phase-2f-c3-checkpoint-actions`. |
| Capacity/Away/holidays | `npm run verify:capacity-contract`; `npm run verify:production-board-capacity`; `npm run verify:staff-away-foundation`; `npm run verify:capacity-exceptions`; `node scripts/verify-staff-away-maximum.mjs`. |
| Manager/admin | `npm run verify:manager-capacity-foundation`; `npm run verify:admin-users`; `npm run verify:manager-native-job-delete`. |
| Auth/permissions | `npm run verify:phase-2f-c1-auth-contract`; `npm run verify:permission-routing`; affected feature's permission tests as well. |
| Migrations/RPCs | `npm run verify:hosted-native-job-persistence`; `npm run verify:hosted-native-job-migration-package`; `npm run verify:phase-2f-c2-checkpoint-rpcs`; relevant Calendar SQL verifiers. These local checks do not replace separately authorized database acceptance. |
| Imports/identifiers | `npm run verify:legacy-job-transfer-contract`; `npm run verify:legacy-transfer-import-review`; `npm run verify:legacy-transfer-persistence`; `npm run verify:legacy-transfer-hosted-package`. |
| Fulfillment/synchronization | `npm run verify:calendar-fulfillment-families`; `npm run verify:calendar-unified-delete-lifecycle`; `node scripts/verify-calendar-job-sync.mjs`; `node scripts/verify-calendar-full-edit.mjs`. |

For an individual desktop component spec, use its matching config, for example `npx.cmd playwright test -c playwright-desktop-shell.config.ts tests/desktop-shell/glass-calculator-print.spec.tsx --workers=1`. Check inherited aliases and `testMatch` first. Archive and import have dedicated [archive](../../playwright-native-job-archive.config.ts) and [import](../../playwright-legacy-transfer-import.config.ts) configs. Do not repair unrelated Calendar shims solely to run a door test without first checking harness selection.

## Cross-feature regression priorities

| Shared dependency | Additional evidence to seek |
| --- | --- |
| Job IDs/SO/portions | Transfer identifier tests, native link enrichment, Calendar identity, current-portion uniqueness, backorder lifecycle, Work Order filename/identity and saved reopen. Never derive persistence IDs from formatted titles. |
| Job/fulfillment sync | Exercise combined and dedicated triggers, repeated obligations, null fulfillment plan, completion/deletion and stale Job revision. Local source checks cannot establish live trigger ordering/concurrency. |
| Geometry/rounding | Forward calculations, inverse reconciliation, serialization/reopen, exceptions, diagrams and PDF dimensions. Include Interior/Exterior, DD, LOW-PRO, J-4-S, No Jamb and custom/RO sizing relevant to the change. |
| Production/capacity | Separate completion from planned starts and actual carry; check Needs Attention, day order, recovery, unknown capacity and checkpoints. |
| Away/holidays | Date ranges, partial maximum, overlap, effective staff version, closure/special-day/override precedence and repeated recalculation without double deduction. |
| Permissions/RLS | UI view/use plus direct action/RPC checks; Calendar-only versus planning, setup-required/inactive accounts, manager deletion and company scope. Mocked browser gates do not prove SQL enforcement. |
| PDF | Realistic long values, wrapping/pagination, preflight/acknowledgement, revision conflict, download/preview/email authority and standalone browser printing. A synthetic route test cannot prove the running Next route is registered. |

## Safe change sequence

1. Check branch/HEAD and complete Git status; preserve unrelated work. Read the task, [governance](../../AGENTS.md), relevant architecture chapter and current contract. Architecture is a map, not authority to change product rules.
2. Trace the affected producer, all consumers and effective SQL definitions. Use targeted searches; check later `ALTER`/grant/dynamic patches rather than stopping at the first function definition.
3. Capture relevant baseline failures when needed, then make the smallest authorized change. Keep geometry, permission and persistence authority in existing shared modules.
4. Run focused contracts and the correct component harness. Typecheck and scoped ESLint apply to code changes. Broaden to dependent features/build only when risk and authorization justify it; do not equate a full lint/build with business acceptance.
5. Review diffs, generated artifacts and status. Report exact commands/results, pre-existing failures, skipped checks and remaining manual acceptance. Never silently amend a stale fixture to conceal changed behavior.
6. Stage only intended files and commit only when the task authorizes it. Push, deploy, database changes and hosted writes require their own explicit authorization. Stop at the requested checkpoint.

## Database safety

Security Fix 1 coverage (2026-10-15, based on `d86e55a`): `node scripts/verify-calendar-linked-notes.mjs` checks the forward migration's predicate/grants statically. [Local database authorization checks](../../scripts/verify-calendar-linked-notes-local.sql) exercise the actual RPC as Calendar-use-only and view-only actors, mixed/duplicate Job IDs, archived/unlinked/deleted/Note-only cases, completed items, and a linked item created by another user. They require an already migrated, seeded, isolated local PostgreSQL database named `doorgo_notes_test`; missing fixtures fail. The script rolls back its temporary test state and does not seed application tables or apply migrations. No local PostgreSQL/Docker/Supabase executable was available for this task, so runtime tests were not run. Static success is not authorization proof; inspect the script's local-only guard and prerequisites before separately authorized execution. Existing Calendar permission/full-edit verifiers remain regression checks for unchanged paths.

Local migrations are proposed source history, not proof of hosted application. No local filename establishes the current remote schema or pending-migration set. Inspect effective history and shared-object ownership in [Task 2](02-database-and-data-ownership.md); do not alter another application's objects based on a DoorGo caller alone.

Before any separately authorized migration, identify the exact target, remote history, prerequisites and complete pending set using approved read-only inspection. Do not assume a push applies one file. Review rollback scripts for dependencies/data loss and dynamic patch predecessor hashes; they are not generic undo commands. Transaction rollback probes still execute writes/triggers and may acquire locks or consume sequence values. Service-role access, SQL Editor, history repair, resets and Auth admin operations are privileged actions, not routine local testing. This guide supplies no hosted execution authorization.

## Troubleshooting and coverage limits

- **No tests matched / unrelated shim errors:** inspect config `testMatch`, inherited Vite aliases and component registry/cache. The dedicated Intake config explicitly isolates its cache; do not assume its existence makes it a universal Intake runner.
- **Node cannot find compiled test modules:** focused scripts use different output roots and compilation targets. The PDF route verifier explicitly expects a compiled module tree; inspect its prerequisites instead of invoking it as a standalone package command.
- **Static verifier fails after legitimate refactoring:** distinguish an assertion about source spelling from a behavioral contract. Understand the protected invariant before adjusting tests; no test edits are authorized by this documentation.
- **PDF URL fails but document tests pass:** inspect actual route/status/revision/preflight and running-server registration separately. Never infer a missing route or bypass acknowledgement from a synthetic test result.
- **Stale geometry / identity / schedule:** start with the corresponding chapter's authority chain, not a display-string patch. Recheck saved-input metadata, current recalculation, revision conflicts, enrichment provenance and SQL side effects.

**Verified limitations:** component shims and mocked service tests do not cover live Supabase authorization; static migration assertions do not execute triggers; the synthetic PDF HTTP verifier does not boot Next; no tracked CI pipeline or complete local Supabase bootstrap was found. These are test-boundary facts, not claims that no manual acceptance has ever occurred.

**Coverage unclear, requiring a targeted audit:** exhaustive geometry combinations; unequal DD diagrams; old-record round trips under new formulas; simultaneous Job/Calendar mutations; cross-company visibility/capacity; external writer races; live Auth/provider failure paths. No coverage percentage or universal test runner was established. Relevant `.test.ts` existence does not prove a package script runs it.

For high-risk changes, separately authorize manual save/reopen, direct-role/RPC and realistic print checks. Record the tested commit, data/configuration, expected result and actual result. Never claim current hosted security, migration compatibility or manufacturing acceptance from this documentation series alone.

## Password operation foundation checks

Stage 1 adds [static safeguards](../../scripts/verify-password-operations.mjs), [transactional SQL cases](../../scripts/verify-password-operations-local.sql), and a [two-session reservation check](../../scripts/verify-password-operations-concurrency.mjs). The source migration is [20261016120000](../../supabase/migrations/20261016120000_password_operation_foundation.sql); it must follow the existing local chain, whose previous newest migration is `20261015120000`. It does not modify historical migrations or active authentication behavior.

- `node scripts/verify-password-operations.mjs`: static source/grant-shape checks only.
- `npx.cmd eslint scripts/verify-password-operations.mjs scripts/verify-password-operations-concurrency.mjs`: scoped JS lint.
- `node scripts/run-password-database.mjs test <explicit connection arguments>`: real SQL transitions/grants, all changes rolled back. Use the exact arguments in the [isolated runbook](../../scripts/password-operation-test-runbook.md).
- `node scripts/verify-password-operations-concurrency.mjs <explicit connection arguments>`: two local psql sessions; first reservation holds locks, competing reservation times out, retry after rollback succeeds. This timeout is a test of lock contention, never a production recovery rule.

Runtime prerequisites: separately prepared isolated local `doorgo_password_test`, migration applied locally, Supabase roles, local owner connection, and two active setup-required profile fixtures with no internal setup-state rows. Tests do not create Auth users, call Auth, apply migrations or connect to hosted Supabase. The runners require an absolute psql path, literal loopback host, nondefault port, disposable database, owner and external password-file path; inherited libpq overrides are removed from child environments. Both sessions roll back. Reserved test operation UUIDs must be unused.

Coverage includes generation/request idempotency, pending-reset supersession, stale and duplicate completion, definitive failure, unknown-outcome blocking despite age, explicit reconciliation, cross-user isolation, actual ordinary-role denial and trusted-role invocation. The two-session check proves lock contention/rollback retry, not full Auth concurrency or all transaction isolation levels. The initial PATH-only probe missed installed PostgreSQL 18.4 under `C:\Program Files\PostgreSQL\18\bin`; SQL/runtime and concurrency suites nevertheless remain **not executed**. Static success is not runtime proof. Future integration needs Auth crash/retry/reset tests and deployment-grant verification.


### Prepared isolated bootstrap (not executed)

Based on `156498f`, [bootstrap SQL](../../scripts/bootstrap-password-operations.sql) supplies restricted local roles and explicitly labeled minimal Auth stand-ins, loads the real profile/password-setup/foundation migrations, and inserts synthetic profiles. It requires a fresh dedicated cluster and never overwrites data. This is not full migration replay or Auth-service emulation. [Runner](../../scripts/run-password-database.mjs), [connection guards](../../scripts/password-test-connection.mjs), and [offline checks](../../scripts/verify-password-bootstrap.mjs) avoid global PATH changes and reject default-port/remote targets. Follow the [runbook](../../scripts/password-operation-test-runbook.md) only after separate execution approval. No active authentication behavior or database objects have been changed by preparing these scripts.

## Inactive employee setup checks — Stage 2

Run `node scripts/verify-employee-password-setup.mjs`. The [focused verifier](../../scripts/verify-employee-password-setup.mjs) compiles/runs [orchestration tests](../../lib/auth/employee-password-operation.test.ts), preserves/runs existing [password validation/sequence tests](../../lib/auth/password-setup.test.ts) and [access tests](../../lib/auth/access.test.ts), and executes the real server adapter with mocked SDK/client boundaries. It also checks the absence of production callers, server-only isolation and new snapshot SQL grant/predicate shape. Temporary compilation files are removed only from its own unique workspace directory.

Coverage includes success sequencing, explicit Auth rejection, committed/lost finalization responses, bounded same-operation finalization retry, unknown outcomes, stale generations, incorrect user/operation, overlapping submissions, lost reservation responses, account restrictions and malformed RPC responses. Adapter cases verify `auth.getUser()` precedes trusted access, browser identity/success fields are ignored, and conservative SDK-error classification. These are **mocked boundary tests plus static SQL checks**, not real Auth or database integration tests.

Static checks: `npx.cmd tsc --noEmit`; `npx.cmd eslint lib/auth/employee-password-operation.ts lib/auth/employee-password-server.ts lib/auth/employee-password-operation.test.ts scripts/verify-employee-password-setup.mjs`; `git diff --check`. No runtime SQL checks for the new snapshot migration have been run or authorized in Stage 2. The Stage 1 suites previously passed after the BOM-only correction at `94d875f`; that evidence does not cover this new RPC, Auth HTTP failures or production activation. The existing local bootstrap intentionally remains unchanged and does not load Stage 2's migration.

Follow-up runtime validation (2026-10-23, source `1dd7e45`): the actual snapshot migration was applied **only** to the preserved disposable PostgreSQL 18.4 database. [Snapshot runtime tests](../../scripts/verify-password-snapshot-local.sql), unchanged foundation SQL tests, and two-session reservation tests passed; their mutations rolled back and the cluster was stopped. The [snapshot runner](../../scripts/run-password-snapshot.mjs) checks identity/prerequisites and exposes separate inspect/apply/test modes; follow the [runbook supplement](../../scripts/password-operation-test-runbook.md#snapshot-rpc-follow-up-validation), skipping apply when already installed. Coverage includes actual role denials, trusted execution, user isolation, current/stale generations, pending/reserved/unknown/succeeded selection, no-operation defaults and read-only behavior. Service-role cross-user reads are intentionally trusted; authenticated identity binding remains an adapter responsibility. This supersedes the earlier snapshot-runtime limitation, but does not validate real Auth writes, hosted state, PostgREST, full migration replay, or activate the integration.

## Inactive administrative reset checks — Stage 3

`node scripts/verify-admin-password-reset.mjs` compiles/runs [reset orchestration cases](../../lib/admin/password-reset-operation.test.ts) and unchanged [active user-administration tests](../../lib/admin/users-service.test.ts), then exercises the real server adapter with mocked SDK/client modules. It verifies no active imports, fixed target identity, authorization before privileged-client creation, profile requirement before Auth, project matching and status-only results. Run `node scripts/verify-employee-password-setup.mjs` for employee regressions and its expanded inactive-boundary scan; it permits the two explicit inactive admin modules to reuse existing operation parsers/types, while denying active callers of either integration.

Coverage includes authorized/unauthorized actors, inactive/missing targets, unchanged validation, success retaining setup requirements, definitive failure, unknown outcomes, two competing resets, employee-write/reset ordering, stale generations, lost/duplicate finalization, lost reservations and cross-user/mismatched responses. These race cases are **mocked orchestration interleavings**, not PostgreSQL or real Auth concurrency. Existing SQL/concurrency evidence at `dddb746` covers foundation transitions and lock contention, not this new multi-call profile/Auth orchestration. The minimal database bootstrap lacks user-administration RPCs; combined SQL authorization/profile integration, process-death recovery, provider errors and deactivation/permission races still need separately scoped integration testing before activation.

Focused static commands: `npx.cmd tsc --noEmit`; `npx.cmd eslint lib/admin/password-reset-operation.ts lib/admin/password-reset-server.ts lib/admin/password-reset-operation.test.ts scripts/verify-admin-password-reset.mjs scripts/verify-employee-password-setup.mjs`; `node scripts/verify-password-operations.mjs`; `git diff --check`. No migration or live password changes are needed for these offline checks.

## Atomic-transition verification — Stage 4A

Based on `3ef49aa`, the [new migration](../../supabase/migrations/20261023140000_password_atomic_profile_transitions.sql) was applied only to the preserved isolated PostgreSQL 18.4 database. [Rollback tests](../../scripts/verify-password-atomic-local.sql) passed atomic reset/completion, injected failure after intermediate writes, terminal idempotency/timestamps, unknown/failed outcomes, newer-reset preservation, inactive targets, cross-user mismatch and actual anon/authenticated denial. The existing foundation/snapshot suites passed with only their now-obsolete profile-unchanged expectations changed to require atomic profile completion; other assertions remain.

[Three real concurrency cases](../../scripts/verify-password-atomic-concurrency.mjs) observed `pg_stat_activity` lock waits, then committed both sessions and checked the final generation/profile/internal states: employee completion then reset, reset then employee completion, and two administrative resets. Each case creates a unique synthetic identity in the minimal local schema and deletes only that case's rows in `finally`; original bootstrap fixtures remain untouched. This is real PostgreSQL concurrency, not Auth concurrency. The original two-session reservation regression also passed.

Use [run-password-atomic.mjs](../../scripts/run-password-atomic.mjs) inspect/apply/test with the explicit connection arguments in the [runbook](../../scripts/password-operation-test-runbook.md#stage-4a-atomic-transition-validation). Apply requires separate authorization and rejects an already-corrected helper. Do not bootstrap/recreate the preserved database. The new migration remains installed there; test transactions roll back and the isolated cluster was stopped afterward.

Offline checks: `node scripts/verify-password-atomic.mjs` checks bounded SQL replacements/grants; existing employee/admin verifiers check the inactive adapters with mocked SDK boundaries. Employee mocks now clear both requirements; admin mocks establish both at reset request. These remain distinct from runtime SQL tests. TypeScript, scoped ESLint and documentation links are required. Full Auth/process-death integration, legacy completion removal, permission gates and safe rollout remain unverified activation dependencies.

## Stage 4B authority validation

Prepared from 93fb453; resumed 2026-10-26. [Authority SQL tests](../../scripts/verify-password-authority-local.sql) cover authenticated/anonymous legacy-call rejection, session-only and direct-profile denial, own/cross-user denial, trusted current-generation completion, and stale/unknown/failed outcomes. Existing foundation/snapshot/atomic and both real concurrency suites pass after removal. This is PostgreSQL evidence, not hosted/Auth integration proof.

[run-password-authority.mjs](../../scripts/run-password-authority.mjs) supports inspect/test/guard-test with the existing isolated connection arguments. Apply was completed in the earlier local run and must not be repeated. Guard tests verify fresh/separate-session rejection and same-direct-session passage to the already-absent DROP without recreating the function. See the [runbook](../../scripts/password-operation-test-runbook.md#stage-4b-cutover-only-legacy-removal).

Run node scripts/verify-password-authority.mjs for bounded removal/guard-order checks, the unchanged active caller and inactive import checks. Static checks cannot establish hosted non-application. Also run npx.cmd tsc --noEmit, scoped ESLint on the two new .mjs files, existing password static verifiers, documentation-link validation and git diff --check. No active action, previous migration or existing assertion changed in Stage 4B.

### Stage 4C-1 requirement-only tests

Based on `2c20e83`, [SQL cases](../../scripts/verify-password-require-change-local.sql) test actual service_role execution, own/cross-user ordinary-role denial, missing/inactive targets, injected rollback, generation increments, old receipts, preserved reserved/unknown writes and pending-reset rejection. [Concurrency cases](../../scripts/verify-password-require-change-concurrency.mjs) observe PostgreSQL lock waits and committed outcomes for employee-then-require, require-then-employee and two requirement requests. Only their unique synthetic users are removed; original fixtures remain unchanged. All passed locally, along with existing foundation/snapshot/atomic/authority SQL and reservation/atomic concurrency regressions. This is not real Supabase Auth or full migration replay.

[Offline verifier](../../scripts/verify-password-require-change.mjs): `node scripts/verify-password-require-change.mjs` runs static SQL/grant/inactive-boundary checks and 14 real-adapter cases with mocked clients, including denied/setup-required actors, target validation, lost responses and repeat requests. It uses the actual user-administration contract; it does not claim runtime human-admin authorization in SQL. The minimal isolated fixture has no full user-administration schema.

Use [the guarded runner](../../scripts/run-password-require-change.mjs) and [runbook](../../scripts/password-operation-test-runbook.md#stage-4c-1-requirement-only-validation). TypeScript, scoped lint, documentation-link validation and `git diff --check` accompany the focused checks. Existing employee/admin verifiers remain unchanged.

### Stage 4C-2A reactivation verification

Based on `cebea05`, [SQL tests](../../scripts/verify-password-reactivation-local.sql) exercise actual PostgreSQL roles, inactive eligibility, generations, request/finalization idempotency, cross-user rejection, cross-kind reservation exclusion, trusted success/reconciliation, failed/unknown outcomes, ordinary-kind non-activation, stale settlement, and injected activation/deactivation rollback. [Concurrency tests](../../scripts/verify-password-reactivation-concurrency.mjs) observe lock contention and commit both orderings of deactivation/reactivation, competing reactivation requests, employee completion/deactivation and reset completion/deactivation. Only each concurrency case's unique synthetic fixture is removed; original fixtures remain intact.

`node scripts/verify-password-reactivation.mjs` runs [8 orchestration tests](../../lib/admin/reactivation-operation.test.ts), 9 real-adapter cases with mocked SDK boundaries and static SQL/inactive-import checks. Existing authority/employee import scans permit only the explicit new inactive modules; active callers remain forbidden. Existing employee/admin and requirement-only tests remain regressions. SQL fixtures do not emulate Supabase Auth, JWT sessions or full user-administration SQL, so human authorization is mocked separately from database role enforcement.

Use the [local runner](../../scripts/run-password-reactivation.mjs) and [runbook](../../scripts/password-operation-test-runbook.md#stage-4c-2a-reactivation-validation). TypeScript, scoped lint, static SQL checks and documentation links accompany local runtime tests. Hosted state, real session revocation and Auth/process-death integration remain unverified.
