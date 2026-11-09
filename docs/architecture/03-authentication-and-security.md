# 03 — Authentication and security

## Calendar View visibility correction — prepared 2026-11-02

Source base: `f9bbaa02019fe6a0bd2853e85423aa75b8934646` on `main`; the current approved shared-Calendar requirements supersede historical descriptions below. This is not hosted-state verification.

The [linked-notes correction](../../supabase/migrations/20261102120000_calendar_view_linked_fulfillment_notes.sql) permits Calendar View/Use under existing business eligibility without unrestricted Jobs access. The [new Calendar-only Staff Away RPC](../../supabase/migrations/20261102130000_calendar_shared_staff_away_read.sql) requires `auth.uid()`, active/setup-complete business eligibility and explicit Calendar View/Use. Production permission or manager status alone does not authorize it. SECURITY DEFINER, empty search path and authenticated-only execution provide a bounded shared-Calendar projection; no table policies/grants are broadened.

The approved product rule supersedes historical location-limited Calendar visibility: all Calendar readers see all company Calendar absences. Original locations remain intact. Write scope, editable roster and capacity rules remain location-specific; UI uses `canEditStaffAwayPeriod` to combine Calendar Use with per-period `inEditScope`. These affordances do not replace existing server mutation checks. The old Production-compatible range RPC and shared `dg_staff_away_scope` are untouched. Hosted state/authorization remains unverified. See [release instructions](../calendar-view-visibility-release.md).

## Coordinated password-security release

See the [operator cutover runbook](../password-security-cutover-runbook.md) for the nine-file SQL order, same-session acknowledgements, old-writer pause, compatible deployment, six-workflow acceptance and fail-closed recovery. Prepared from `8ff5ab2`; owner-supplied hosted structural checks are not runtime verification. No migration or deployment is performed by this documentation.

The three legacy verifier expectations were updated to current behavior: protected Production Board access, shared full Calendar edit fields, and reviewed read-only enrichment. Historical migration hashes and completion-contract checks remain; later migrations are checked for direct completion-RPC redefinition instead of banning every mention of completion. Application behavior is unchanged.

## Legacy-administration cutover restriction

Prepared from `fe6af88`, [20261028120000](../../supabase/migrations/20261028120000_restrict_legacy_user_administration.sql) requires same-session `doorgo.legacy_admin_cutover='approved'`, installed trusted replacement RPCs/business gate, and retirement of the old completion RPC by its separate migration. It revokes all function privileges (EXECUTE/grant authority) on exactly `dg_admin_set_user_active(uuid,boolean)` and `dg_admin_require_password_change(uuid)` from PUBLIC, anon, authenticated and service_role, with RESTRICT. There is no remaining legitimate application caller of either generation-unaware writer. Function bodies/ownership, provisioning, directory, permission editing, trusted replacements and application workflows are unchanged.

Postconditions use `has_function_privilege` for effective execution and `pg_has_role(...,'MEMBER')` to detect executable member roles, including non-inherited membership conservatively. See [PostgreSQL privilege inquiry documentation](https://www.postgresql.org/docs/current/functions-info.html). Unexpected inherited/role-switch authority, missing prerequisites or dependent grants abort the transaction; there is no swallowed exception, CASCADE, automatic shared-role change or partial successful restriction. Resolve such a failure with an explicitly reviewed change to these function grants, not global role membership changes. Owner/superuser authority remains a trusted boundary. A later privileged regrant can reopen access, so verify the postconditions after cutover.

The [ordered sequence](02-database-and-data-ownership.md#final-legacy-administration-restriction-and-pending-sequence) incorporates the owner's hosted findings without claiming this migration has run. The separate acknowledgements for legacy completion and Stage 5A still apply. Do not set acknowledgements as database/role defaults or rely on a previous SQL Editor request retaining a session. Stage the compatible application, drain old requests, execute the reviewed sequence, record history and verify before reopening DoorGo. No new session subsystem or employee status is introduced.

Only the following compatibility questions remain for SQL Editor inspection before activation; do not repeat the confirmed absence inventory or query nonexistent operation tables:

1. Two legacy target signatures' owner/ACL/member-role execution paths and dependent grants. Also confirm no unexpected dependent objects prevent the separate completion DROP RESTRICT. A remaining member-role grant intentionally stops the new migration.
2. Stage 5A's exact 31 targets: one definition each, expected PL/pgSQL body shape, no existing wrapper; its 19 tables: RLS enabled and no pre-existing `dg_business_setup_complete` policy. Inspect effective definitions/grants, not merely names/history. Verify own-profile SELECT remains available and ordinary clients cannot update profile authorization flags.
3. October 15 linked-note prerequisites/effective definition: `dg_calendar_require_use`, native Job archive/notes columns, Calendar linked Job/type/deletion columns. Preserve the company-wide linkage restriction.
4. At least one active, setup-complete `users=use` administrator for acceptance; current prerequisite profile columns/types and expected protected-role identities. Application public/trusted configuration must target the same project (verify privately, not by sharing keys).

The known absence of operation tables removes the earlier dormant-state reconciliation question for this snapshot. Recheck only if new password writers run before cutover. After application/SQL cutover, separately authorized acceptance must test all six workflows, direct legacy-RPC denial and business gating, setup/logout, Calendar access, and native Auth session behavior. Unknown Auth outcomes remain evidence-based recovery cases; SQL rollback cannot undo an external password change. This task provides static verification only, not hosted runtime assurance.

## Connected password workflows (local application cutover)

Prepared from `be2911f`. The application now calls the previously isolated trusted adapters. **This is source wiring, not hosted activation or proof that prerequisite migrations are applied.** The historical Stage 2?4 sections below record preparation milestones; their ?inactive/no callers? descriptions are superseded by this section.

| Workflow | Current application boundary |
| --- | --- |
| Create employee / normal login | Existing [provisioning service](../../lib/admin/users-service.ts) still creates a fresh Auth identity, provisions the profile with mandatory setup and compensates provisioning failure. Normal login/session handling is unchanged. Password state initializes lazily from the profile; no new account states or session tracking. |
| Employee setup | [Setup action](../../app/account/change-password/actions.ts) calls [trusted employee adapter](../../lib/auth/employee-password-server.ts). Verified Auth identity ? current snapshot ? validation/reservation ? Auth update ? trusted atomic finish ? snapshot. A current durable receipt recovers lost completion responses, including when the profile flag is already cleared. No legacy completion RPC or unreserved Auth fallback. |
| Admin reset | [User service](../../lib/admin/users-server.ts) binds reset to [trusted reset adapter](../../lib/admin/password-reset-server.ts): atomic requirement/generation ? exclusive reservation ? Auth reset ? finish. Setup remains required. |
| Require Password Change | [Requirement adapter](../../lib/admin/require-password-change-server.ts) calls only `dg_password_require_change`; it accepts no password and performs no Auth write. |
| Deactivate | [Deactivation adapter](../../lib/admin/deactivation-server.ts) checks current users-use permission, UUID, self-deactivation, directory membership and project identity before trusted `dg_password_deactivate`. No Auth dependency or timeout unlock. |
| Reactivate | [Existing workspace](../../components/manager/UsersAccessWorkspace.tsx) opens its password form for an inactive employee. A separate action invokes [reactivation adapter](../../lib/admin/reactivation-server.ts); the boolean activation path is rejected. Only current-generation confirmed Auth success permits SQL activation with mandatory setup. Ordinary reset cannot activate. |

Validation and existing module gates remain. Unknown/mismatched/stale outcomes return recovery instructions, never ?password changed? or a legacy fallback. A confirmed administrative operation whose directory refresh fails remains successful without returning a fabricated profile; the UI clears stale selection and asks for refresh. This also handles an administrator resetting their own password and losing business access. Form fields are cleared after submission as before.

**Deployment prerequisites remain blocking:** verify effective password foundation/snapshot/atomic/require-change/reactivation functions and service-role grants; coordinate business SQL gates and retirement of legacy completion authority; drain older application writers; assess dormant state touched by legacy flows; arrange evidence-based recovery for unresolved operations. This task neither removes legacy database functions nor connects to Supabase. Missing RPCs fail closed, but availability alone does not prove the correct migration version. Do not deploy this commit independently of that coordinated cutover. Historical authenticated legacy administration RPCs also need an explicit cutover review so direct callers cannot bypass generations. Native Auth session revocation behavior remains unverified; profile eligibility checks remain required.

Verification: [connected actions](../../scripts/verify-password-workflow-actions.mjs), existing employee/reset/reactivation/require-change verifiers and [user-service tests](../../lib/admin/users-service.test.ts). They execute mocked server/Auth boundaries, not live SQL/Auth or browser acceptance.


## Stage 5A: business eligibility prepared for coordinated cutover

Prepared from `aeb0ef9`. [Shared authorization](../../lib/auth/access.ts) now requires active status and completed mandatory setup before returning module access or manager authority. [Manager deletion](../../lib/jobs/manager-job-delete-contract.ts) uses the same manager helper. Raw current-access loading, setup redirect/action and logout remain available. Existing User Administration already checks both flags. These prepared paths supersede the historical missing-setup-gate observations below; this is not a deployment claim.

[20261027120000](../../supabase/migrations/20261027120000_business_access_requirement.sql) guards independent business RPCs and existing scope helpers and adds restrictive SELECT policies without replacing module/location filters. Calendar stays company-wide; linked-note restrictions are unchanged. Password operations, profile/permission self-read and synchronization triggers are excluded.

**Do not deploy this application change or apply this migration before compatible setup is connected.** The migration requires same-session `doorgo.business_access_cutover='approved'`; acknowledgement is not proof of readiness. It neither executes nor replaces legacy-completion retirement. At Stage 5A preparation the adapters were inactive; the connected-workflow section above supersedes that application boundary. SQL retirement remains unapplied by this task. No custom session tracking was added, following the approved native-Supabase-session policy.

Older shared-object grants/RLS remain a verification gap. Tests: [static coverage](../../scripts/verify-business-access.mjs), [access matrix](../../lib/auth/access.test.ts), [manager denial](../../lib/jobs/manager-job-delete-contract.test.ts), [prepared SQL suite](../../scripts/verify-business-access-local.sql). Static checks do not establish runtime SQL authorization.

Verified against `3ac66170223520d06cd0eb451b2b929b55d0b675` on `main`, 2026-10-14. This is a repository-source reference, not a penetration test or hosted-security certification. SQL conclusions assume the local migration chain through `20261009153600` succeeds against its prerequisites. No hosted service, credentials, or applied-migration history was inspected. Start with the [overview](01-application-overview.md), [database reference](02-database-and-data-ownership.md), and [index](README.md).

## Authentication and sessions — source-verified

| Stage | Implemented boundary |
| --- | --- |
| Login | [Login action](../../app/login/actions.ts) validates form input, calls Supabase `signInWithPassword`, verifies the user with `getUser`, and chooses a permission-aware landing page (Calendar first; then authorized Jobs, Production Board, Checkpoints, Documents, Tools, Admin, or Account). The root route uses the same destination selector after the existing protected-access guard; destination deep links are not globally redirected. [Login helper](../../lib/auth/login.ts) handles failure without returning provider error details. |
| Session restoration/refresh | [Root proxy](../../proxy.ts) delegates to [Supabase proxy](../../lib/supabase/proxy.ts): SSR client reads cookies, calls `getClaims`, and propagates refreshed cookies to request/response. This is session refresh, not feature authorization. |
| Server identity | [Current access](../../lib/auth/current-access.ts) calls `getUser`, then reads that user's profile and permissions. Auth failure resolves unauthenticated; profile/permission query failures throw rather than grant fallback access. |
| Protected pages | [Protected-access helper](../../lib/auth/protected-access.ts) redirects unauthenticated users to login and active users requiring password setup to `/account/change-password`. Missing/inactive profiles are returned for page-level denial; the helper alone does not authorize a feature. [Navigation](../../lib/app-shell/navigation.ts) controls visible destinations separately. |
| Logout | [POST route](../../app/auth/logout/route.ts) uses [local logout](../../lib/auth/logout.ts), `signOut({scope:'local'})`, then a 303 redirect. Failure destinations pass the [same-origin local-path validator](../../lib/auth/safe-redirect.ts). It does not promise logout of every device. |
| Password setup/recovery | [Setup action](../../app/account/change-password/actions.ts) updates Auth password, then calls `complete_dg_initial_password_setup`. [Validation](../../lib/auth/password-setup.ts) requires matching 12–256 character passwords. Partial failure is reported because Auth and profile updates are separate operations. Admin temporary-password reset is implemented; no self-service reset-email/token-exchange flow was found in `app`/`lib`. |

Expiration/refresh is delegated to Supabase Auth/SSR; no application-owned session lifetime was established. Hosted JWT lifetime, refresh-token policy, MFA, email delivery and rate limits remain unknown. A restored Auth session is not proof of an active DoorGo profile or feature access.

## Identity, permissions, and scope — source-verified

[Access model](../../lib/auth/access.ts) resolves four states: unauthenticated, missing profile, inactive profile, active. `dg_user_profiles.user_id` refers to Auth identity; [profiles migration][profiles] enables own-row SELECT under RLS. [Permissions migration][permissions] stores per-user feature levels; unknown levels normalize to `none`. Direct profile/permission writes are not the ordinary client path.

The nine keys are `production`, `production_checkpoints`, `calendar`, `jobs`, `documents`, `tools`, `reports`, `settings`, and `users`. `view` and `use` both satisfy read access; only `use` satisfies mutation helpers. These are application feature permissions, not a staff/manager role hierarchy. An active `is_manager` flag is checked separately and does not automatically grant every module. “Admin / Settings” and “User Administration” are permission labels, not additional Auth roles.

[User administration contract](../../lib/admin/users-contract.ts) and [SQL administration][admin] require `users` view for listing, use for changes, active profile, and completed password setup. They do not require `is_manager`. Provisioning creates a non-manager profile; these operations do not expose assignment of manager status. How initial administrators/managers were bootstrapped is not established here. [Service](../../lib/admin/users-service.ts) prevents self-deactivation; permission changes, activation and password requirements use authenticated RPCs.

Permissions are keyed by user/feature, not company. Company/location is a separate profile attribute: [settings scope][staff] and Staff Away scopes use it for capacity configuration, with a `default` fallback. This is not evidence of universal tenant isolation. Jobs, Calendar, user administration and shared legacy reads must be assessed individually; do not infer organization-wide filtering from the presence of `company_location`.

## Clients, credentials, and trust boundaries

| Client | Credentials and responsibility |
| --- | --- |
| [Browser](../../lib/supabase/client.ts) | SSR browser client uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` through [public configuration](../../lib/supabase/public-env.ts). Public configuration is not privileged authorization; session identity and database checks still matter. |
| [Authenticated server](../../lib/supabase/server.ts) | `server-only` cookie-backed SSR client uses the same public configuration and the caller's session. Cookie writes are attempted where allowed; proxy handles refresh. A server action using this client does not become service-role execution. |
| [Trusted client](../../lib/supabase/trusted-read-server.ts) | `server-only`; loads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, disables session persistence/auto-refresh. The name `createTrustedReadOnlySupabaseClient` is descriptive, not an enforced read-only capability. |

Trusted callers include [board queries](../../lib/production-board/queries.ts), [capacity queries](../../lib/production-board/capacity-queries.ts), [checkpoint queries](../../lib/production-flow/checkpoint-queries.ts), [destination preview](../../lib/production-schedule/destination-preview-service.ts), [Calendar search](../../lib/calendar/calendar-item-actions.ts), [recipient directory](../../lib/jobs/work-order-recipient-directory.ts), and [user administration adapter](../../lib/admin/users-server.ts). Some low-level readers rely on their caller's authorization. The admin adapter uses Auth admin writes, including account creation/password changes, after service checks. Never expose these helpers as caller-authorized merely because they run on the server.

Privileged credentials use non-public variables and server-only imports; no credential values are documented. Email adds server-side `RESEND_API_KEY` and `DOORGO_EMAIL_FROM` in the [provider contract](../../lib/jobs/work-order-send-contract.ts). Deployed bundle contents and actual environment configuration were not inspected.

## Workflow enforcement map

UI controls are useful affordances; server actions and SQL must remain independently authoritative. Revision, completed-item, closed-date and acknowledgement checks are business safeguards distinct from feature permission.

| Workflow | Source-verified enforcement / dependencies |
| --- | --- |
| Jobs, imports | [Job service](../../lib/jobs/job-intake-service.ts) checks Jobs read/write capabilities; [hosted adapter](../../lib/jobs/hosted-job-intake-repository.ts) calls authenticated native Job RPCs with SQL access/revision checks. [Import page](../../app/jobs/import/page.tsx) and transfer creation use the Jobs workflow, not a privileged bulk-import bypass. |
| Permanent Job deletion | [Delete contract](../../lib/jobs/manager-job-delete-contract.ts) and [delete RPC][delete-job] require active manager status separately. This is not ordinary Calendar booking deletion. |
| Work Order preview/PDF/email | [Generation](../../lib/jobs/work-order-generation-service-contract.ts), [PDF service](../../lib/jobs/work-order-pdf-service-contract.ts), and [route](../../app/jobs/%5BinternalJobId%5D/work-order/pdf/route.ts) use saved Job read authority, revision matching and preflight. [Send contract](../../lib/jobs/work-order-send-contract.ts) permits Jobs **view or use** to send; it is not restricted to Jobs use or Documents permission. Recipient IDs resolve through the authorized directory; PDF/preflight validation precedes transport. |
| Calendar lifecycle | [Mutation helper](../../lib/calendar/permissions.ts) requires active Calendar use. [Actions](../../lib/calendar/calendar-item-actions.ts) and [Calendar Production actions](../../lib/production-bookings/calendar-production-actions.ts) invoke authenticated RPCs. [Operational migration][operations] provides Calendar-only Production move/reorder/complete/reopen/delete paths without granting planning permission. View remains read-only for these operations. |
| Calendar linked Job fields | [Full edit][edit] authorizes bounded linked Job updates under Calendar use, with Job/item concurrency checks and completed/locked restrictions. This is broader than hiding Open Job for users without Jobs access. Creating/linking an item can have different Jobs checks; do not extrapolate one RPC's permission to every Calendar operation. |
| Production planning/recovery | [Schedule](../../app/production-schedule/page.tsx), [recovery](../../app/production-recovery/page.tsx), and [booking modules](../../lib/production-bookings/) retain separate Production permission paths; [checkpoints](../../lib/production-flow/checkpoint-service.ts) use their own permission. Calendar RPC copies do not rewrite original planning permissions. Recovery here means scheduling recovery, not Auth account recovery or a general database restore facility. |
| Staff Away | [Actions](../../lib/calendar/staff-away-actions.ts), [Away foundation][away], and latest scope in [operational migration][operations] allow Calendar-use absence operations; read scope also supports Production readers. [Maximum RPC][maximum] requires Calendar use and staff/location scope; it delegates to the existing SQL capacity calculation. |
| Settings/admin | [Manager page](../../app/manager/page.tsx) separates settings and users panels. [Capacity settings][staff] and [exceptions][exceptions] use settings view/use and location scope. User administration uses its separate permission and lazy privileged adapter. Auth provisioning has compensating deletion on SQL provisioning failure, not a distributed transaction. |

## SQL/RLS and effective migration boundaries

See the [database reference](02-database-and-data-ownership.md) for table relationships and exact replacement history. `auth.uid()` establishes caller identity in authenticated SQL; `SECURITY DEFINER` changes execution privileges, not caller authorization. Many mutation RPCs explicitly check active profile/permission and pin an empty search path with qualified object names. Verify each function and its grants rather than assuming this pattern covers all objects.

| Objects | Local-chain protections and limits |
| --- | --- |
| Profiles/permissions | RLS enabled; authenticated own-row SELECT, ordinary writes revoked. Admin mutation goes through [admin RPCs][admin]. |
| Native Jobs/lines/commands | [Foundation][jobs] enables RLS and RPC-based access. [Hardening][job-grants] also revokes service-role table/sequence/RPC privileges. RLS bypass alone does not restore revoked SQL grants. |
| Calendar items/events | [Foundation][calendar] enables RLS with active Calendar view/use SELECT; direct ordinary mutations are revoked. Authenticated RPCs perform mutations with explicit access checks. Full-edit events follow [full-edit migration][edit]. |
| Fulfillment portions/membership | [Foundation][families] enables RLS for active Calendar or Jobs readers; [grant hardening][family-grants] restricts authenticated direct access to SELECT. |
| Capacity configuration/absence | [Settings][staff], [Away][away], and [exceptions][exceptions] enable RLS and scoped RPC access. Do not confuse company-scoped configuration with the shared date-keyed daily-capacity table. |
| Legacy/shared objects | Complete creation/RLS/grant history for `dg_jobs`, `dg_production_bookings`, and `dg_calendar_links` is absent. Trusted reads and migration references do not establish their full effective security. |

The [checkpoint validator amendment][checkpoint-hardening] changes owner, security context, search path and execution grants without replacing its body. [Delete-event hardening][delete-hardening] restricts authenticated table access to SELECT. Later Calendar RPCs in [20261006201036][operations] are distinct from older planning functions: `dg_calendar_require_use(true)` still checks Production, while Calendar-only callers use `false` or explicit Calendar checks. Trace `ALTER`/`GRANT`/`REVOKE` and dynamic patches, not only the latest `CREATE FUNCTION`.

Job synchronization triggers execute inside the initiating transaction and can modify Calendar/fulfillment records without a second browser action. Their combined/split history, dynamic function patches and audit exceptions are mapped in [Task 2](02-database-and-data-ownership.md). Changes to SQL access or trigger authority can affect apparently unrelated Job, Calendar and capacity workflows.

## Potential concerns requiring investigation

These are concrete source observations and review questions, **not confirmed hosted vulnerabilities**:

- **Password requirement is not a universal mutation gate.** `getPermissionAccess` checks active state, not `mustChangePassword`; protected-page redirects enforce setup in navigation. Admin service/SQL explicitly checks it, while many other RPCs do not. [Setup completion RPC][password] clears the flag for the active caller without independently verifying an Auth password update occurred. Dedicated direct-RPC/action tests should establish the intended enforcement boundary.
- **Calendar data reach differs from Jobs UI reach.** [Full-edit RPCs][edit] intentionally expose/change selected linked Job data under Calendar use. Security Fix 1 (2026-10-15, based on `d86e55a`) adds a [forward restriction](../../supabase/migrations/20261015120000_restrict_calendar_linked_fulfillment_notes.sql) to the original [notes RPC][notes]: each requested nonarchived Job must have a nondeleted directly linked Delivery/Pickup item. Completed items qualify; Note-only/deleted/indirect portion links do not. Shared Calendar access is not filtered by salesperson or creator. Calendar-use authorization, postgres ownership, SECURITY DEFINER and explicit authenticated execution remain; limited Job search/edit permissions are unchanged. This is source enforcement after migration, not a claim of hosted deployment or successful runtime SQL testing.
- **Trusted reads depend on upstream checks.** Board/capacity/checkpoint helpers and Calendar search use service role. Review every reachable caller, returned field and company filter; do not replace authenticated clients with this helper to bypass a failing permission check.
- **Company isolation is not uniform.** Settings/Away are scoped, feature grants are per-user, and shared legacy/capacity objects have different ownership. User administration's authorization helper has no company predicate. Confirm intended cross-company visibility before introducing filtering or describing the app as tenant-isolated.
- **Separate external operations can partially succeed.** Auth provisioning/reset and email are outside the SQL transaction. Existing compensation/partial-success handling needs targeted failure-path coverage; database audit records are not a universal external-operation log.

**Unverified/unknown:** applied migrations, live grants/default privileges and function owners, pre-existing shared-object RLS, external writers, Auth configuration/session revocation behavior, deployment secret handling, rate limiting, and end-to-end cross-user/organization isolation. Repository inspection cannot certify these. No security fixes or hosted checks were performed.

## Tests and change-impact guidance

Commands are references, not tests run for this documentation task. Confirm scope in [package.json](../../package.json) before execution; mocked/static tests do not prove hosted RLS.

| Area | Existing verification |
| --- | --- |
| Auth/session/password/redirects | `npm run verify:phase-2f-c1-auth-contract`; [auth tests](../../lib/auth/), [public-config tests](../../lib/supabase/public-env.test.ts) |
| Page/navigation permissions | `npm run verify:permission-routing`; [navigation tests](../../lib/app-shell/navigation.test.ts) |
| Privileged administration | `npm run verify:admin-users`; [service tests](../../lib/admin/users-service.test.ts) |
| Calendar versus planning | `node scripts/verify-calendar-operational-permissions.mjs`; `npx.cmd playwright test -c playwright-calendar-permissions.config.ts --workers=1` (component/action shims, not live database enforcement) |
| Job/output authority | `npm run verify:hosted-native-job-adapter`; `npm run verify:manager-native-job-delete`; `npm run verify:native-job-intake-j3b`; `npm run verify:native-job-intake-j3c` |
| SQL checkpoint boundaries | [RPC verifier](../../scripts/verify-phase-2f-c2-checkpoint-rpc-contract.mjs), [read verifier](../../scripts/verify-phase-2f-c4a-checkpoint-read-contract.mjs) |

Shared access changes affect navigation, every protected page, action services and test fixtures. SQL permission changes additionally affect direct RPC clients, trigger side effects and legacy integrations. Client-helper changes can change privilege level across all callers. Consult [authentication contract](../authentication-permissions-contract.md) and [permission/safety guidance](../DOORGO_PERMISSIONS_AND_SAFETY.md), reconciling older wording with current source. Future authorized security verification should test direct calls as well as UI access, including inactive/setup-required users, view-only users, Calendar-only users, and cross-company IDs. Hosted execution and remediation require separate authorization.

[profiles]: ../../supabase/migrations/20260712000000_create_dg_user_profiles.sql
[permissions]: ../../supabase/migrations/20260712010000_create_dg_user_permissions.sql
[password]: ../../supabase/migrations/20260712020000_add_dg_password_setup_requirement.sql
[admin]: ../../supabase/migrations/20260911010000_add_user_administration.sql
[jobs]: ../../supabase/migrations/20260728000000_create_native_job_persistence.sql
[job-grants]: ../../supabase/migrations/20260729000000_harden_native_job_service_role_grants.sql
[delete-job]: ../../supabase/migrations/20260815010000_add_manager_native_job_delete.sql
[calendar]: ../../supabase/migrations/20260821030000_add_operational_calendar_items.sql
[operations]: ../../supabase/migrations/20261006201036_calendar_operational_permissions.sql
[edit]: ../../supabase/migrations/20261007153000_calendar_full_item_edit.sql
[notes]: ../../supabase/migrations/20261007174500_calendar_linked_fulfillment_notes.sql
[maximum]: ../../supabase/migrations/20261009153600_staff_away_capacity_drag_max.sql
[families]: ../../supabase/migrations/20260823000000_add_fulfillment_order_families.sql
[family-grants]: ../../supabase/migrations/20260823010000_harden_fulfillment_order_family_grants.sql
[staff]: ../../supabase/migrations/20260825030000_add_manager_capacity_foundation.sql
[away]: ../../supabase/migrations/20260825040000_add_staff_away_operations.sql
[exceptions]: ../../supabase/migrations/20260825050000_add_capacity_exceptions.sql
[checkpoint-hardening]: ../../supabase/migrations/20260712040000_secure_production_flow_checkpoint_link_validator.sql
[delete-hardening]: ../../supabase/migrations/20260825020000_harden_production_delete_event_grants.sql

## Password operation foundation — Stage 1 (not connected)

The [new SQL foundation](../../supabase/migrations/20261016120000_password_operation_foundation.sql), based on `9efaf06`, is implemented but **not connected to active authentication flows**. It does not close the existing password-setup enforcement gaps. Existing login, setup action, completion RPC, administrative reset service, profile flags and module permission gates remain unchanged. No hosted application is claimed.

The trusted server will eventually attest Auth results through service-role-only transitions. A browser cannot invoke these transitions or write their tables. The database checks operation/user binding and generation, not whether an Auth call actually happened; that attestation remains a privileged server responsibility. The restricted reconciliation reference is an audit pointer, not cryptographic proof. Never put passwords, tokens or provider response bodies in it.

Unknown outcomes retain the write reservation indefinitely. No timestamp authorizes release. A late successful result for an obsolete generation releases the old reservation but cannot clear the newer internal requirement. Admin success leaves employee setup required; failed admin resets retain the pending-reset barrier and require a new reset request. A newer reset can queue while an old write is unresolved, but cannot dispatch until that write settles. Inactive profiles cannot reserve or complete internal setup successfully.

Future integration must: (1) authorize each server caller before privileged operations; (2) reserve before every controlled Auth write and never redispatch on duplicate/lost reservation responses; (3) establish the real profile requirement before admin Auth writes; (4) remove the session-only completion bypass and enforce business-operation gates; (5) atomically finalize the real profile with current-generation success; (6) provide safe status/retry access without exposing attestation authority. Initialize/reconcile dormant state at that cutover rather than assuming it stayed synchronized with old flows.

A lost Auth response or server death before recording success remains unresolved. A successful login, elapsed time or browser assertion cannot establish the missing evidence. Operators must establish that the external write has settled before trusted reconciliation; unsupported automatic recovery remains deferred. Out-of-band Auth/admin writes do not participate in these locks. No undocumented Auth fields, password hashes or Auth triggers are used.

## Employee setup integration — Stage 2, implemented but inactive

Based on `94d875f`, [employee-password-server.ts](../../lib/auth/employee-password-server.ts) is an isolated `server-only` module with **no action, route, component or other production caller** and no `use server` directive. It is not a remotely callable Server Action. No feature flag or new environment setting was added. The existing [change-password action](../../app/account/change-password/actions.ts), logout, recovery, admin reset and permission gates remain unchanged. This describes repository source, not deployed behavior or a closed live vulnerability.

The [orchestrator](../../lib/auth/employee-password-operation.ts) obtains identity from the authenticated client's `auth.getUser()`, then reads the restricted [snapshot RPC](../../supabase/migrations/20261023120000_employee_password_operation_snapshot.sql). Only active, setup-required profiles qualify; manager/module permissions do not bypass this prerequisite. A server-generated operation UUID and current generation are reserved before `auth.updateUser({password})`. Only a successful Auth response for the same user permits trusted `dg_password_finish(...,'succeeded')`. RPC response identity, kind, generation and outcome are checked. No operation IDs, generations, credentials or provider errors are returned in the public result DTO.

| Outcome | Inactive integration behavior |
| --- | --- |
| Explicit Auth password-validation rejection | Known `same_password` / `weak_password` API errors with status 400/422 settle failed; no success attestation. Other errors conservatively remain unknown. See [Supabase error codes](https://supabase.com/docs/guides/auth/debugging/error-codes). |
| Timeout, thrown error, missing response or mismatched Auth user | Best-effort unknown recording; reserved/unknown state remains blocked even if that recording fails. No automatic reconciliation or repeat Auth write. |
| Reservation denial/lost response or concurrent submission | No Auth dispatch; no replacement reservation. Stale generation is reported when confirmed by a fresh snapshot. |
| Finalization response lost after commit | Recover only from the matching current-generation successful receipt; later requests/sessions can recover without password re-entry. |
| Finalization did not commit | At most one retry of the same finalization in the same request, while it still holds successful Auth evidence and the operation remains reserved. Never retry the Auth call. |
| Server dies before durable proof, or status cannot be established | Recovery required. A later login, client assertion, time elapsed or current password knowledge cannot reconstruct proof. |
| Reset invalidates generation | Reject old completion; the foundation may settle stale success as superseded without completing newer setup. |

`operation_complete` means internal operation completion, **not permission to enter business screens**: the real profile flag remains unchanged. Production activation must wait for coordinated resets, atomic real-profile finalization, old completion-RPC removal and required business gates. The new read RPC must be deployed and verified before any future wiring. The adapter deliberately never calls `complete_dg_initial_password_setup`, never uses Auth admin APIs to change the employee password, and lazily creates the existing trusted client only after identity verification. No secrets or Auth results are persisted in browser state or logs.

The adapter also requires the existing public Auth URL and trusted Supabase URL to match before any trusted RPC or password write. This prevents accidentally attesting an Auth response from a different configured project; it adds no new environment variable. URL/configuration failures return unavailable without exposing configuration values.

## Administrative reset integration — Stage 3, implemented but inactive

Based on `dddb746`, [password-reset-server.ts](../../lib/admin/password-reset-server.ts) is server-only, has no `use server` directive and no action/UI callers. It does not replace [users-service.ts](../../lib/admin/users-service.ts) or [users-server.ts](../../lib/admin/users-server.ts), activate employee setup, introduce a flag, or change login/business gates. Existing production reset ordering remains Auth first, then profile requirement. No migration is introduced in Stage 3.

The [inactive orchestrator](../../lib/admin/password-reset-operation.ts) follows this sequence:

1. Use session-derived `getCurrentDoorGoAccess()` (`auth.getUser()` plus profile/permissions), existing `assertUserAdmin(access,true)` and existing temporary-password/UUID validation before privileged operations. User Administration use, active profile and completed setup are required; manager status alone is insufficient.
2. Resolve an active DoorGo target through authenticated `dg_admin_list_users`; require matching public/trusted Supabase project URLs. Generate an internal operation UUID; request a new generation with `dg_password_request_reset` before any Auth write.
3. Call authenticated `dg_admin_require_password_change`, rechecking SQL user-administration permission and setting the real profile requirement. Read the trusted snapshot; require matching target/generation, active profile, both setup requirements, pending reset and no unresolved write. Reserve that exact admin operation through `dg_password_reserve`.
4. Call the existing trusted Auth boundary, `auth.admin.updateUserById(target,{password})`, once. Match the successful response user to the target. Only explicit password-validation rejection (`same_password`/`weak_password`, 400/422) is definitive failure; other errors, missing/mismatched responses and exceptions are unknown.
5. Finalize the same operation/outcome through `dg_password_finish`, with at most one same-request retry using the retained Auth response. Confirm the current snapshot still requires setup. Admin success clears only internal reset-pending, leaving internal setup-required and the real profile requirement true. A newer generation or superseded result cannot report current success.

| Failure/race | Inactive behavior |
| --- | --- |
| Earlier employee/admin write reserved or unknown | New generation/pending reset can be recorded, but no competing Auth dispatch. Return recovery-required; do not poll, time out, unlock or reconcile automatically. |
| Lost request/reservation response | No Auth dispatch; uncertain state remains for review. |
| Profile requirement update fails | Internal pending/reset requirement remains. No Auth dispatch; the real flag may or may not have committed. |
| Definitive Auth rejection | Record failed; preserve reset-pending and setup requirements. A deliberate new reset request can retry; never reuse the old dispatch ID. |
| Unknown Auth outcome or process death before durable attestation | Leave reserved/unknown unresolved. Explicit trusted reconciliation requires evidence; elapsed time and login are not proof. |
| Finalization response lost | Retry only the same attestation in this request, never Auth. Terminal same-outcome finalization is idempotent. After process loss there is no new automatic cross-request admin-receipt recovery API. |
| Competing resets | New requests advance generation; pending older requests are superseded. An older in-flight Auth write may still finish, but cannot settle the newer generation or permit a competing write. |

Passwords only enter Auth's password argument, never operation records, logs, result DTOs or form-derived authority fields. Results contain status only. Snapshot trust remains service-role-wide; the adapter fixes all RPC/Auth targets to the validated employee UUID.

**Not an activation-ready protocol:** profile requirement, internal generation and Auth are separate transactions. Legacy completion/reset paths and out-of-band Auth writes still bypass coordination. The database reserve/settle checks active target state, but cannot atomically encompass deactivation, permission changes or Auth HTTP dispatch. Future activation must coordinate every password-writing path, real-profile completion, direct completion-RPC removal and business gates, and define exceptional recovery. No live security gap is claimed fixed by these inactive modules.

## Atomic state transitions — Stage 4A, integrations remain inactive

The [forward correction](../../supabase/migrations/20261023140000_password_atomic_profile_transitions.sql), verified from `3ef49aa`, supersedes the separate profile writes and internal-only employee completion described in Stages 2–3. Administrative request now atomically advances generation and sets both internal and profile requirements. Employee current-generation trusted success atomically clears both requirements and records the completion timestamp. All other operation restrictions remain; no client receives completion authority.

The inactive admin sequence is authorization/validation → active target lookup → atomic reset request → snapshot → reservation → Auth write → finalization → snapshot. It no longer calls `dg_admin_require_password_change`; there is no late unfenced profile update. Existing `assertUserAdmin` remains the trusted adapter gate; the state-machine RPC still trusts service-role attestation and does not independently authorize the human actor. Actor revocation during a request remains outside the new atomic profile/state guarantee.

The employee sequence remains identity → snapshot/receipt recovery → validation → reservation → Auth → finalization. Receipt recovery now requires both flags false plus a matching current-generation successful employee receipt, so a committed finalization with a lost response can be recognized on a later request. No receipt means a cleared flag alone cannot claim successful setup.

These guarantees cover database state, not external Auth atomicity. A lost Auth outcome or crash after reservation still requires explicit evidence-based recovery. Legacy authenticated completion, active reset/setup actions, direct/provider Auth changes, broad business-operation gating and coordinated deployment remain unresolved and unchanged. Both modules remain server-only with no active callers. See [runtime coverage](06-testing-and-development-guide.md#atomic-transition-verification--stage-4a).

## Stage 4B: legacy completion removal prepared, not activated

[20261023160000](../../supabase/migrations/20261023160000_retire_legacy_password_completion.sql), prepared from 93fb453, removes the legacy session-only RPC after explicit cutover acknowledgement. Dropping without CASCADE avoids leaving unsafe code callable after a future grant mistake. Trusted generation-bound completion is preserved. No production change is claimed.

The sole active application caller found is [changeInitialPasswordAction](../../app/account/change-password/actions.ts), through executeInitialPasswordSetup in [password-setup.ts](../../lib/auth/password-setup.ts). Both remain unchanged. Early SQL application would let Auth update succeed but make profile completion fail. [Logout](../../app/auth/logout/route.ts), identity/profile reads, password validation and trusted retry/reconciliation permissions are unchanged. No self-service recovery feature is added or certified.

Source inspection found two explicit profile-clearing SQL paths before cutover: the legacy RPC and Stage 4A trusted settlement. Ordinary profile UPDATE is revoked in the profile-schema migration. Privileged owner/service-role access remains a trusted boundary. Direct Auth writes do not clear the profile themselves. Business gates that ignore setup status remain a separate, unchanged bypass category.

The [runbook](../../scripts/password-operation-test-runbook.md#stage-4b-cutover-only-legacy-removal) requires approval, direct non-pooled connections, drained old writers, compatible application/recovery readiness, SQL verification and migration-history recording. The acknowledgement alone proves none of those prerequisites. Both new adapters remain inactive. All-writer coordination, unknown-outcome recovery, business gates and permission-revocation races remain activation dependencies.

### Stage 4C-1: inactive Require Password Change

The [server-only adapter](../../lib/admin/require-password-change-server.ts), based on `2c20e83`, accepts only a target UUID. It obtains current access through verified `auth.getUser()`, enforces existing `assertUserAdmin(..., true)`, validates the UUID and active target through authenticated `dg_admin_list_users`, checks project agreement, then lazily creates the trusted client. It calls only [the requirement-only transition](../../supabase/migrations/20261026120000_password_require_change.sql) and returns `{ok:boolean}`. No password, client completion proof, Auth mutation, operation identifiers or credentials are returned or accepted.

Ordinary authenticated/anonymous callers cannot execute the new RPC for themselves or others. SQL trusts service-role authorization; human actor permission checking remains the adapter responsibility, including the existing actor-revocation race limitation. The SQL active-target check protects against target deactivation between lookup and mutation. A pending admin reset rejects the request unchanged. Successful repeated requests each advance generation; a lost response reports failure without automatic retry, though the requirement may already have committed.

No active action/UI imports this module. The active legacy Require Password Change, login/setup/reset flows and business gates are unchanged. Activation still requires all-writer coordination, legacy completion cutover, setup-required business gates, activation/deactivation policy and exceptional recovery. A staged requirement alone does not certify denial of business access. No hosted-state claim is made.

### Stage 4C-2A: inactive reactivation boundary

The [new server-only adapter](../../lib/admin/reactivation-server.ts) and [orchestrator](../../lib/admin/reactivation-operation.ts), based on `cebea05`, reuse existing User Administration permission and temporary-password validation. Verified current access precedes privileged client creation; authenticated user-directory lookup requires an inactive target. Project matching and a fixed validated UUID bind every RPC/Auth call. Sequence: request generation while inactive ? snapshot ? exclusive reservation ? one administrative Auth password write ? trusted finalization ? snapshot. Only confirmed success for the expected user permits success attestation. Missing/mismatched/transport outcomes stay unknown. Same-request finalization retry never repeats Auth; a lost proof still requires recovery. Results contain status only, never credentials or operation authority.

The shared inactive parser now recognizes reactivation records in snapshots; employee/admin orchestration still matches its own kind. Neither new module has active callers. SQL deactivation is trusted-only and not wired to an action; future wiring must enforce existing user-administration/self-deactivation rules. Human actor revocation during a trusted request remains an integration limitation; SQL validates target eligibility/generation, not the human actor's permissions.

**Separate activation blockers:** active legacy administration still has its old toggle/reset behavior; it must be replaced at coordinated cutover. Business actions/RPC/RLS must consistently deny inactive/setup-required accounts while retaining setup/logout/recovery. Existing-session freshness after reactivation is not solved here; no ban, sign-out or revocation integration was added or tested. Advancing a generation invalidates operation authority, not JWTs. Unknown Auth outcomes still need an evidence-based recovery procedure. Deactivation must remain independent of successful external Auth calls. No production behavior or session-revocation claim follows from local tests.
