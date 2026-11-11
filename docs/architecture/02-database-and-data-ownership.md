# 02 — Database and data ownership

## Calendar View visibility correction — prepared 2026-11-02

Source base: `f9bbaa02019fe6a0bd2853e85423aa75b8934646` on `main`; the current approved shared-Calendar requirements supersede historical descriptions below. This is not hosted-state verification.

The [linked-notes migration](../../supabase/migrations/20261102120000_calendar_view_linked_fulfillment_notes.sql) permits Calendar View/Use with business eligibility and preserves the bounded nonarchived Job/direct nondeleted Delivery/Pickup projection. No unrestricted Jobs access or mutation gate changes.

The [Staff Away migration](../../supabase/migrations/20261102130000_calendar_shared_staff_away_read.sql) adds only `load_calendar_staff_away_range(date,date)`. Period visibility is company-wide, independent of viewer location; `company_location` is descriptive, not a tenant boundary. Returned periods preserve employee identity and original location. Occurrences use each period's `company_location` with the existing workday/full-day-impact helpers. The active editor roster and returned `inEditScope` remain caller-location-specific. Existing range RPC, scope helper, write RPCs, RLS, table grants and capacity calculators are unchanged. Both new functions require the installed business-access foundation. Neither migration has been applied by this task. See [release instructions](../calendar-view-visibility-release.md).

## Permanent Google Calendar retirement

Source reviewed at `2e8f0e2`. Google Calendar is permanently discontinued; no Calendar API, OAuth/reconnect flow or Google sync worker was found in this application. Historical Calendar/event IDs, source metadata and records remain for compatibility. Native Job-to-Calendar, fulfillment and Production synchronization remain authoritative internal workflows, not Google integration.

The external Apps Script bridge is not in this repository and has not been disabled or verified stopped. Capacity still contains bridge-baseline dependencies: confirm its writer and preserve capacity supply before external shutdown. Do not delete events, records, shared credentials or historical migrations. See the [retirement guard](../../scripts/verify-google-calendar-retirement.mjs); it checks repository patterns, not hosted jobs or external authorization. This retirement is separate from the password-security cutover.

## Final legacy-administration restriction and pending sequence

Prepared from `fe6af88`. The owner reports the original profile/permission migrations recorded, existing administration and legacy completion installed, and no password-operation tables/functions or business-access helper in hosted Supabase. October 15-27 security migrations are not recorded. These are **owner-supplied hosted findings**, not a connection or independent inspection by this task. At that reported snapshot there is no dormant password-operation state to reconcile.

The new [20261028120000 restriction](../../supabase/migrations/20261028120000_restrict_legacy_user_administration.sql) changes only the ACLs of `dg_admin_set_user_active(uuid,boolean)` and `dg_admin_require_password_change(uuid)`. It retains their definitions/ownership and changes no tables, records, role memberships or other application objects. Provisioning, user-directory and permission-management RPCs remain unchanged. See [security boundary and remaining checks](03-authentication-and-security.md#legacy-administration-cutover-restriction).

Execute only in an approved, drained DoorGo cutover, in this dependency-compatible filename order. Do not replay the original profile/administration migrations or use a blanket database push.

| Order | Migration | Dependency / compatibility |
| --- | --- | --- |
| 1 | [20261015120000](../../supabase/migrations/20261015120000_restrict_calendar_linked_fulfillment_notes.sql) | Existing Calendar use helper, native Jobs and linked Delivery/Pickup columns. Not a password prerequisite, but part of the reported pending security sequence; compare effective definition for a possible unrecorded manual application. |
| 2 | [20261016120000](../../supabase/migrations/20261016120000_password_operation_foundation.sql) | Existing profile schema; reported absence of operation objects matches fresh creation. No historical operations to migrate at the reported snapshot. |
| 3 | [20261023120000](../../supabase/migrations/20261023120000_employee_password_operation_snapshot.sql) | Foundation tables; snapshot includes lazy profile-based initial state. |
| 4 | [20261023140000](../../supabase/migrations/20261023140000_password_atomic_profile_transitions.sql) | Foundation functions; adds atomic profile updates. |
| 5 | [20261023160000](../../supabase/migrations/20261023160000_retire_legacy_password_completion.sql) | Snapshot/atomic completion; separate cutover acknowledgement and DROP RESTRICT. Old setup callers must be drained. |
| 6 | [20261026120000](../../supabase/migrations/20261026120000_password_require_change.sql) | Foundation locking/state and profile requirement. |
| 7 | [20261026160000](../../supabase/migrations/20261026160000_password_reactivation.sql) | Foundation's exact constraint names; replaces reservation/settlement while retaining atomic completion. |
| 8 | [20261027120000](../../supabase/migrations/20261027120000_business_access_requirement.sql) | Its 31 effective function definitions and 19 RLS tables must match the guarded preconditions. Separate cutover acknowledgement. |
| 9 | [20261028120000](../../supabase/migrations/20261028120000_restrict_legacy_user_administration.sql) | Trusted replacement signatures and business helper installed, legacy completion already absent, explicit acknowledgement. ACL denial is checked before commit. |

The four legacy tables (`dg_jobs`, `dg_production_bookings`, `dg_calendar_links`, `dg_daily_capacity`) remain outside Stage 5A's policy additions. Their reported enabled/non-forced RLS with no policies is not permission to add permissive policies. Normal-role access, privileged RPC ownership and service-role reads are separate boundaries. Record migration history accurately after verified execution; a local file or missing history record alone is not effective-definition proof. Each migration has its own transaction: failure does not undo earlier files or any external Auth write. Keep DoorGo closed on failure and recover deliberately; do not restore legacy authority as an application rollback shortcut.

## Password application wiring after Stage 5A

Prepared from `be2911f`: application password/reset/requirement/reactivation callers now use the existing trusted operation RPCs; [deactivation adapter](../../lib/admin/deactivation-server.ts) calls existing `dg_password_deactivate(uuid)`. No SQL definitions, grants or schema changed in this task. See [connected workflow authority](03-authentication-and-security.md#connected-password-workflows-local-application-cutover).

Existing employee provisioning is retained; the snapshot uses profile state when no internal state exists, and reservation initializes that state under the profile-first lock. This does not reconcile an already-existing dormant state that diverged through legacy writers. Effective hosted migration versions, old direct RPC authority and dormant-state reconciliation remain cutover prerequisites. Source wiring must not be deployed before that verification and the coordinated business-access/legacy-completion cutover. No hosted state was inspected or inferred.


## Stage 5A: prepared business authorization gate

Based on `aeb0ef9`, [20261027120000](../../supabase/migrations/20261027120000_business_access_requirement.sql) adds `dg_business_eligible()` and `dg_require_business_access()`: caller `auth.uid()`, active profile and `must_change_password IS FALSE`. Existing module permissions remain authoritative. There is no caller-selected identity or service-role bypass.

The migration wraps 31 explicitly named PL/pgSQL boundaries: Calendar/Settings/Staff Away scopes, native Jobs, independent planning/checkpoint RPCs and manager deletion. It uses `pg_get_functiondef` to retain effective historical dynamic patches, grants and domain logic. Missing/overloaded/unexpected definitions abort the transaction. The outer block checks eligibility before original declarations and exception handlers. Nineteen known business tables gain restrictive authenticated SELECT policies that AND with existing policies. Own profile/permission reads, trusted password functions and internal triggers remain untouched.

**Cutover-only; not applied in Stage 5A.** Requires compatible setup and explicit same-session business-access acknowledgement. Does not execute legacy-completion retirement. Older shared tables without complete local DDL, including `dg_jobs`, `dg_production_bookings`, `dg_calendar_links` and `dg_daily_capacity`, are not reconstructed or claimed protected. See [security](03-authentication-and-security.md#stage-5a-business-eligibility-prepared-for-coordinated-cutover) and [runtime prerequisites](../../scripts/verify-business-access-local.sql).

Verified from repository commit `de4beb90d4cc95a0689874afa29d9d4e240f2771`, on `main`, 2026-10-14. This reference describes the intended effective behavior of the **local migration chain through `20261009153600`**, assuming its prerequisites exist and every migration succeeds. No hosted database, environment secrets, or applied-migration history was inspected. It is not a security certification or a complete generated schema. See [overview](01-application-overview.md) and [index](README.md).

## Tables, relationships, and feature ownership

Names below are in `public` unless qualified. “Owner” means application responsibility, not PostgreSQL object ownership.

| Data group | Relationships and writers | Source |
| --- | --- | --- |
| `dg_native_jobs`, `dg_native_job_lines` | Job UUID → many line UUIDs. Intake owns header/line saves and archive. Calendar full-edit RPCs can also update specific linked Job fields. Lines contain input columns and JSON geometry/specification data; stored derived values are not independent output authority. | [Native foundation][jobs], [glass-source extension][glass], [hosted adapter](../../lib/jobs/hosted-job-intake-repository.ts), [full edit][edit] |
| `dg_native_job_create_commands`, `dg_native_job_reference_seq` | Create-command identity/replay bookkeeping and generated DoorGo references. Not a versioned document store. | [Native foundation][jobs], [transfer extension][transfer] |
| `dg_jobs`, `dg_production_bookings`, `dg_calendar_links` | Legacy/shared objects referenced by reads and mutations; their full creation DDL is not supplied by this migration chain. Production bookings have text booking IDs and an optional native Job UUID link. Calendar and planning RPCs modify operational booking state. | [Board queries](../../lib/production-board/queries.ts), [Job linkage][sync], [manager deletion][delete-job] |
| `dg_calendar_items`, `dg_calendar_item_events`, `dg_calendar_edit_events` | UUID items represent delivery, pickup, and notes; Production remains in bookings. Items have revisions and optional Job/portion links. Events record operations; full-edit events store before/after snapshots. | [Calendar foundation][calendar], [full edit][edit] |
| `dg_fulfillment_order_portions`, `dg_calendar_item_orders` | Portion UUID → required native Job UUID and exact SO. Membership table keys `(item_id, portion_id)` preserve attachment history. `dg_calendar_items.current_portion_id` identifies current ownership. | [Families][families], [one-SO amendment][one-so] |
| `dg_production_status_events`, `dg_production_booking_moves`, `dg_production_booking_completion_events`, `dg_production_booking_delete_events` | Booking-linked operational history, actor/snapshot data and command identifiers. Do not treat completion, movement, and deletion as interchangeable state changes. | [Status events][status], [moves][moves], [completion][completion], [Calendar deletion][delete-calendar] |
| `dg_production_flow_checkpoints` | Checkpoint UUID, series UUID, revision number and supersession links; confirmed/superseded/voided states. Planning/checkpoint workflows own carry corrections, not ordinary Calendar actions. | [Checkpoint schema][checkpoints], [checkpoint RPCs][checkpoint-rpcs] |
| `dg_daily_capacity` | One row per **date**, not per company/date. Board and Calendar consume capacity; native absence/exception layers modify the bridge-derived baseline. | [Capacity schema][capacity], [capacity exceptions][exceptions] |
| `dg_capacity_staff`, `dg_staff_capacity_versions`, `dg_staff_capacity_weekdays`, `dg_company_workweek_versions`, `dg_company_workweek_weekdays` | Staff UUID (optional Auth user link), effective-dated configuration and weekday children. Settings workflows own staff roles/hours/workweek. Staff is not synonymous with a login account. | [Capacity foundation][staff] |
| `dg_staff_away_periods`, `dg_staff_away_events` | Period UUID → staff UUID; date span, full-day/partial mode, revision, deletion and audit data. Calendar use owns ordinary absence operations. | [Away foundation][away], [operational permission amendment][operations] |
| `dg_company_calendar_settings`, `dg_capacity_closures`, `dg_special_days`, `dg_special_day_staff`, `dg_regional_holiday_settings`, `dg_capacity_overrides`, `dg_capacity_exception_events` | Company-scoped exception configuration, dates/staff assignments and audit. Settings actions own configuration; Calendar consumes resolved layers. | [Exceptions][exceptions] |
| `auth.users`, `dg_user_profiles`, `dg_user_permissions` | Auth UUID → profile → `(user_id, permission_key)` access rows. Profile active/company/password-setup state affects operations. User administration owns access changes. | [Profiles][profiles], [permissions][permissions], [admin RPCs][admin], [admin service](../../lib/admin/users-server.ts) |

Customer/contact data belongs to Job headers or operational item fields; this source does not define a separate customer master or product/pricing schema. Work Order/PDF generation reads the current Job aggregate rather than a saved PDF table: [generation service](../../lib/jobs/work-order-generation-service-contract.ts).

## Identifiers and provenance

- `internal_job_id` and `line_id` are native UUIDs. `door_go_reference` is a generated display reference; `biztrack_sales_order` is a business identifier. `visible_identifier` plus its kind selects SO, DoorGo reference, or legacy Job ID according to constraints. Never substitute a display identifier for the UUID in repository calls. See [transfer identity constraints][transfer] and [application identifier rules](../../lib/jobs/unified-job-identifier.ts).
- Imported identity/provenance includes `legacy_job_id`, `legacy_identifier_kind`, source schema/version, timestamps and fingerprint. The identity-immutability trigger protects these. The later update patch preserves a transferred BizTrack SO from `biztrack_sales_order`, **not** `legacy_job_id`: [correction][identifier-patch].
- Booking `job_id` is text: for a linked native booking it can be the Job visible identifier; for Calendar-native unlinked Production it is the entered SO. Explicit `linked_internal_job_id` establishes the native relationship. [Inference correction][link-inference] deliberately skips automatic SO-based linkage when `source = 'DoorGo Calendar'`.
- Calendar-native creation writes `source = 'DoorGo Calendar'`, `source_system = 'doorgo_native'`, and the entered clean name in `title`. Legacy titles may be opaque combined text. [Creation RPC][operations], [normalization](../../lib/production-board/normalize.ts), and [presentation](../../lib/calendar/presentation.ts) must preserve that distinction.
- A fulfillment `portion_id` identifies an exact SO within a Job family; it is not an item ID or a quantity. `family_key` groups numeric SO suffix ranges via `dg_sales_order_family`; application rules live in [order-family.ts](../../lib/calendar/order-family.ts). Primary versus backorder ownership depends on the Job's SO, not merely matching names.

## Effective synchronization history

| Migration | Effective change / surviving behavior |
| --- | --- |
| [20260821010000_add_production_needs_attention.sql][needs-attention] | Introduces `dg_native_jobs_sync_shop_date_to_production` → `sync_native_job_shop_date_to_production`. |
| [20260821030000_add_operational_calendar_items.sql][calendar] | Replaces the early synchronization function and adds mixed operational items/day ordering. These are intermediate definitions. |
| [20260821040000_sync_native_jobs_calendar_obligations.sql][sync] | Drops the early Shop Date trigger. Creates `dg_native_jobs_sync_calendar_obligations` → `sync_native_job_calendar_obligations`, covering Production plus fulfillment. Adds booking native-link inference and reverse `dg_calendar_items_sync_fulfillment_to_job` → `sync_calendar_fulfillment_to_native_job`. |
| [20260821060000_keep_repeated_production_obligation_ids_unique.sql][booking-patch] | Dynamically changes synchronization-created booking IDs from `native-<job UUID>` to `native-<fresh UUID>` so repeated obligations do not collide. |
| [20260824040000_calendar_centric_fulfillment_linking.sql][centric] | Drops/recreates the **same combined trigger name** with only INSERT or updates of `shop_date, shop_hours, customer, biztrack_sales_order, salesperson, visible_identifier`. Adds `dg_native_jobs_sync_fulfillment_obligation` for INSERT or updates of `fulfillment_plan, delivery_date, customer_pickup_date`. |
| [20260825010000_fix_null_fulfillment_sync.sql][null-sync] | Replaces the new fulfillment-only function with an explicit NULL-plan return, preventing cleared plans from falling through to Pickup. |
| [20260902010000_fix_calendar_production_native_link_inference.sql][link-inference] | Replaces link inference to exclude Calendar-created bookings; later Calendar creation code must be read from [20261006201036][operations]. |

**Important:** the `20260824040000` amendment changes the combined trigger's firing columns, not the combined function body. That function still contains fulfillment logic. Therefore an INSERT or a shared identity/Production-field update can still touch fulfillment; a fulfillment-only update follows the dedicated trigger. Do not describe the final design as two completely independent functions. PostgreSQL UPDATE trigger columns follow the statement's target columns, not simply whether a value changed.

Production synchronization finds a current active obligation, updates scheduling/identity/hours, and records moves when the date changes. A new obligation requires Shop Date plus positive hours; clearing an existing date retains Needs Attention placement. Completed/deleted/cancelled obligations are excluded from the current lookup. The reverse fulfillment trigger updates linked Job fulfillment fields/revision for active items and ignores completed/deleted items. Later deletion RPCs handle clearing separately; do not infer deletion behavior from the reverse trigger alone.

Calendar [full edit][edit] obtains a snapshot and locks the linked Job before its item/booking, checks expected Job revision plus item revision or booking timestamp, blocks completed/locked edits, and delegates date movement to existing RPCs. It can update linked Job customer/SO/salesperson/hours or fulfillment notes under its bounded Calendar workflow; general Job editing remains a separate application capability. [Linked notes RPC][notes] supplies Job-owned notes in a batch.

## Fulfillment: history versus current ownership

1. [20260823000000][families] introduced portions and appointment membership. [Grant hardening][family-grants] restricts direct client table access to SELECT under RLS; mutations use RPCs.
2. [20260823020000][family-owner] adds active-ownership validation; [20260824020000][backorders] adds backorder lifecycle/dispositions and revises primary membership/completion.
3. [20260824030000][one-so] establishes **one current operational item per portion** using `current_portion_id` and the partial unique index `dg_calendar_items_one_current_portion_idx` (non-null portion, non-deleted, non-completed). It normalizes existing memberships into separate items, retaining history.
4. `enforce_current_fulfillment_portion` checks item type, SO/family agreement, and primary/backorder linkage. Primary items must link to the portion's native Job; backorder items must not carry that direct Job link. `assign_current_fulfillment_portion` translates membership attachments into current ownership; `retire_deleted_fulfillment_portion_item` retires a deleted portion's active item.
5. [20260824040000][centric] revises exact-item backorder deletion/type changes and automatic backorder creation. [20260825000000][delete-calendar] provides unified active item deletion; a primary deletion clears Job fulfillment state, while backorder handling operates through its portion. [NULL correction][null-sync] prevents synchronization from recreating a cleared obligation.

Dependent code: [fulfillment actions](../../lib/calendar/fulfillment-actions.ts), [Calendar actions](../../lib/calendar/calendar-item-actions.ts), [item mapping](../../lib/calendar/calendar-items.ts), [board loading](../../lib/production-board/queries.ts). Older membership RPCs remain in the chain; their existence does not make multi-SO current appointments the current UI contract.

## Dynamic patches and effective RPC entry points

The two function-body string replacements found are [20260806010000][identifier-patch] (`dg_update_native_job`, transferred SO expression) and [20260821060000][booking-patch] (synchronization booking IDs). They execute changed `pg_get_functiondef` text. The former checks before/after hashes and expression cardinality; the latter requires its original expression. Replay depends on the expected predecessor definition. The [20260805010000 update correction][update] uses a full replacement definition with hash checks; [manager deletion][delete-job] reads function definitions for guards but explicitly redefines its audit functions. Do not mistake every `pg_get_functiondef` occurrence for a dynamic patch. Other dynamic SQL loops assign ownership/grants rather than altering function bodies.

| RPC family | Effective source / application dependency |
| --- | --- |
| `dg_create_native_job`, `dg_create_transferred_native_job`, `dg_update_native_job` | [Glass extension][glass]; update replaced by [allowlist correction][update], then [SO expression patch][identifier-patch]. [Hosted adapter](../../lib/jobs/hosted-job-intake-repository.ts) serializes inputs. |
| `dg_get_native_job`, `dg_archive_native_job`, `dg_list_native_jobs`, `dg_delete_native_job` | Get/archive: [foundation][jobs]; list: [transfer][transfer]; permanent delete: [manager deletion][delete-job]. Same adapter and [Job service](../../lib/jobs/job-intake-service.ts). |
| `calendar_place_production_booking`, `calendar_reschedule_production_booking`, `calendar_reorder_production_day`, `calendar_reorder_production_needs_attention`, `calendar_complete_production_booking`, `calendar_reopen_production_booking`, `delete_calendar_production_booking` | [20261006201036][operations]; [Calendar Production actions](../../lib/production-bookings/calendar-production-actions.ts). Original unprefixed planning RPC permissions are not replaced by Calendar authorization. |
| `create_calendar_item`, `reorder_calendar_items`, `convert_calendar_note` | Latest replacements: [operational permissions][operations]. `move_calendar_item`, `set_calendar_item_completion`: [Calendar foundation][calendar]. `delete_calendar_item`: [unified deletion][delete-calendar]. [Calendar actions](../../lib/calendar/calendar-item-actions.ts). |
| `calendar_item_edit_snapshot`, `save_calendar_item_edit`, `update_calendar_note`, `search_calendar_linkable_jobs` | Latest definitions: [full edit][edit]; [Calendar actions](../../lib/calendar/calendar-item-actions.ts). |
| `add_fulfillment_backorder_auto`, `set_fulfillment_item_type`, `delete_fulfillment_backorder` | [Calendar-centric amendment][centric]; [fulfillment actions](../../lib/calendar/fulfillment-actions.ts). |
| `create/revise/void_production_flow_checkpoint`, checkpoint read RPCs | [Checkpoint RPCs][checkpoint-rpcs], [read RPCs][checkpoint-reads]; [service](../../lib/production-flow/checkpoint-service.ts), [read service](../../lib/production-flow/checkpoint-read-service.ts). |
| `save/delete_staff_away_period`, `load_staff_away_calendar_range` | [Away foundation][away], using latest `dg_staff_away_scope` in [operational permissions][operations]. [Away actions](../../lib/calendar/staff-away-actions.ts). |
| `calendar_staff_away_capacity_drag_max` | [Maximum-read migration][maximum], wrapping the existing SQL impact calculation; no duplicate TypeScript capacity formula. |
| Staff/workweek and exception save/load RPCs; `dg_admin_*` | [Capacity foundation][staff], [exceptions][exceptions], [administration][admin]; [manager modules](../../lib/manager/), [user service](../../lib/admin/users-service.ts). |

## Transactions, revisions, audits, and shared capacity

- Each RPC executes its SQL work and triggered effects in one database transaction. A sequence of application RPCs, Auth admin operations, refresh reads, or email sends is **not** one database transaction. [User provisioning](../../lib/admin/users-server.ts) has compensation behavior for separately created Auth users.
- Job saves lock the aggregate and compare `p_expected_revision`; creation uses command bookkeeping. Calendar items use revisions; Production operations use expected dates/timestamps and eligibility checks. Full edits check linked Job revision as well. Command IDs and advisory locks support collision/replay protection, but behavior differs by RPC: some return prior results, others reject duplicate commands. Do not assume universal idempotency.
- Movement/reordering uses booking/day advisory locks, including the shared `dg_calendar_order:<date or needs_attention>` namespace; reorder calls validate expected order. Full-edit lock order is Job before item. Completion, closed-date acknowledgement and historical protections remain separate checks.
- Audits include move/completion/delete events, Calendar operation/edit events, Staff Away events and capacity exception events. They are not a universal Job revision archive. Production audit immutability has an explicit manager permanent-delete exception in [20260815010000][delete-job]. Calendar booking delete is instead a soft delete with event and linked Shop Date/revision consequences, preserving the Job: [latest delete RPC][operations].
- [Board queries](../../lib/production-board/queries.ts) read shared bookings, legacy Jobs, native enrichment, Calendar items, capacity and checkpoints. [Capacity queries](../../lib/production-board/capacity-queries.ts) read `dg_daily_capacity`; [normalization](../../lib/production-board/normalize.ts) computes displayed flow/carry from that data and checkpoint authority.
- [Capacity schema][capacity] names an `apps-script-bridge` source; its external writer is not defined here. Effective-dated staff/workweek settings feed SQL absence/exception helpers. `dg_daily_capacity_apply_staff_away` runs before capacity INSERT/UPDATE; [exceptions][exceptions] replaces its function to layer closures, special days, overrides and absence while retaining baseline metadata. Do not assume manager configuration alone generates all base capacity rows. Company-scoped configuration versus a date-only capacity key needs explicit multi-company review.

## Access and security boundaries

| Layer | Authority and limits |
| --- | --- |
| Browser | [SSR browser client](../../lib/supabase/client.ts) uses public configuration and user session. UI permission gates are presentation, not database authorization. |
| Server action/service | [Access resolver](../../lib/auth/current-access.ts) reads Auth user/profile/permissions. [Authenticated server client](../../lib/supabase/server.ts) carries the user's cookies/JWT; RPC checks use `auth.uid()`. Server execution alone does not imply elevated access. |
| SQL RPC / RLS | Major mutations are `SECURITY DEFINER` functions with explicit access checks, qualified objects/empty search paths, and grants. Profiles/permissions expose own-row SELECT; Calendar items/events use active Calendar view/use policies; portions/membership allow active Calendar or Jobs readers. Direct mutation privileges are restricted. Native Job tables are RPC-only for ordinary clients; [service-role hardening][job-grants] also revokes their service-role table/function privileges. RLS bypass does not supply revoked SQL privileges. |
| Service role | [Trusted client](../../lib/supabase/trusted-read-server.ts) supplies privileged reads to scheduling and recipient lookup. [Admin adapter](../../lib/admin/users-server.ts) also uses Auth admin writes after service authorization despite the client's “ReadOnly” name. Never use possession of this credential as caller authorization. |

Calendar-use RPCs are distinct from Production planning/Checkpoints authority. The older `dg_calendar_require_use(true)` still checks Production permission; later Calendar-only paths deliberately call it with `false` or perform explicit Calendar checks. Linking a new item to a Job and editing an existing linked item have different checks; inspect the specific RPC rather than generalizing from a screen's capability.

Security amendments also change effective behavior without replacing a function body: [checkpoint validator hardening](../../supabase/migrations/20260712040000_secure_production_flow_checkpoint_link_validator.sql) changes owner, execution context, search path and grants; [delete-event grant hardening](../../supabase/migrations/20260825020000_harden_production_delete_event_grants.sql) limits authenticated table access to SELECT. Include `ALTER`, `GRANT`, and `REVOKE` when tracing an object, not just its last `CREATE`.

Security Fix 1 source update (2026-10-15, based on `d86e55a`): the forward [linked-notes restriction](../../supabase/migrations/20261015120000_restrict_calendar_linked_fulfillment_notes.sql) replaces the original notes RPC. It requires Calendar use and a nonarchived requested Job with at least one nondeleted Delivery/Pickup item directly linked by `linked_internal_job_id`. Completed items still qualify, matching current board loading and edit snapshots. No salesperson/creator filtering applies to the shared company Calendar. Note-only links, deleted items and indirect portion membership do not confer access. The migration is not claimed applied; runtime database authorization remains unverified locally.

Dedicated security investigation remains necessary for effective legacy grants, service-role callers/default privileges and other callable RPC variants. Calendar full-edit RPCs intentionally change selected Job-owned fields without general Jobs editing; the notes correction does not alter that boundary or limited Job search.

## Tests, regression risks, and unknowns

Repository checks to consult (not run for this documentation task):

| Area | Focused reference |
| --- | --- |
| Job payloads/persistence | `npm run verify:hosted-native-job-adapter`; [adapter tests](../../lib/jobs/hosted-job-intake-repository.test.ts); [migration verifier](../../scripts/verify-native-job-hosted-migration-package.mjs) |
| Calendar permissions, planning isolation | `node scripts/verify-calendar-operational-permissions.mjs`; `npx.cmd playwright test -c playwright-calendar-permissions.config.ts --workers=1` |
| Fulfillment/deletion | [family verifier](../../scripts/verify-calendar-fulfillment-families.mjs), [delete verifier](../../scripts/verify-calendar-unified-delete-lifecycle.mjs) |
| Notes and staff maximum | [Notes verifier](../../scripts/verify-calendar-notes-database-contract.mjs), [maximum verifier](../../scripts/verify-staff-away-maximum.mjs) |
| Checkpoints | [RPC verifier](../../scripts/verify-phase-2f-c2-checkpoint-rpc-contract.mjs), [read verifier](../../scripts/verify-phase-2f-c4a-checkpoint-read-contract.mjs) |

Static SQL assertions and mocked RPC/component tests do not prove live RLS, concurrency, or migration application. SQL inspection/rollback scripts also exist under [scripts](../../scripts/); inspect their contents and obtain explicit authorization before any hosted execution.

Highest regression risks are the overlapping Job sync paths, current-portion uniqueness/primary linkage, mixed ordering, SQL permission variants, revision increments triggered by Calendar operations, and capacity baseline layering. Further unresolved points:

- The chain depends on pre-existing `dg_jobs`, `dg_production_bookings`, and `dg_calendar_links`; full baseline schema/RLS and external writers cannot be established from these migrations alone. Do not modify other applications' objects based on this document.
- `dg_delete_native_job` predates later fulfillment and delete-event foreign keys. Its permanent-delete body does not enumerate all later dependent tables; actual behavior for those dependencies requires a focused database test. Do not promise it deletes every modern aggregate successfully.
- Dynamic hash-guarded patches require specific predecessor definitions. Hosted drift, extensions, grants, migration history and data backfills remain unverified.
- The original combined sync function still contains fulfillment work even after the firing-column split. Interaction of simultaneous header/fulfillment edits and triggers requires focused regression coverage, not an assumption of complete separation.
- No claim is made about current test pass status or production readiness. [Chapter 03](03-authentication-and-security.md) documents repository authentication/access boundaries; hosted verification and remediation require separate authorization.

[jobs]: ../../supabase/migrations/20260728000000_create_native_job_persistence.sql
[glass]: ../../supabase/migrations/20260805000000_add_direct_dimension_glass_sources.sql
[transfer]: ../../supabase/migrations/20260730000000_add_legacy_transfer_persistence.sql
[update]: ../../supabase/migrations/20260805010000_fix_direct_dimension_update_rpc_allowlist.sql
[identifier-patch]: ../../supabase/migrations/20260806010000_fix_transferred_biztrack_update_identifier.sql
[job-grants]: ../../supabase/migrations/20260729000000_harden_native_job_service_role_grants.sql
[delete-job]: ../../supabase/migrations/20260815010000_add_manager_native_job_delete.sql
[calendar]: ../../supabase/migrations/20260821030000_add_operational_calendar_items.sql
[sync]: ../../supabase/migrations/20260821040000_sync_native_jobs_calendar_obligations.sql
[needs-attention]: ../../supabase/migrations/20260821010000_add_production_needs_attention.sql
[booking-patch]: ../../supabase/migrations/20260821060000_keep_repeated_production_obligation_ids_unique.sql
[families]: ../../supabase/migrations/20260823000000_add_fulfillment_order_families.sql
[family-grants]: ../../supabase/migrations/20260823010000_harden_fulfillment_order_family_grants.sql
[family-owner]: ../../supabase/migrations/20260823020000_enforce_active_fulfillment_order_ownership.sql
[backorders]: ../../supabase/migrations/20260824020000_backorder_fulfillment_lifecycle.sql
[one-so]: ../../supabase/migrations/20260824030000_one_so_per_fulfillment_item.sql
[centric]: ../../supabase/migrations/20260824040000_calendar_centric_fulfillment_linking.sql
[null-sync]: ../../supabase/migrations/20260825010000_fix_null_fulfillment_sync.sql
[link-inference]: ../../supabase/migrations/20260902010000_fix_calendar_production_native_link_inference.sql
[delete-calendar]: ../../supabase/migrations/20260825000000_unified_active_calendar_item_delete.sql
[operations]: ../../supabase/migrations/20261006201036_calendar_operational_permissions.sql
[edit]: ../../supabase/migrations/20261007153000_calendar_full_item_edit.sql
[notes]: ../../supabase/migrations/20261007174500_calendar_linked_fulfillment_notes.sql
[maximum]: ../../supabase/migrations/20261009153600_staff_away_capacity_drag_max.sql
[capacity]: ../../supabase/migrations/20260710000000_create_dg_daily_capacity.sql
[staff]: ../../supabase/migrations/20260825030000_add_manager_capacity_foundation.sql
[away]: ../../supabase/migrations/20260825040000_add_staff_away_operations.sql
[exceptions]: ../../supabase/migrations/20260825050000_add_capacity_exceptions.sql
[profiles]: ../../supabase/migrations/20260712000000_create_dg_user_profiles.sql
[permissions]: ../../supabase/migrations/20260712010000_create_dg_user_permissions.sql
[admin]: ../../supabase/migrations/20260911010000_add_user_administration.sql
[status]: ../../supabase/migrations/20260711000000_create_dg_production_status_events.sql
[moves]: ../../supabase/migrations/20260714000000_create_production_booking_move_contract.sql
[completion]: ../../supabase/migrations/20260716000000_create_production_booking_completion_contract.sql
[checkpoints]: ../../supabase/migrations/20260711010000_create_dg_production_flow_checkpoints.sql
[checkpoint-rpcs]: ../../supabase/migrations/20260712030000_create_production_flow_checkpoint_rpcs.sql
[checkpoint-reads]: ../../supabase/migrations/20260713000000_create_production_flow_checkpoint_read_rpcs.sql

## Password operation foundation — Stage 1 (not connected)

Source addition based on `9efaf06`: [20261016120000_password_operation_foundation.sql](../../supabase/migrations/20261016120000_password_operation_foundation.sql). This is implemented SQL source, not evidence of migration application. No active authentication flow calls it.

| Object | Ownership / purpose |
| --- | --- |
| `dg_password_setup_state` | Restricted internal state keyed to `dg_user_profiles.user_id`: generation, setup-required flag and pending-reset flag. Lazily initialized from the profile; does not update the profile. |
| `dg_password_operations` | Operation UUID, target user, generation, employee/admin kind, lifecycle, terminal outcome and optional reconciliation reference. No credentials. |
| `dg_password_request_reset` | Advances generation and queues a reset without dispatch permission; supersedes older queued resets, never unresolved writes. Repeated request UUID is idempotent. |
| `dg_password_reserve` | Locks profile then state; reserves one write per user. Employee setup requires no pending reset; admin reservation requires the current pending reset. Duplicate reservation is NOT permission to redispatch. |
| `dg_password_finish`, `dg_password_reconcile` | Record trusted results; unknown outcomes require explicit reconciliation with an evidence reference. Stale successful writes settle as superseded without completing current setup. |
| `dg_password_lock_state`, `dg_password_settle` | Private helpers; no service-role or ordinary-client execution grants. |

Only the four transition entry points grant `service_role` EXECUTE. Both tables enable RLS with no client policies and revoke ordinary/service-role direct table privileges. Functions use explicit postgres ownership and empty search paths. New tables deliberately do not cascade profile deletion. An eventual account-deletion workflow must handle their history explicitly.

Profile/state row locks serialize requests; a partial unique index additionally prevents two reserved/unknown writes per user. SQL transactions do not encompass Auth HTTP calls. Initial state is generation 1; each distinct reset request increments it, even while another write is unresolved. `pending -> reserved -> succeeded/failed/unknown`; unknown requires trusted reconciliation to become terminal. Superseded pending requests were never dispatched; superseded successful writes carry a successful outcome but cannot complete the new generation. Terminal duplicates with the same outcome return unchanged; conflicting outcomes fail.

Integration must synchronize the real profile requirement, reset/provisioning paths and business gates atomically with these transitions. This stage intentionally does **not** do so: internal state may diverge from existing active flows and must not yet be treated as their authority. See [security boundary and recovery limits](03-authentication-and-security.md#password-operation-foundation--stage-1-not-connected) and [tests](06-testing-and-development-guide.md#password-operation-foundation-checks).

### Inactive employee adapter prerequisite — Stage 2

Based on `94d875f`, [20261023120000_employee_password_operation_snapshot.sql](../../supabase/migrations/20261023120000_employee_password_operation_snapshot.sql) adds only `dg_password_employee_snapshot(uuid)`. It is a STABLE, security-definer read with an empty search path, postgres ownership, and EXECUTE granted only to `service_role`. No direct table privileges or existing function definitions change. Apply order, when separately authorized, is after the foundation migration; this new migration has **not been applied or runtime-tested**.

The snapshot returns the target profile's active/setup flag, current internal generation, pending reset, unresolved operation (including older generations), and a successful employee receipt for the current generation. An uninitialized state uses generation 1 and the profile requirement, matching foundation initialization. Generations in the snapshot are text to avoid bigint precision loss. Completed receipts require both succeeded state/outcome and current-generation employee identity; a flag or timestamp is not completion evidence. The [inactive server adapter](../../lib/auth/employee-password-server.ts) binds the target to `auth.getUser()` before privileged lookup; the SQL function itself trusts the restricted service caller, not an ordinary client-supplied UUID.

Stage 2 finalizes the foundation's **internal operation only**. It neither clears `dg_user_profiles.must_change_password` nor uses the old completion RPC. Real-profile completion, synchronized administrative resets, disabling the old bypass, and broad business gates remain prerequisites to activation.

### Inactive administrative adapter — Stage 3

Based on `dddb746`, [administrative reset adapter](../../lib/admin/password-reset-server.ts) reuses existing `dg_password_request_reset`, `dg_password_reserve`, `dg_password_finish`, and `dg_password_employee_snapshot` through the trusted client. Target lookup and setting the actual profile requirement use authenticated `dg_admin_list_users` and `dg_admin_require_password_change`; SQL retains its existing users/use check for that mutation. No SQL definitions or grants change. [Orchestration](../../lib/admin/password-reset-operation.ts) refuses Auth dispatch unless the new generation, active target, profile requirement and internal reset/setup requirements are confirmed and reservation succeeds.

These calls are separate transactions: pending internal state may remain if the profile update fails; no compensating clear or timeout unlock is attempted. The foundation's row locks/unique unresolved-write index prevent competing reservations, not concurrent external writes from legacy callers. Activation/recovery dependencies are documented in [Stage 3 security](03-authentication-and-security.md#administrative-reset-integration--stage-3-implemented-but-inactive). Snapshot runtime validation subsequently passed in the disposable database at `dddb746`; the Stage 2 statement above records its original implementation-time limitation, not current local test status or hosted deployment evidence.

### Atomic profile transitions — Stage 4A (inactive callers)

Based on `3ef49aa`, [20261023140000](../../supabase/migrations/20261023140000_password_atomic_profile_transitions.sql) supersedes the Stage 1–3 profile-update behavior described above. It replaces only `dg_password_request_reset(uuid,uuid)` and private `dg_password_settle(uuid,uuid,text,text)`. Existing `finish`/`reconcile` wrappers call the corrected helper. Profile-first/state-second locking, generation checks, unresolved-write protection, terminal idempotency, ownership and restricted grants remain. New reset requests reject inactive targets; duplicates retain their existing no-side-effect behavior.

- Reset request atomically advances generation, sets internal setup-required/reset-pending, sets the real `must_change_password=true`, and inserts the pending operation. Failure rolls back all writes, including lazy state initialization.
- Trusted successful current-generation employee settlement atomically completes internal setup and clears the real profile requirement, setting `password_changed_at`/`updated_at` to the operation's settlement time. Failed/unknown/superseded results do not clear it. Unknown requires the existing explicit trusted reconciliation before successful settlement. Duplicate terminal settlement returns without rewriting timestamps or clearing a newer reset.
- No existing data is backfilled. No historical migrations, legacy completion grants, RLS policies or business gates change. Auth remains outside SQL transactions. Apply order is foundation, snapshot, then this forward migration; local-only validation is not hosted deployment evidence.

The [inactive employee adapter](../../lib/auth/employee-password-operation.ts) now accepts a valid durable receipt with both requirements cleared; false flags alone are not proof. The [inactive admin adapter](../../lib/admin/password-reset-operation.ts) no longer issues the separate generation-unaware profile update. Its existing server-side user-administration authorization remains; the removed profile RPC's extra mid-sequence SQL authorization check is not replaced by a new actor-aware transition in this stage. Permission-revocation races remain an activation consideration. Neither adapter has active callers.

### Stage 4B: prepared legacy authority cutover

Based on source 93fb453, [20261023160000](../../supabase/migrations/20261023160000_retire_legacy_password_completion.sql) drops public.complete_dg_initial_password_setup() with RESTRICT, removing its body and grants rather than preserving an unsafe privileged alternative. No CASCADE, replacement client RPC, profile write or trusted-function grant change occurs. Stage 4A finish/reconcile paths remain intact. Only the disposable local database has been tested; hosted state is unknown.

The same-session acknowledgement is a migration accident guard, not authorization. The active setup action still needs the old RPC. Follow the [dedicated direct-connection cutover procedure](../../scripts/password-operation-test-runbook.md#future-authorized-cutover-procedure--not-performed); do not include this migration in unattended sweeps. Local DROP success establishes local catalog compatibility only. Hosted dependency checks and migration-history recording require separate approval and verification.

### Stage 4C-1: inactive requirement-only transition

Verified from source `2c20e83` plus this scoped change (2026-10-26). [20261026120000](../../supabase/migrations/20261026120000_password_require_change.sql) adds `dg_password_require_change(uuid) RETURNS bigint`, owned by postgres, SECURITY DEFINER with empty search path, executable only by service_role. It reuses profile-first locking, requires an existing active target, and atomically advances generation and sets both setup requirements. Failure rolls back lazy initialization and all updates. No operation record, reset request or Auth write is created.

Existing reserved/unknown operations are unchanged and continue blocking new writes even across generations; old completion receipts cannot clear the new requirement. An existing `reset_pending` causes rejection without changes, rather than canceling or stranding that reset. Every successful call advances once, including deliberate retries; this operation is not request-idempotent. No automatic retry is performed by the adapter. Existing timestamps recording password completion are not rewritten.

This is an additive inactive capability, not a replacement for `dg_admin_require_password_change`. It depends on the foundation and Stage 4A atomic completion; snapshot/legacy-removal are part of the broader cutover chain, not called by this function. Local ordering places it after the guarded Stage 4B migration: do not run an unattended migration sweep or infer hosted application. Only the isolated disposable database was updated. See [security](03-authentication-and-security.md#stage-4c-1-inactive-require-password-change) and [tests](06-testing-and-development-guide.md#stage-4c-1-requirement-only-tests).

### Stage 4C-2A: internal reactivation, not activated

Source baseline `cebea05`, 2026-10-26. [20261026160000](../../supabase/migrations/20261026160000_password_reactivation.sql) extends only the existing kind/pending constraints to include `reactivation`; no tables, lifecycle states or RLS changes. It adds trusted `dg_password_request_reactivation(uuid,uuid)` and `dg_password_deactivate(uuid)`, and replaces reservation/private settlement with kind-specific eligibility. Ownership/search path and ordinary-role revocations remain explicit; only service_role can request, deactivate or reserve. Finish/reconcile wrappers keep their grants and use the updated private helper.

| Transition | Effective behavior |
| --- | --- |
| Reactivation request | Existing inactive profile only; advances generation and sets both setup requirements/reset-pending while staying inactive. Same user/kind/request UUID returns the existing record without redispatch authority. New requests supersede pending records only. |
| Reservation | Reactivation requires inactive target and its matching current pending record. Employee/admin reset retain active-target eligibility. The unchanged unique index and unresolved check span every kind/generation. |
| Successful settlement | Only current-generation reactivation on a still-inactive target with pending setup atomically activates, keeps both setup requirements and clears reset-pending. Ordinary kinds cannot activate. |
| Failed/unknown | No activation; failed attempt needs a new request, unknown remains reserved for explicit reconciliation. No timeout release. |
| Deactivation | Profile-first lock; every call advances generation, sets inactive and both setup requirements, supersedes pending requests and clears reset-pending. Reserved/unknown rows stay unchanged. Duplicate old completion never reapplies activation. |

Trusted reconciliation uses the same kind/generation checks; a nonempty evidence reference is not independently verified provider proof. Stale successful operations settle superseded. No new automatic recovery exists. No Auth identity, employee history or permissions are deleted. The migration depends on the existing foundation/Stage 4A chain and follows 4C-1; the earlier cutover-only migration still prohibits unattended sweeps. Applied only to the preserved isolated PostgreSQL database, not hosted Supabase.

## Door-label data

On local branch `codex/door-labels` from `a4d9731548078064bd9cffb2ec00cffff5cc3af0`, Door ID and Product Code belong to the native door line. The [job adapter](../../lib/jobs/hosted-job-intake-repository.ts) stores them under `labelDoorId` and `labelProductCode` in `dg_native_job_lines.glass_calc` and separates them from geometry when reading. Intake and line-list edits use the existing Save button. For persisted lines, changed fields use `dg_update_native_door_labels` with an expected value for each changed field. Unchanged fields are omitted. Parent and line locks serialize this operation with ordinary saves. A stale value returns a conflict, and an exact retry succeeds. Clearing removes the corresponding JSON key. Each successful line save becomes the editor baseline before the next line is attempted.

The [pending migration](../../supabase/migrations/20261111020255_save_native_door_labels.sql) adds this authenticated RPC and patches the existing aggregate upsert to preserve the latest stored label keys. It retains active-account, business-eligibility, Jobs use and archived-job checks. Label-only saves update the two JSON keys, preserve other JSON content and all specification columns, and leave parent revisions and scheduling unchanged. New lines carry initial label values through their first aggregate INSERT. Specification changes continue through the ordinary revision-checked job save. The migration must precede the app release and remains unapplied to production. The label preview continues to use saved metadata and batch-local overrides.

For application rollback, retain the database preservation patch so older editor saves and recalculations preserve label metadata. Review compatibility before any later database rollback. Live persistence and physical printer checks remain pending.

### Persistent individual Door IDs (local release candidate)

Source review: `codex/persistent-individual-door-ids`, based on `0dd04b13a2d96839ed6f4c293a5b240f39db91b7`, 2026-11-11. This section supersedes the batch-local override behavior above for this candidate; it does not certify hosted state.

`individualDoorIds` belongs to each native line and is stored as `labelIndividualDoorIds` in `dg_native_job_lines.glass_calc`. The adapter separates it from geometry. Positions identify copies; reducing quantity retains trailing entries and increasing quantity reuses them. Blank entries fall back to the shared Door ID. At most 500 string entries are accepted. This is line metadata, not a global uniqueness registry. Initial values use the new-line INSERT; existing values use the expected/value label RPC.

[Migration 20261111142016](../../supabase/migrations/20261111142016_persist_individual_door_ids.sql) requires the prior label migration, transactionally extends ordinary-save preservation and replaces the same three-argument label RPC. It fails closed on an unexpected aggregate function definition. Existing scalar callers remain compatible. Explicit active profile, business access, Jobs use, job/line ownership and nonarchived-job checks precede updates. Empty search path and authenticated-only grants constrain the security-definer endpoint. Profile, parent and line locks match ordinary-save ordering. Compare-and-set applies to the whole individual-ID array; different copies on the same line can conflict, while different fields can merge. Exact retries are accepted. No parent update, revision increment, geometry calculation or scheduling call is added. Unknown JSON keys survive.

Print Door Labels invokes the existing save pipeline for pending changes and opens only on successful completion; unapplied door-editor changes block it. A failed later step can leave earlier line-label saves committed; baselines retain those successes for retry. The dialog reads the returned saved aggregate; preview and print perform no writes. Application rollback must retain both database preservation patches to protect IDs from older clients. No backfill or customer-row rewrite is required. Hosted preflight must inspect effective function definitions and grants before applying this migration.