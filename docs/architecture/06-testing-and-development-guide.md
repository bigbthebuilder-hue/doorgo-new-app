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
