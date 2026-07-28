# Hosted Native Job Persistence Contract

## Status and boundary

This document is the authoritative design contract for hosted native-job persistence. It does not authorize or contain a migration. No native job may be stored in `dg_jobs` or `dg_job_lines`; those tables remain legacy Google Sheets mirrors. No native save or transfer may write production bookings, capacity, Calendar, fulfillment execution, documents, email, or the legacy system.

The independent native objects are:

- `dg_native_jobs`
- `dg_native_job_lines`
- `dg_native_job_create_commands`
- `dg_native_job_reference_seq`
- `dg_create_native_job`
- `dg_update_native_job`
- `dg_archive_native_job`
- `dg_get_native_job`
- `dg_list_native_jobs`

The reviewed live catalog found no collision with any planned name. Both `pgcrypto` and `uuid-ossp` are installed in `extensions`; the implementation must use one schema-qualified UUID generator consistently.

## Identity and collision contract

### Authoritative identifiers

`internal_job_id` is the immutable database UUID and is never the visible job identifier.

The authoritative visible identifier is stored explicitly as `visible_identifier` plus `visible_identifier_kind`. At least one of `biztrack_sales_order` or `door_go_reference` must exist, and the selected visible value must equal its corresponding field after normalization. All identifier values are normalized with `btrim`; blanks are stored as null. Comparisons and uniqueness use `lower(btrim(value))`. No identifier may be silently rewritten.

For `origin = 'native'`, `legacy_job_id` and `legacy_identifier_kind` must be null. Inspection of the accepted domain confirms that `NativeJobHeader.doorGoReference` is currently required and every brand-new native create allocates it even when a Sales Order is present; `visibleJobIdentifier` gives the Sales Order precedence. Preserve that rule: every brand-new native job receives a permanent `DG-######` reference, a supplied Sales Order is authoritative and visible, and the DG reference remains its stable secondary identity. Without a Sales Order, the DG reference is authoritative and visible. A later explicit Sales Order save may change a native job's visible value/kind under the existing native precedence rule.

For `origin = 'legacy_transfer'`:

- `legacy_job_id` is required, immutable and globally unique after normalized comparison;
- `legacy_identifier_kind` is required and is either `biztrack_sales_order` or `door_go_reference`;
- `visible_identifier` and `visible_identifier_kind` must equal the immutable legacy ID and kind;
- if the kind is `biztrack_sales_order`, `biztrack_sales_order` must equal `legacy_job_id` after normalization and no replacement DoorGo reference is generated;
- if the kind is `door_go_reference`, `door_go_reference` must equal `legacy_job_id` after normalization;
- a separate Sales Order may be supplied only by explicit user review and does not replace a transferred legacy DG reference as the visible identifier;
- the create RPC rejects the transfer if its normalized Sales Order, DoorGo reference or legacy job ID already exists natively.

### Legacy generator inspection

The deployed legacy source uses `nextJobId_(sheet)`, reached through `DGData.jobs.nextId(jobsSheet)` in `Code.gs`. If the legacy Job ID input is blank, `saveJobToSheets_` calls that generator. It scans column 1 of the Sheets `Jobs` tab, matches `JOB-(\d+)` case-insensitively, chooses the maximum numeric suffix plus one, and formats `JOB-` plus at least four zero-padded digits. The UI labels the field `Sales Order / Job ID`, permits manual input, and describes blank input as auto-generated.

The generator is a read-max-then-write sequence with no script lock, database sequence or uniqueness transaction around allocation. Two concurrent legacy saves can select the same next value. It reads only the Google Sheet and cannot see native Supabase rows.

At the read-only inspection checkpoint, the legacy mirror held 43 identifiers: eight matched the automatic `JOB-` format, with an observed numeric range from 56 through 65; one matched `DG-` with numeric suffix 2; and 29 were numeric identifiers. These aggregate observations expose no individual customer data and are not a durable allocation boundary because the mirror may lag Sheets.

The no-replacement rule for a transferred Sales-Order job is an approved exception to the current in-memory `doorGoReference: string` shape. Hosted implementation must evolve the adapter/domain identity shape to permit a null secondary DoorGo reference for that transferred case; it must not manufacture a reference merely to satisfy the old local-only type.

### Permanent native DG allocation

Brand-new native jobs use the permanent new-DoorGo namespace:

`DG-000001`, `DG-000002`, ...

`dg_native_job_reference_seq` supplies the numeric suffix and the create RPC formats it as `DG-` plus exactly six zero-padded digits. Sequence gaps after rolled-back or occupied candidates are accepted; references are unique identities, not gapless business counts.

From this contract checkpoint forward, the new DoorGo exclusively owns allocation of new `DG-` references. Legacy DoorGo continues using Sales Order identifiers and its automatic `JOB-####` generator; it must not allocate a new `DG-` reference. Existing legacy `DG-` values remain valid and are preserved unchanged during transfer.

Before native creation is enabled, sequence initialization must inspect numeric suffixes matching the complete `DG-######` format in both `dg_jobs.job_id` and any reviewed native seed/test rows in `dg_native_jobs`. It sets the sequence so its first allocation is strictly above the highest discovered suffix. Ignored local fixtures, including local acceptance jobs, are not hosted seed rows and do not affect the hosted sequence unless separately reviewed and deliberately inserted under a future authorization.

Allocation remains collision-safe after initialization. While holding the create transaction's allocation path, the RPC repeatedly obtains `nextval('public.dg_native_job_reference_seq')`, formats one `DG-######` candidate, and checks normalized equality against both `dg_native_jobs.door_go_reference` and `dg_jobs.job_id`. An occupied candidate is skipped permanently and allocation advances until an unused candidate is found. The native unique index is the final concurrency constraint. A unique-violation race is handled inside the reviewed allocation loop with a new sequence candidate; it never overwrites, renumbers or adopts the occupied identifier.

Transferred jobs do not consume the sequence merely to replace an identity. An existing Sales Order remains unchanged; an existing legacy DG reference remains unchanged. Native uniqueness checks reject a transfer when its normalized Sales Order or DG reference already exists in `dg_native_jobs`. An expected source identifier in `dg_jobs` is not a transfer collision.

## Table contract

All tables are in `public`. Timestamps are `timestamptz`. UUID defaults use `extensions.gen_random_uuid()` unless the migration preflight selects another reviewed, schema-qualified generator.

### `dg_native_jobs`

| Column | Type | Null/default | Contract |
|---|---|---|---|
| `internal_job_id` | `uuid` | PK, default UUID | Immutable database identity. |
| `biztrack_sales_order` | `text` | null | Trimmed; blank becomes null. |
| `door_go_reference` | `text` | null | Trimmed; every brand-new native job receives permanent `DG-######`; transferred Sales-Order jobs may remain null. |
| `visible_identifier` | `text` | not null | Exact authoritative visible value; immutable for transfers. |
| `visible_identifier_kind` | `text` | not null | Check: `biztrack_sales_order`, `door_go_reference`; must identify the matching value column. |
| `origin` | `text` | not null | Check: `native`, `legacy_transfer`. Immutable. |
| `legacy_job_id` | `text` | null | Required and immutable only for transfers. |
| `legacy_identifier_kind` | `text` | null | Check: `biztrack_sales_order`, `door_go_reference`; required only for transfers. |
| `revision` | `bigint` | not null, default `1` | Check `revision >= 1`; incremented once per successful save/archive. |
| `lifecycle_stage` | `text` | not null, default `Draft` | Check: `Draft`, `Confirmed Job`. |
| `customer` | `text` | null | Trimmed header value. Customer or site is required by domain validation. |
| `site_address` | `text` | null | Trimmed header value. |
| `phone` | `text` | null | Customer contact, not an email recipient identity. |
| `email` | `text` | null | Customer contact, not an email recipient identity. |
| `salesperson` | `text` | null | Historical job snapshot. |
| `notes` | `text` | null | UTF-8 text. |
| `hinge_color` | `text` | null | Header selection. |
| `shop_hours` | `numeric(10,2)` | null | Check nonnegative. |
| `shop_hours_source` | `text` | null | Check when nonnull: `Estimated`, `Estimate incomplete`, `Manual`, `Calculated`; the final value supports accepted native output and prior saved/test compatibility. |
| `po_numbers` | `jsonb` | not null, default `[]` | Validated JSON array of unique digit strings. |
| `fulfillment_plan` | `text` | null | Check when nonnull: `Delivery`, `Customer Pickup`; informational intake value only and saving causes no fulfillment action. |
| `delivery_date` | `date` | null | Intake value only. |
| `customer_pickup_date` | `date` | null | Intake value only. |
| `shop_date` | `date` | null | Intake value only; saving causes no scheduling action. |
| `shop_date_source` | `text` | null | Check when nonnull: `Automatic`, `Manual`, `Calendar Sync`. |
| `archived_at` | `timestamptz` | null | Soft archive timestamp. |
| `archived_by_user_id` | `uuid` | null | FK to `auth.users(id)`, `ON DELETE RESTRICT`. |
| `archive_reason` | `text` | null | Optional reviewed reason; blank becomes null. |
| `created_at` | `timestamptz` | not null, default `now()` | Server assigned. |
| `updated_at` | `timestamptz` | not null, default `now()` | Server assigned on each successful revision. |
| `created_by_user_id` | `uuid` | not null | FK to `auth.users(id)`, `ON DELETE RESTRICT`. |
| `updated_by_user_id` | `uuid` | not null | FK to `auth.users(id)`, `ON DELETE RESTRICT`. |

Required constraints and indexes:

- primary key on `internal_job_id`;
- at least one of `biztrack_sales_order` or `door_go_reference` is nonnull;
- visible value/kind consistency checks described above;
- transfer/native provenance consistency checks described above;
- archive fields require `archived_at` and `archived_by_user_id` together;
- unique partial index on `lower(btrim(biztrack_sales_order))` where nonnull;
- unique partial index on `lower(btrim(door_go_reference))` where nonnull; this is the database concurrency backstop for native DG allocation;
- unique partial index on `lower(btrim(legacy_job_id))` where nonnull;
- unique index on `lower(btrim(visible_identifier))`;
- indexes on `(archived_at, updated_at DESC)`, `updated_at DESC`, and `created_by_user_id`;
- normal RPCs have no hard-delete operation.

### `dg_native_job_lines`

Typed columns retain searchable identity, ordering, lifecycle and scalar intake values. Structured calculator outputs remain validated JSONB rather than being flattened or recalculated by persistence.

| Column | Type | Null/default | Contract |
|---|---|---|---|
| `line_id` | `uuid` | PK, default UUID | Stable native line identity. |
| `internal_job_id` | `uuid` | not null | FK to native job, `ON DELETE RESTRICT`. |
| `line_index` | `integer` | not null | Check `>= 1`; unique per job. |
| `line_status` | `text` | not null, default `Active` | Check: `Active`, `Archived`, `Merged`. |
| `mode` | `text` | not null | Check: `Interior`, `Exterior`. |
| `door_type` | `text` | null | Typed scalar input. |
| `config` | `text` | not null | Canonical configuration code. |
| `width`, `height` | `text` | not null | Canonical shop dimension strings. |
| `custom_slab`, `custom_slab_width`, `custom_slab_height` | `text` | null | Conditional slab input. |
| `hand`, `prep`, `glass` | `text` | null | Door inputs. |
| `jamb_width`, `jamb_type`, `sill`, `weatherstrip`, `hinge_type` | `text` | null | Frame/hardware inputs. |
| `notes` | `text` | null | UTF-8 line notes. |
| `qty` | `integer` | not null, default `1` | Check `qty >= 1`. |
| `ro_width`, `ro_height`, `material`, `door_thickness`, `rip_jamb` | `text` | null | Geometry inputs. |
| `glass_calc_status` | `text` | null | Check when nonnull: `Complete`, `Glass Detail Needed`, `Warning`, `Blocked`, `Manual Override`, `Unsupported`, `Ready`, `Not Needed`. |
| `glass_workorder_detail`, `vendor_copy_text` | `text` | null | Persisted calculator output. |
| `glass_warnings`, `glass_blockers` | `jsonb` | not null, default `[]` | Validated arrays of `{code,message}` objects. |
| `glass_override` | `jsonb` | null | Validated override approval object. |
| `glass_units` | `jsonb` | not null, default `[]` | Validated glass-unit array. |
| `glass_calc` | `jsonb` | null | Validated calculator output object. |
| `sidelight_type` | `text` | null | Check: `Glass`, `Panel`. |
| `sidelight_glass`, `transom_glass` | `text` | null | Glass inputs. |
| `sidelight_measurement_left`, `sidelight_measurement_right` | `text` | null | Dimension inputs. |
| `panel_sidelight_width` | `text` | null | Panel input. |
| `panel_sidelights` | `jsonb` | not null, default `[]` | Validated panel array. |
| `include_diagram_on_work_order` | `boolean` | not null, default `true` | Saved J3 preference. |
| `created_at`, `updated_at` | `timestamptz` | not null, default `now()` | Server timestamps. |
| `created_by_user_id`, `updated_by_user_id` | `uuid` | not null | FK to `auth.users(id)`, `ON DELETE RESTRICT`. |

Required constraints and indexes:

- primary key on `line_id`;
- unique `(internal_job_id, line_index)`;
- indexes on `(internal_job_id, line_status, line_index)` and `updated_at`;
- JSONB type checks: arrays for warnings, blockers, units and panels; object-or-null for override and calculation;
- an existing line ID cannot move to another job;
- archived and merged rows are retained and cannot be hard-deleted by normal RPCs.

### `dg_native_job_create_commands`

| Column | Type | Null/default | Contract |
|---|---|---|---|
| `command_id` | `uuid` | PK | Client-generated idempotency identity. |
| `actor_user_id` | `uuid` | not null | FK to `auth.users(id)`, `ON DELETE RESTRICT`. |
| `request_fingerprint` | `text` | not null | Lowercase 64-character SHA-256 hex; check format. |
| `internal_job_id` | `uuid` | not null, unique | FK to native job, `ON DELETE RESTRICT`. |
| `created_at` | `timestamptz` | not null, default `now()` | Receipt timestamp. |

The receipt is permanent for idempotency and is not deleted by normal workflows. Reuse of a command ID by a different actor or fingerprint fails closed.

## RPC contract

All RPCs are `SECURITY DEFINER`, owned by the reviewed migration owner, use `SET search_path = ''`, schema-qualify every object and function, derive the actor only from `auth.uid()`, and return JSONB. They revoke execution from `PUBLIC` and `anon`; only `authenticated` receives `EXECUTE`.

Errors use stable categories in their message/detail contract: authentication required, active profile required, permission required, validation failed, duplicate Sales Order, duplicate DoorGo reference, duplicate legacy transfer, idempotency conflict, stale revision, not found, archived, and unavailable. Raw database or customer data is not exposed in errors.

### `dg_create_native_job`

Signature:

```text
dg_create_native_job(
  p_command_id uuid,
  p_origin text,
  p_legacy_job_id text,
  p_legacy_identifier_kind text,
  p_header jsonb,
  p_lines jsonb
) returns jsonb
```

`p_header` accepts exactly the snake-case header fields defined above, excluding server-owned identity, revision, archive, timestamp and actor fields. `p_lines` is an array of complete line inputs; supplied `line_id` values must be UUIDs and duplicate IDs fail.

The RPC:

1. authenticates and locks/validates the caller's active profile plus `jobs=use` permission, with no manager fallback;
2. canonicalizes the request and calculates a deterministic SHA-256 fingerprint;
3. checks `dg_native_job_create_commands` by command ID;
4. returns the prior aggregate with `idempotent_replay: true` only when actor and fingerprint match;
5. otherwise fails on command reuse;
6. validates origin and transfer provenance;
7. for `origin=native`, allocates a permanent `DG-######` through the sequence even when a Sales Order is authoritative, preserving the existing approved domain requirement for a secondary DoorGo reference;
8. checks normalized Sales Order, DoorGo reference and legacy provenance against native uniqueness rules;
9. for a newly allocated `DG-*` reference, loops across occupied sequence candidates and performs a read-only collision check against both native references and `dg_jobs.job_id`; an expected legacy source row never blocks its own transfer;
10. inserts the job, all lines and command receipt in one transaction;
11. returns `{job, lines, idempotent_replay:false}` with revision 1.

The RPC does not create a hosted row while a transfer is merely being reviewed in the editor.

### `dg_update_native_job`

Signature:

```text
dg_update_native_job(
  p_internal_job_id uuid,
  p_expected_revision bigint,
  p_header jsonb,
  p_lines jsonb
) returns jsonb
```

The RPC requires active `jobs=use`, locks the native job row `FOR UPDATE`, rejects archived jobs, and requires exact revision equality. It validates header uniqueness and the complete submitted line set. Existing line IDs must belong to the job; new lines receive or validate UUIDs. A previously active line omitted from the submitted set is changed to `Archived`, not deleted. Submitted archived rows remain retained; an explicit valid status transition may restore them. `Merged` rows cannot be restored. Successful persistence updates timestamps/actors and increments the job revision exactly once, regardless of line count. Any validation or stale failure rolls back the entire operation.

Response: `{job, lines}` containing the new revision. No-op explicit saves remain successful saves and increment once, matching the accepted Save behavior.

### `dg_archive_native_job`

Signature:

```text
dg_archive_native_job(
  p_internal_job_id uuid,
  p_expected_revision bigint,
  p_reason text
) returns jsonb
```

Requires active `jobs=use`, locks the row, verifies the expected revision, sets archive timestamp/actor/reason, updates the actor/timestamp, and increments revision once. Repeating against an already archived job fails without another revision. It does not delete the job or lines. Response: `{job, lines}`.

### `dg_get_native_job`

Signature:

```text
dg_get_native_job(
  p_internal_job_id uuid,
  p_include_archived boolean default false
) returns jsonb
```

Requires active `jobs=view` or `jobs=use`. By default an archived job is not found. When explicitly requested, an authorized caller may load it read-only. Response: `{job, lines}`, including active, archived and merged lines in stable `line_index` order.

### `dg_list_native_jobs`

Signature:

```text
dg_list_native_jobs(
  p_include_archived boolean default false
) returns jsonb
```

Requires active `jobs=view` or `jobs=use`. It queries only `dg_native_jobs`; it never unions or falls back to `dg_jobs`. Default output excludes archived jobs. Explicit archive listing includes them. Response: `{jobs:[...]}`, ordered by `updated_at DESC, internal_job_id`, containing summary fields and active/archived line counts but not entire line aggregates.

## Security and RLS contract

- Enable RLS on all three native tables.
- Do not force RLS for the pilot RPC architecture.
- Create no `anon` policy and grant `anon` no table, sequence or function privileges.
- Revoke direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `REFERENCES`, `TRIGGER` and `MAINTAIN` from `authenticated`.
- Do not grant authenticated direct table `SELECT`; list/get are reviewed RPCs.
- Revoke sequence access from `anon` and `authenticated`; only the create RPC owner allocates references.
- Grant authenticated execution only on the five reviewed RPC signatures.
- Each RPC independently checks `auth.uid()`, an active `dg_user_profiles` row, and the exact `jobs` permission level.
- `jobs=none` is denied; `jobs=view` may list/get and retains Preview, Print, Download and Send rights; `jobs=use` may create/update/archive/transfer. Manager status is ignored as permission authority.
- No RPC uses or depends on Resend or Production Send configuration.

Forced RLS is disabled deliberately. These `SECURITY DEFINER` RPCs require owner-level table access after they have explicitly authorized the caller. Forcing RLS either has no additional effect for a `BYPASSRLS` owner or requires policies that recreate the same privileged-function boundary and can break fixed-owner execution. Defense in depth instead comes from no direct authenticated table grants, RLS enabled with no ordinary policies, minimal RPC execute grants, fixed empty search paths, schema qualification, stable permission checks, and static tests that reject additional callers or writes. A future direct-table access model would require a separate RLS redesign.

## Jobs page and output behavior

The Jobs page calls only `dg_list_native_jobs`. Its structural source is `dg_native_jobs`, whose allowed origins are `native` and `legacy_transfer`. Ordinary legacy mirror rows, Calendar/production/history records and unsaved transfer payloads cannot appear because they are not stored in that table.

Opening, work-order generation, PDF Download/Print and J3C Send load the saved aggregate only through `dg_get_native_job` or the hosted repository backed by it. Dirty state, revision pinning, blockers, warnings, permissions and recipient rules remain unchanged. Persistence RPCs have no output-delivery side effect.

## Archive and side-effect invariants

Normal job workflows never issue `DELETE` against any native table. Line removal is reversible archive behavior; job removal is soft archive behavior. No create, update, archive, get or list RPC may reference or mutate production bookings, production capacity, Calendar links/events, fulfillment execution, document moves, email providers, `dg_jobs`, `dg_job_lines`, Sheets or Apps Script, except that create may perform a read-only collision check against `dg_jobs.job_id`.

## Migration implementation sequence

1. Add one new migration containing catalog/name/extension preflight documentation and the three tables, sequence, constraints, comments and indexes.
2. Enable fail-closed RLS and establish explicit revokes before granting any RPC execution.
3. Add shared private authorization/validation helpers only if their ownership, grants and fixed search path are independently reviewed.
4. Add create, update, archive, get and list RPCs with exact signatures above.
5. Add SQL/static tests for idempotency, concurrency, duplicate identifiers, revision locking, archive retention, permissions, grants, search paths and prohibited side effects.
6. Add the hosted repository adapter behind the existing `JobIntakeRepository`; retain the local adapter only through explicit test injection.
7. Switch Jobs, editor, work-order and Send repository reads to the hosted adapter without changing domain calculators.
8. Add the versioned legacy-transfer parser that populates unsaved editor state only.
9. Perform local and disposable-database verification before any hosted migration authorization.
10. Apply to hosted environments only under a separate migration/deployment authorization and controlled acceptance plan.

## Verification plan

- Static migration verification: exact object names, no changes to legacy tables, fixed search paths, grants/RLS, no unauthorized functions, and no production/Calendar/document/email references.
- Database verification in a disposable Supabase/PostgreSQL environment: anonymous denial; inactive/missing profile denial; `jobs=none/view/use`; manager-only denial; create idempotency; concurrent reference allocation; duplicate normalized identifiers; transfer provenance; stale writes; one-step revisions; archived-line retention; job archive/list/get behavior; and transaction rollback.
- Repository contract tests run unchanged against local and hosted adapters.
- J1–J3C regressions prove saved-state, deterministic PDF, permission and Send isolation.
- Hosted acceptance uses one non-production native job and proves no change to legacy mirrors or operational tables.

## Rollback plan

Before any native data exists, a separately authorized rollback migration may revoke RPC execution and drop only the new RPCs, sequence and native tables in dependency order. It must not touch legacy mirrors.

After any native job exists, destructive rollback is prohibited. Disable new writes by revoking authenticated RPC execution, preserve and export native rows, diagnose forward, and use a reviewed corrective migration. Sequence rollback never reuses issued references. Application rollback must fail closed rather than falling back to local persistence or legacy mirrors.

## Resolved identifier decision

`DG-######` is the approved permanent format for brand-new native DoorGo references. The new DoorGo exclusively owns new DG allocation from this checkpoint forward. No temporary alternate prefix is introduced. Legacy automatic `JOB-####` allocation remains separate, and transferred Sales Orders and legacy DG references are preserved without renumbering. All architecture, permission, transfer, archive and security decisions in this contract reflect the approved task brief and inspected catalog.
