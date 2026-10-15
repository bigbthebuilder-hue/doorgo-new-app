# 05 — Calendar and production workflows

Verified against `32c79b1f385af7a1063f96e6e655ee772c9398af` on `main`, 2026-10-15. This reference describes source behavior and the effective local migration chain through `20261009153600`, assuming its prerequisites and successful application. No hosted state or test pass status was verified. Reuse the [overview](01-application-overview.md), [database ownership](02-database-and-data-ownership.md), [security](03-authentication-and-security.md), and [geometry](04-door-geometry-and-configuration.md) references for their respective boundaries.

## Shared read model and data owners

[Calendar page](../../app/calendar/page.tsx), [Production Board](../../app/production-board/page.tsx), and [Production Schedule](../../app/production-schedule/page.tsx) share [board queries](../../lib/production-board/queries.ts) and [normalization](../../lib/production-board/normalize.ts). Calendar requests additional layers; it is not a second independent production database. [CalendarWorkspace](../../components/CalendarWorkspace.tsx) owns interaction state, while server actions/RPCs own persisted mutations.

| Layer | Authoritative records / relationships |
| --- | --- |
| Production | `dg_production_bookings`: booking identity, date, ordering, hours, lifecycle timestamps and source metadata. Legacy `dg_jobs` and optional native Job enrichment supply linked identity. Calendar-only bookings can exist without a Job. |
| Delivery / customer pickup / Note | `dg_calendar_items`: UUID, revision, date, details and optional native Job/current-portion links. [Item mapping](../../lib/calendar/calendar-items.ts) merges these into Calendar cards without making them production workload. |
| Fulfillment | `dg_fulfillment_order_portions` plus `dg_calendar_item_orders` retain order-family/portion identity and appointment membership history. `current_portion_id` identifies the current operational appointment. [Family model](../../lib/calendar/order-family.ts) and [actions](../../lib/calendar/fulfillment-actions.ts) are separate from production booking identity. |
| Staff Away | `dg_staff_away_periods` and events; references the manager capacity roster, not an arbitrary free-text employee. [Away mapping](../../lib/calendar/staff-away.ts) displays date-range occurrences of the period. |
| Closures/special days | Capacity exception records, holiday rules and overrides; [Calendar mapping](../../lib/calendar/capacity-exceptions.ts) displays configuration-derived layers. These are not ordinary production bookings. |
| Production capacity | `dg_daily_capacity` supplies date-level hours and provenance. Effective-dated staff/workweek configuration and absence/exception SQL modify capacity layers. |
| Actual carry | Confirmed `dg_production_flow_checkpoints` establish opening-carry authority; they do not mark individual bookings Complete. |

Booking ID, native Job UUID, visible Job identifier, Sales Order and portion UUID are not interchangeable. Production layers group by normalized salesperson in [presentation](../../lib/calendar/presentation.ts); family grouping is a separate Sales Order concept. Structured Production identity uses hours/customer/SO; opaque legacy titles remain opaque when structured identity is unavailable. Source/provenance matters for Calendar-native names. Never recover identifiers by stripping numbers from a display title.

## Entry, movement and lifecycle

**Source-confirmed user paths:**

1. **Save and schedule a Job.** Intake saves Job header/lines through [Job service](../../lib/jobs/job-intake-service.ts). Estimated/manual shop hours and Shop Date feed SQL synchronization. A new Production obligation requires Shop Date and positive hours; merely saving a Draft/Confirmed Job is not sufficient to guarantee a booking. Existing obligations can move to Needs Attention when their date is cleared.
2. **Create directly in Calendar.** [Calendar actions](../../lib/calendar/calendar-item-actions.ts) create standalone or Job-linked Production, fulfillment and Notes. Linked creation may update/use Job-owned scheduling fields and has additional Jobs checks; it is not identical to standalone creation. Supported Note conversion routes delegate to operational RPCs rather than changing a card label locally.
3. **Move or edit.** Calendar drag, same-day ordering, Needs Attention placement and Edit use Calendar-authorized actions. [Full-edit RPCs][edit] lock/check the linked Job and booking/item, update bounded Job fields where linked, and delegate movement to existing operations. Completed/locked entries require the applicable lifecycle resolution first.
4. **Complete/Reopen.** [Calendar Production actions](../../lib/production-bookings/calendar-production-actions.ts) use separate completion/reopen RPCs; reopening supplies a Calendar reason. [Planning completion service](../../lib/production-bookings/production-booking-completion-service.ts) retains its separate permission path. Completion is recorded independently from Job lifecycle, fulfillment completion, and carry checkpoints.
5. **Delete active entries.** [Operational deletion][operations] soft-deletes the booking, records an event and handles linked Shop Date/revision consequences while preserving the Job. [Unified item deletion][delete] handles fulfillment/Note deletion and portion-specific cleanup. Permanent Job deletion is a different manager operation. `cancelled_at` also excludes bookings from reads, but this reference does not infer a separate user-facing Cancel workflow from that column.

Board queries select nondeleted, noncancelled, active, confirmed, visible bookings. Dated entries populate days; undated Production populates Needs Attention. They do **not** filter out `completed_at`, so Complete is not synonymous with disappearance from the board. Normalization sums scheduled card hours for planned starts; marking a booking complete is not a subtraction from its historical scheduled workload. Do not invent manufacturing stages beyond these implemented states.

## Synchronization: exact effective boundaries

The full chain and identifiers are documented in [Task 2](02-database-and-data-ownership.md). These details are especially important for workflow changes:

| Migration | Effect |
| --- | --- |
| [20260821010000][early] | Initial native Shop Date synchronization. |
| [20260821040000][sync] | Replaces the early trigger with `dg_native_jobs_sync_calendar_obligations` → `sync_native_job_calendar_obligations`, handling Production **and fulfillment**. Adds reverse Calendar fulfillment-to-Job synchronization. |
| [20260821060000][ids] | Dynamically patches synchronization-created booking IDs to use fresh UUIDs, allowing repeated obligations for one Job. Do not assume one lifetime booking ID per Job. |
| [20260824040000][split] | Recreates the combined trigger for INSERT or updates targeting `shop_date, shop_hours, customer, biztrack_sales_order, salesperson, visible_identifier`. Adds `dg_native_jobs_sync_fulfillment_obligation` for INSERT or updates targeting fulfillment plan/dates. |
| [20260825010000][null] | Replaces the dedicated fulfillment function so a NULL plan returns instead of falling through to Pickup. |

**The older combined function still contains fulfillment logic.** The split changed its trigger's firing columns, not its body. INSERT/shared-header/Production-field updates can still affect fulfillment; fulfillment-only edits use the dedicated path. SQL UPDATE trigger firing depends on targeted columns, not only changed values. Do not model these as completely independent systems.

Reverse active fulfillment synchronization updates Job fields/revision; completed/deleted items are excluded from that path. Delete RPCs handle clearing separately. Native-link inference was revised in [20260902010000][inference] to exclude Calendar-created bookings from implicit SO linkage. UI enrichment through [native-job-links](../../lib/production-board/native-job-links.ts) is not authority to relink a database record.

[One-current-item migration][portion] uses a partial unique index on `current_portion_id` for nondeleted/noncompleted items. Primary portions require the native Job link; backorder items must not carry that direct link. Old membership history remains; it is not evidence that the current UI supports one combined appointment for multiple Sales Orders. Later [Calendar-centric RPCs][split] perform type changes/backorder creation/deletion against the specific item/portion.

## Capacity, staff and availability

[Capacity normalization](../../lib/production-board/capacity-normalize.ts) converts stored values; it does not reconstruct the workforce baseline. [Capacity foundation][capacity] identifies an `apps-script-bridge` source whose full external writer is not in this repository. Do not assume manager settings generate every baseline row.

[Manager configuration](../../lib/manager/capacity-configuration.ts) and [SQL foundation][staff] own effective-dated staff roles/weekday hours and company workweeks. [Staff Away SQL][away] resolves full-day impact from the applicable staff capacity version (`productive_hours` or `away_impact_hours`), checks working dates/overlap, and recalculates affected existing capacity rows. Full Day can span multiple dates; Partial is limited to one normal working date and bounded capacity drag. [Maximum-read RPC][maximum] calls the same `dg_staff_away_full_day_impact`; [actions](../../lib/calendar/staff-away-actions.ts) do not duplicate that formula in TypeScript.

[Capacity exceptions][exceptions] add holidays, closures, special working days and overrides, and replace the capacity-row layering function. Its incoming-row precedence is explicit override, closure, special-day capacity, then baseline minus Away (clamped at zero); unknown baseline remains unknown. Baseline metadata and recalculation flags prevent repeated subtraction. A special-day or override path is not simply “normal capacity minus every absence.” Follow the effective SQL when changing these interactions.

[Board flow](../../lib/production-board/normalize.ts) distinguishes:

- **Day workload:** scheduled known shop hours versus available hours; missing hours/capacity prevent a complete comparison.
- **Carry flow:** authoritative opening carry plus planned starts, less capacity; ending carry/open capacity are clamped at zero. Confirmed checkpoints override calculated opening carry and restore authority after unresolved upstream data.
- **Closed/unknown dates:** closures and implicit weekends without capacity supply zero flow capacity; missing weekday capacity is not automatically zero. [Date utilities](../../lib/production-board/date-utils.ts) and [baseline constants](../../lib/production-board/flow-constants.ts) define date-only/Vancouver and historical baseline behavior.

Overload presentation and [destination preview](../../lib/production-schedule/destination-preview-service.ts) help users assess moves; they are not evidence of an automatic scheduling optimizer or a universal hard capacity limit. Closed-date acknowledgement, stale-state checks and eligibility are separate from the capacity comparison. UI previews must not replace RPC validation.

## Recovery and reconciliation

[Production Recovery](../../app/production-recovery/page.tsx) uses [recovery contract](../../lib/production-bookings/production-recovery-page-contract.ts) and booking services. Default search covers the previous five weekdays; explicit search is bounded to 93 days and 100 results. This weekday search is not the staff holiday calendar. Whole-job movement requires the “not started” acknowledgement. Partly completed work is instructed to remain on its original date with remaining hours entered as Actual carry.

[Checkpoint service](../../lib/production-flow/checkpoint-service.ts) creates/revises/voids carry checkpoints; [checkpoint window](../../lib/production-flow/checkpoint-window.ts) anchors reads. Recovery is a controlled operational workflow, not an automatic database repair system. Stale booking/Job/item responses require refresh/reopen rather than replaying old local state. Calendar has its own past-to-past move handling and reopen reason in its action adapter; do not assume Recovery and Calendar expose identical prompts.

## RPC, transaction and permission map

| Operations | Effective source / caller |
| --- | --- |
| Calendar Production place/reschedule/reorder/complete/reopen/delete | [20261006201036][operations]; [Calendar Production actions](../../lib/production-bookings/calendar-production-actions.ts). `calendar_*` paths preserve original planning RPC separation. |
| Calendar create/move/completion/order/Note conversion | [Foundation][calendar] plus later [operational replacements][operations]; [Calendar actions](../../lib/calendar/calendar-item-actions.ts). |
| Snapshot/full edit/Note update/Job search | [20261007153000][edit]; same action module. |
| Fulfillment/backorders | [Calendar-centric replacements][split] and [unified delete][delete]; [fulfillment actions](../../lib/calendar/fulfillment-actions.ts). |
| Away save/delete/load/maximum | [Away][away], scope replacement in [operations][operations], [maximum][maximum]; [Away actions](../../lib/calendar/staff-away-actions.ts). |
| Settings/exceptions/checkpoints | [Settings][staff], [exceptions][exceptions], [checkpoint RPCs][checkpoints]; [manager actions](../../lib/manager/capacity-actions.ts), [checkpoint service](../../lib/production-flow/checkpoint-service.ts). |

Each RPC and its triggers run in one SQL transaction. Subsequent refresh reads and separate action RPCs are not one transaction. Expected Job/item revisions, booking dates/timestamps, row locks and advisory booking/day ordering locks protect concurrent operations. Full edit locks Job before item. Command IDs support replay/duplicate handling, but RPCs differ between returning an existing result and rejecting duplicates. Portion uniqueness is a database constraint, not just an optimistic UI check.

Movement/completion/deletion, item edits, Away and exceptions have event records; these are not a universal Job snapshot archive. Completed/closed-date protections remain independent of permissions. Review the [database reference](02-database-and-data-ownership.md) before changing lock order, audit deletion or synchronization.

Calendar view is read-only; active Calendar use authorizes ordinary Calendar lifecycle and Away operations without Production Board/Checkpoints use. Planning and checkpoints remain separate capabilities. Settings and user administration also have distinct permissions, not a universal employee/manager hierarchy. Linked Calendar editing can modify selected Job-owned fields under Calendar authority; new linkage has different checks. [Security reference](03-authentication-and-security.md) details this boundary and the linked-notes concern.

UI gates do not authorize RPCs. Server actions resolve access; authenticated SQL checks `auth.uid()`, profile/permission and operation conditions. Important mutations use SECURITY DEFINER with explicit grants/checks, while direct item writes are restricted by grants/RLS. Shared board reads use a trusted server client and rely on authorized callers. Full baseline RLS for legacy/shared tables is unavailable locally; no hosted policy conclusion follows from a successful UI read.

## Regression risks and verification

Highest risks: conflating booking/Job/SO identity; resurrecting completed obligations; violating current-portion ownership; changing shared-trigger firing or Job revision increments; treating completion as carry; double-deducting Away; mixing company configuration with date-only capacity; and weakening stale/closed-date checks in a new interaction path. [Calendar activity state](../../components/calendar/CalendarActivity.tsx) and refresh behavior also affect whether users can safely retry operations.

Commands below are references, not tests executed for this documentation. Verify scope in [package.json](../../package.json).

| Concern | Existing focused checks |
| --- | --- |
| Calendar identity/interaction | `npm run verify:calendar-interaction-presentation`; [presentation tests](../../lib/calendar/presentation.test.ts) |
| Calendar permissions | `node scripts/verify-calendar-operational-permissions.mjs`; `npx.cmd playwright test -c playwright-calendar-permissions.config.ts --workers=1` |
| Ordering/Needs Attention/fulfillment/delete | `npm run verify:calendar-production-order`; `npm run verify:calendar-needs-attention`; `npm run verify:calendar-fulfillment-families`; `npm run verify:calendar-unified-delete-lifecycle` |
| Capacity/flow | `npm run verify:capacity-contract`; `npm run verify:production-board-capacity`; [checkpoint tests](../../lib/production-flow/checkpoint-service.test.ts) |
| Away/exceptions | [Away tests](../../lib/calendar/staff-away.test.ts), [exception tests](../../lib/manager/capacity-exceptions.test.ts), [maximum verifier](../../scripts/verify-staff-away-maximum.mjs) |
| Scheduling/recovery | [reschedule tests](../../lib/production-bookings/production-booking-reschedule-contract.test.ts), [completion tests](../../lib/production-bookings/production-booking-completion-contract.test.ts), [recovery tests](../../lib/production-bookings/production-recovery-page-contract.test.ts) |

**Potential concerns:** the capacity incoming-row trigger chooses a location from the earliest active profile, while daily capacity is date-keyed; multi-company semantics need explicit review. Overlapping combined/dedicated synchronization and legacy external writes need concurrency/regression testing. Recovery, Calendar and planning intentionally differ in authorization/prompts, so sharing UI code can unintentionally broaden authority.

**Unverified/unknown:** hosted migrations/grants, live external synchronization, baseline capacity generation, full legacy schema, production data consistency, and current test health. Static SQL checks and mocked component tests do not prove concurrent hosted transactions, trigger interaction or RLS. No exhaustive coverage audit was performed; priority evidence gaps are concurrent Job/Calendar edits, repeated obligation cycles, backorder deletion/history, multi-company capacity, and holidays/Away/override combinations. These are verification targets, not confirmed bugs.

[early]: ../../supabase/migrations/20260821010000_add_production_needs_attention.sql
[sync]: ../../supabase/migrations/20260821040000_sync_native_jobs_calendar_obligations.sql
[ids]: ../../supabase/migrations/20260821060000_keep_repeated_production_obligation_ids_unique.sql
[split]: ../../supabase/migrations/20260824040000_calendar_centric_fulfillment_linking.sql
[null]: ../../supabase/migrations/20260825010000_fix_null_fulfillment_sync.sql
[inference]: ../../supabase/migrations/20260902010000_fix_calendar_production_native_link_inference.sql
[portion]: ../../supabase/migrations/20260824030000_one_so_per_fulfillment_item.sql
[calendar]: ../../supabase/migrations/20260821030000_add_operational_calendar_items.sql
[operations]: ../../supabase/migrations/20261006201036_calendar_operational_permissions.sql
[edit]: ../../supabase/migrations/20261007153000_calendar_full_item_edit.sql
[delete]: ../../supabase/migrations/20260825000000_unified_active_calendar_item_delete.sql
[capacity]: ../../supabase/migrations/20260710000000_create_dg_daily_capacity.sql
[staff]: ../../supabase/migrations/20260825030000_add_manager_capacity_foundation.sql
[away]: ../../supabase/migrations/20260825040000_add_staff_away_operations.sql
[exceptions]: ../../supabase/migrations/20260825050000_add_capacity_exceptions.sql
[maximum]: ../../supabase/migrations/20261009153600_staff_away_capacity_drag_max.sql
[checkpoints]: ../../supabase/migrations/20260712030000_create_production_flow_checkpoint_rpcs.sql
