# 01 — Application overview

Verified against commit `3bc781fdca657b47919f9707bab4b8a6b47b02cc` (`Restore complete Calendar production identity`) on `main`, 2026-10-13. Verification was repository inspection only: no hosted access, test execution, deployment, or applied-migration audit. See the [reference index](README.md) for authority and scope.

## Stack and application boundary

[package.json](../../package.json) declares Next.js 16.2.10, React/React DOM 19.2.4, TypeScript 5, Tailwind 4, Supabase JS/SSR, `pdf-lib`, and Resend. Development verification uses ESLint 9 and Playwright React component testing. Ranged dependencies are declarations, not proof of hosted runtime versions; [package-lock.json](../../package-lock.json) records dependency resolution.

DoorGo is a Next.js App Router application. [Root layout](../../app/layout.tsx) loads fonts and [global styles](../../app/globals.css); page-level composition uses the [shared shell](../../components/app-shell/). [`proxy.ts`](../../proxy.ts) delegates Supabase session refresh. [`@/*`](../../tsconfig.json) resolves from the repository root.

## Routes and module map

| Routes | Feature and source entry points |
| --- | --- |
| `/`, `/login`, `/account`, `/account/change-password`, `/auth/logout` | Permission-aware startup/account/session flow: [app routes](../../app/), [auth contracts/services](../../lib/auth/), [navigation](../../lib/app-shell/navigation.ts) |
| `/jobs`, `/jobs/new`, `/jobs/[internalJobId]/edit` | Native Job workspace: [routes](../../app/jobs/), [JobsWorkspace](../../components/jobs/JobsWorkspace.tsx), [JobHeaderForm](../../components/jobs/JobHeaderForm.tsx), [DoorLineWorkspace](../../components/jobs/DoorLineWorkspace.tsx) |
| `/jobs/import` | Legacy transfer validation and unsaved review: [import page](../../app/jobs/import/page.tsx), [mapping](../../lib/jobs/legacy-transfer-mapping.ts), [import contract](../../lib/jobs/legacy-transfer-import-contract.ts) |
| `/jobs/[internalJobId]/work-order`, suffix `/pdf` | Saved Job preview/PDF: [route directory](../../app/jobs/%5BinternalJobId%5D/work-order/), [WorkOrderPreview](../../components/jobs/WorkOrderPreview.tsx), [document contract](../../lib/jobs/work-order-document-contract.ts) |
| `/glass-calculator` | Local door/glass calculations and browser printing: [page](../../app/glass-calculator/page.tsx), [StandaloneGlassCalculator](../../components/jobs/StandaloneGlassCalculator.tsx) |
| `/documents` | Output launcher, not a document-history repository: [definitions](../../lib/documents/document-definitions.ts) |
| `/calendar` | Production, delivery, pickup, notes, Staff Away, capacity exceptions: [page](../../app/calendar/page.tsx), [CalendarWorkspace](../../components/CalendarWorkspace.tsx), [calendar modules](../../lib/calendar/) |
| `/production-board`, `/production-schedule` | Read-only board and interactive scheduling route: [board page](../../app/production-board/page.tsx), [schedule page](../../app/production-schedule/page.tsx), [shared read/normalization](../../lib/production-board/), [booking operations](../../lib/production-bookings/) |
| `/production-recovery`, `/production-checkpoints` | Recovery/move workflows and flow checkpoints: [recovery page](../../app/production-recovery/page.tsx), [checkpoint page](../../app/production-checkpoints/page.tsx), [flow modules](../../lib/production-flow/) |
| `/manager` | Capacity/workweek/exceptions and user administration: [page](../../app/manager/page.tsx), [manager modules](../../lib/manager/), [user administration](../../lib/admin/) |

Route existence does not imply menu visibility or permission. Inspect each page and [access rules](../../lib/auth/access.ts); Calendar use, Production planning, Jobs, settings, and users are distinct capabilities.

Customer/contact fields belong to the [Job aggregate](../../lib/jobs/job-intake-types.ts). Door/material/glass choices are domain inputs and constants. Inspection found no separate customer-master route, product-catalog service, monetary pricing engine, or payment workflow. Shop hours describe operational workload, not price. Do not infer missing commerce features from Sales Order or vendor terminology.

## Main dependency chains

1. **Intake → domain normalization/calculation → persistence and output.** [DoorLineWorkspace](../../components/jobs/DoorLineWorkspace.tsx) and [GlassUnitBuilder](../../components/jobs/GlassUnitBuilder.tsx) use [door-line normalization](../../lib/jobs/door-line-contract.ts), [glass geometry](../../lib/jobs/glass-geometry-contract.ts), and [non-glass frame/cut calculation](../../lib/jobs/non-glass-frame-cut-contract.ts). [Glass input reconciliation](../../lib/jobs/glass-dimension-reconciliation-contract.ts) and [door-setup reconciliation](../../lib/jobs/glass-dimension-reconciliation-contract.ts) must be read with caller behavior; output values are not independent user inputs. The standalone calculator reuses DoorLineWorkspace in calculation-only mode and does not save a Job.
2. **Saved Job → document → preview/PDF/email.** [Generation](../../lib/jobs/work-order-generation-service-contract.ts) reads the current saved aggregate and uses its persisted timestamp. [Document construction](../../lib/jobs/work-order-document-contract.ts), [preflight](../../lib/jobs/work-order-preflight-contract.ts), [layout](../../lib/jobs/work-order-layout.ts), and [PDF rendering](../../lib/jobs/work-order-pdf-contract.ts) are separate stages. The [PDF route](../../app/jobs/%5BinternalJobId%5D/work-order/pdf/route.ts) rejects a revision mismatch and requires applicable acknowledgement. It does not retrieve arbitrary historical snapshots. [Email sending](../../lib/jobs/work-order-send-service.ts) uses revision-pinned generation and an authorized recipient directory.
3. **Jobs ↔ Calendar production/fulfillment.** [Job actions](../../lib/jobs/job-intake-actions.ts) call [services](../../lib/jobs/job-intake-service.ts) and the [hosted repository](../../lib/jobs/hosted-job-intake-repository.ts). SQL synchronization connects Job scheduling fields to Calendar obligations; the [synchronization migration](../../supabase/migrations/20260821040000_sync_native_jobs_calendar_obligations.sql) is an entry point, not a substitute for tracing later replacements in the migration chain. This overview does not specify the database architecture.
4. **Calendar and Production Board → shared reads and capacity.** [queries.ts](../../lib/production-board/queries.ts) combines bookings, legacy Jobs, optional native Job enrichment, capacity, checkpoints, and requested Calendar layers. [Normalization](../../lib/production-board/normalize.ts) supplies the shared model. Staff Away and manager exceptions affect capacity; checkpoints affect production carry. [Date utilities](../../lib/production-board/date-utils.ts) handle date-only windows and Vancouver-local dates.
5. **Identity and lifecycle → multiple surfaces.** [Unified identifiers](../../lib/jobs/unified-job-identifier.ts), [native Job links](../../lib/production-board/native-job-links.ts), [Calendar presentation](../../lib/calendar/presentation.ts), and [fulfillment families](../../lib/calendar/order-family.ts) connect native UUIDs, visible identifiers, Sales Orders, and legacy provenance. Calendar-native booking titles and opaque imported titles have different presentation authority.

## Frontend, Supabase, and services

- Server pages load data; client workspaces invoke server actions. [Authenticated server client](../../lib/supabase/server.ts), [browser client](../../lib/supabase/client.ts), and [session proxy](../../lib/supabase/proxy.ts) use Supabase SSR/public configuration. [Current access](../../lib/auth/current-access.ts) resolves the authenticated user, profile, and explicit permissions.
- [Job repository selection](../../lib/jobs/job-intake-repository.ts) uses hosted persistence in normal execution; a test repository can be injected. A local repository exists for isolated workflows/tests, not an automatic hosted-failure fallback.
- Many mutations use authenticated SQL RPCs. UI gates do not replace server/SQL authorization. [Calendar mutation permission](../../lib/calendar/permissions.ts) is separate from Production Board/Checkpoints permission.
- [Trusted client](../../lib/supabase/trusted-read-server.ts) uses a server-side service-role credential. Its name is not a universal read-only guarantee: [user administration](../../lib/admin/users-server.ts) uses its Auth admin API after authorization, including account creation/password operations. Never use service-role availability as caller authorization.
- [Resend provider](../../lib/jobs/work-order-email-provider.ts) sends Work Order PDF attachments. [Recipient resolution](../../lib/jobs/work-order-recipient-directory.ts) uses active profiles/Auth accounts. Runtime provider configuration and production enablement were not checked.
- Vendor-copy text is generated by the calculation domain. No automated vendor purchasing integration was found. Legacy Calendar/source metadata is not proof that an external synchronization worker lives in this repository.

## Shared code, contracts, and change risk

| High-risk area | Consult before changing |
| --- | --- |
| Geometry and sizing shared by editor, saved-line output, calculator, PDF | [Dimensions](../../lib/jobs/dimension-contract.ts), [construction](../../lib/jobs/construction-contract.ts), [slab sizing](../../lib/jobs/slab-sizing-contract.ts), [DD sizing](../../lib/jobs/double-door-sizing-contract.ts), [domain rules](../DOORGO_DOMAIN_RULES.md) |
| Saved revision, derived-result freshness, exceptions, acknowledgement | [Geometry implementation](../../lib/jobs/glass-geometry-contract.ts), [preflight](../../lib/jobs/work-order-preflight-contract.ts), [Work Order rules](../DOORGO_WORK_ORDER_RULES.md) |
| Job/Calendar edits, deletion, fulfillment and audit side effects | [Calendar actions](../../lib/calendar/calendar-item-actions.ts), [Calendar Production actions](../../lib/production-bookings/calendar-production-actions.ts), [scheduling rules](../DOORGO_SCHEDULING_RULES.md), current SQL definitions |
| Permission boundaries and privileged operations | [Access](../../lib/auth/access.ts), [permissions/safety](../DOORGO_PERMISSIONS_AND_SAFETY.md), [authentication contract](../authentication-permissions-contract.md) |
| Capacity, date windows, ordering, overlapping refreshes | [Capacity reads](../../lib/production-board/capacity-queries.ts), [Calendar activity](../../components/calendar/CalendarActivity.tsx), [performance guardrails](../DOORGO_CALENDAR_PERFORMANCE_GUARDRAILS.md) |
| Shared screen/print presentation | [App shell](../../components/app-shell/), [global CSS](../../app/globals.css), [DimensionInput](../../components/jobs/DimensionInput.tsx), [comparison hook](../../components/jobs/useEditedField.ts) |

Additional contracts: [native Intake](../native-job-intake-contract.md), [hosted persistence](../hosted-native-job-persistence-contract.md), [legacy transfer](../legacy-job-transfer-contract.md), and [shared production schedule](../shared-production-schedule-architecture.md). Reconcile older documents against current source; do not copy their historical release status as current fact.

## Verification entry points

Commands below are references, not checks executed for this documentation task. Use [package scripts](../../package.json) and [testing/release discipline](../DOORGO_TESTING_AND_RELEASE.md) to select scope; inspect scripts before running anything with hosted/database prerequisites. There is no generic `npm test` script.

| Concern | Relevant checks |
| --- | --- |
| General | `npx.cmd tsc --noEmit`; `npx.cmd eslint <changed-files>` |
| Job normalization/geometry | [door-line tests](../../lib/jobs/door-line-contract.test.ts), [frame/cut tests](../../lib/jobs/non-glass-frame-cut-contract.test.ts), [glass reconciliation tests](../../lib/jobs/glass-door-setup-reconciliation.test.ts) |
| Persistence adapter | `npm run verify:hosted-native-job-adapter` |
| Work Order/document/PDF | `npm run verify:native-job-intake-j3a`; `npm run verify:native-job-intake-j3b` |
| Calendar | `npm run verify:calendar-interaction-presentation`; `node scripts/verify-calendar-operational-permissions.mjs`; `npx.cmd playwright test -c playwright-calendar-permissions.config.ts --workers=1` |
| Capacity | `npm run verify:production-board-capacity` |
| Intake browser components | `npx.cmd playwright test -c playwright-door-intake.config.ts --workers=1` |
| Access/admin | `npm run verify:permission-routing`; `npm run verify:admin-users` |

Colocated `lib/**/*.test.ts` files commonly use Node assertions after focused TypeScript compilation. [Playwright configurations](../../playwright-desktop-shell.config.ts) use React component harnesses; the [Calendar configuration](../../playwright-calendar-permissions.config.ts) aliases actions to test shims. Mocked coverage does not establish hosted RLS or live integration correctness. Browser, database, and manual acceptance are separate evidence.

Build entry points are `npm run dev`, `npm run build`, and `npm run start`. [Next configuration](../../next.config.ts) is minimal. No tracked Vercel deployment configuration or GitHub Actions workflow was found; README deployment advice is generic, not a verified release pipeline.

## Unresolved and explicitly unverified

- Hosted deployment settings, active external synchronization services, and applied migration history were not inspected. Local migrations do not establish remote state; `supabase/config.toml` was absent at verification.
- Repository database ownership and effective local SQL/RLS/trigger relationships are documented in [Chapter 02](02-database-and-data-ownership.md). Hosted state and missing legacy schema remain unverified; do not infer all side effects from TypeScript callers.
- Native Job enrichment is permission-dependent in the [Calendar page](../../app/calendar/page.tsx); some records may legitimately lack linked display data. Do not infer data provenance from whether Open Job is visible.
- No separate customer/product/pricing subsystem was found in the inspected source; externally owned systems remain unverified.
- [Current checkpoint](../DOORGO_CURRENT_CHECKPOINT.md) records an older branch/checkpoint. Read it as historical context unless reconciled with current Git state. Existing [workflow](../DOORGO_CODEX_WORKFLOW.md) and [root governance](../../AGENTS.md) still govern task scope.
- Test health and manual production acceptance were not reassessed for this document. Source-linked test presence is not a claim that all tests currently pass.

## Navigation update (working tree based on `1abbac6`)

The [root route](../../app/page.tsx) has no unique business workflow: it redirects through the existing protected-access guard and [landing selector](../../lib/app-shell/navigation.ts). Login and root/PWA startup prefer Calendar; fallbacks are Jobs, Production Board, Checkpoints, Documents, Glass Calculator, Admin, then Account according to existing permissions. Unauthenticated startup goes to login; mandatory setup still goes to password setup. The [manifest](../../app/manifest.webmanifest) retains `start_url: /`. Only startup routes select a default; existing permitted destination URLs remain unchanged.

The shared sidebar no longer contains Home. Its prominent **+ New Job** link requires Jobs `use`, opens the existing `/jobs/new` workflow, and retains the [unsaved-change guard](../../components/app-shell/UnsavedChangesGuard.tsx). Jobs `view` does not expose creation; the destination still enforces its own permission. No creation or persistence logic is duplicated.

The saved [Work Order page](../../app/jobs/%5BinternalJobId%5D/work-order/page.tsx) passes Calendar visibility to [WorkOrderPreview](../../components/jobs/WorkOrderPreview.tsx). **Go to Calendar** follows **Back to Job**, without saving, changing revisions, or invoking PDF/Send actions. Printing stays on the preview.

Focused checks: `node scripts/verify-permission-routing.mjs`; [navigation contracts](../../lib/app-shell/navigation.test.ts); `npx.cmd playwright test -c playwright-desktop-shell.config.ts tests/desktop-shell/navigation.spec.tsx --workers=1`; `npx.cmd playwright test -c playwright-ct.config.ts tests/j3c-browser/work-order-preview.spec.tsx --workers=1`. Browser tests use local component harnesses and synthetic destinations; installed-app startup and live account acceptance remain manual checks. The broader `verify:desktop-shell` currently has a pre-existing standalone-calculator source assertion failure, also reproduced against `1abbac6`.

## Door labels

The local `codex/door-labels` changes are based on production commit `a4d9731548078064bd9cffb2ec00cffff5cc3af0`. The job editor’s Documents menu opens a [4 × 6 door-label preview](../../components/jobs/DoorLabelDialog.tsx) alongside Work Order printing. Labels require the saved sales order and customer, and use the saved active lines, Door IDs and Product Codes. The preview supports selecting lines, changing copy quantities, overriding the saved Door ID for individual copies in that batch, and reprinting. Label printing does not save or update a Job. [Label rendering](../../lib/jobs/door-label-contract.ts) shares [door-size formatting](../../lib/jobs/door-size-presentation.ts) with Work Orders and uses Code 128 for supported codes.

## Jobs organization

The Jobs route retains its existing Jobs View/Use authorization. The authenticated list RPC supplies the stored salesperson assignment, and the hosted repository follows all existing keyset pages instead of stopping at the first 50 jobs. The salesperson dropdown uses those existing assignment strings and defaults to a case-insensitive match with the signed-in profile display name. Administrators and profiles without a matching assignment start at All Salespeople. This is a display filter, not an authorization boundary. A nonblank search ignores that selection and searches the existing identifier, customer and site fields across the returned authorized jobs.

Both Active jobs and Completed jobs remain expanded. The single private SQL helper `dg_job_production_is_complete` derives grouping from existing Production booking `completed_at` values. Drafts always remain Active. A Confirmed Job needs at least one nondeleted/noncancelled Production item and every such item must be complete. Any unfinished production, reopening or absence of production keeps the job Active. Existing explicit native Job links take precedence, with the existing visible-identifier fallback for legacy bookings. Delivery, Pickup, Notes, and backorder fulfillment do not determine Jobs grouping.

The Jobs list exposes the computed boolean alongside existing salesperson assignments. Each group sorts by numeric-aware Sales Order descending, with jobs lacking a Sales Order last and a stable identifier fallback. Ordinary archive exclusions remain in the RPC. The Job lifecycle remains Draft / Confirmed Job, with no separately stored Complete status.

Existing Calendar activity completion controls, permissions, display, scheduling and capacity calculations retain their behavior. Production completion/reopening and production creation/deletion invalidate the Jobs route so its grouping is refreshed from the existing booking state. Fulfillment completion remains independent.

Migration `20261112152017` adds the private read-only helper and extends the existing authorized Jobs list projection. It does not update records, add lifecycle values, create completion triggers, add a Calendar reader, or alter existing completion RPCs. It must be reviewed and applied before the compatible app release and is prepared locally only.
