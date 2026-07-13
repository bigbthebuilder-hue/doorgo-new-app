# Production-flow checkpoint RPC contract

Phase 2F-C2 adds only three PostgreSQL mutation RPCs. It does not apply the migration, add UI or Server Actions, mutate completion events or Calendar, or change Production Board reads/calculations.

## Authorization and dates

All RPCs derive the actor from `auth.uid()`, require an active `public.dg_user_profiles` row, and require `production_checkpoints = use` in `public.dg_user_permissions`. `none` gives no checkpoint access; `view` reserves read-only checkpoint/history access for a future UI. Any employee with `use`, including a non-manager, may create, revise, backdate, remove, and reconfirm checkpoints. Managers without `use` cannot mutate. The broad `production` permission and manager status are irrelevant. Future dates are rejected for everyone using the PostgreSQL-derived current `America/Vancouver` business date.

## Validation

IDs, production date, and actual opening carry are required. RPC numeric inputs intentionally have no argument typmod so PostgreSQL cannot round before validation; accepted values must fit the table's `numeric(10,2)` range, be nonnegative, and have at most two decimals. Notes/version are trimmed; blanks become `NULL`. Notes and calculation versions are limited to 500 characters. A removal reason is mandatory. The database derives `adjustment_hours_snapshot = opening_carry_hours - calculated_opening_carry_snapshot`, or `NULL` without a snapshot. Database time, `office_user`, `doorgo_office`, actor, status, series, and revision are never caller-controlled.

## Idempotency and errors

The supplied new checkpoint UUID is the command key. A retry returns its existing audit row only when actor, date, operation shape/predecessor, normalized note/version, actual carry, calculated snapshot, and derived adjustment match. Create distinguishes first-create/reconfirm from revise using revision 1 or a predecessor with no confirmation timestamp; revise/remove compare the expected predecessor and revision. Any mismatch is `checkpoint.command_uuid_collision`.

Stable messages are `checkpoint.authentication_required`, `checkpoint.active_profile_required`, `checkpoint.permission_required`, `checkpoint.future_date_not_allowed`, `checkpoint.invalid_request`, `checkpoint.invalid_carry_value`, `checkpoint.too_many_decimal_places`, `checkpoint.note_required`, `checkpoint.note_too_long`, `checkpoint.already_confirmed`, `checkpoint.not_found`, `checkpoint.stale_revision`, `checkpoint.command_uuid_collision`, and `checkpoint.inconsistent_history`. They disclose no user or row identity.

## Concurrency and immutable history

Every RPC uses two transaction-scoped advisory locks in one invariant lock order:

1. A global command UUID lock from `hashtextextended('dg_production_flow_checkpoint_command:' || new_checkpoint_uuid, 0)`.
2. A production-date lock from `hashtextextended('dg_production_flow_checkpoint:' || production_date, 0)`.
3. A row `FOR UPDATE` lock where revise or removal requires one.

The command lock serializes reuse of one globally unique command UUID even across different production dates. After both locks, the RPC rereads the UUID and returns an identical material retry or `checkpoint.command_uuid_collision`; competing inserts using one UUID cannot proceed together, so no raw primary-key error is expected. The date lock protects series history. Authorization, payload validation, and future-date rejection occur before locking because they inspect no mutable checkpoint state; every idempotency/history inspection occurs afterward. Both keys are deterministic 64-bit hashes. A theoretical collision causes unnecessary serialization only and cannot weaken correctness. Existing unique constraints remain final safeguards. Broad `unique_violation` handling is intentionally absent so unrelated confirmed-date and series/revision failures are not mislabeled.

Corrections and removals lock the current confirmed row `FOR UPDATE`, enforce expected ID/revision, preallocate the successor UUID, update the predecessor to `superseded`, then insert the same-series adjacent successor. The existing deferred reciprocal-link trigger validates at commit. “Remove checkpoint” removes that manual checkpoint's authority from production-flow calculations while retaining an immutable internal `voided` audit revision with copied observation/snapshot/version fields and the mandatory reason. It does not delete production jobs, cancel orders, move jobs, or establish a general manager-approval requirement for scheduling. The internal RPC remains `void_production_flow_checkpoint`. Reconfirmation supersedes the terminal internal void revision and appends a confirmed revision in the same series. Broken continuity, multiple series, or unexpected terminal state is rejected.

Deferred reciprocal-link validation must execute using a trusted database owner context because the constraint trigger fires after the outer `SECURITY DEFINER` RPC returns. A transactional follow-up migration keeps the existing validator body and trigger unchanged while making `public.validate_production_flow_checkpoint_links()` owned by `postgres`, `SECURITY DEFINER`, and configured with an empty `search_path`; direct execution is revoked from PUBLIC, anon, and authenticated.

## Privileges and later live verification

Execution is revoked from PUBLIC and anon and granted only to authenticated. Direct authenticated/anon INSERT, UPDATE, DELETE, and TRUNCATE remain revoked; no service-role mutation path or mutation RLS policy is added.

The unapplied migration is enclosed by an explicit `BEGIN` and final `COMMIT`. Function creation/replacement and every privilege change therefore install atomically; a failure rolls back the complete attempt and cannot commit a temporary PUBLIC-execution posture. A rerun replaces the same function signatures and reapplies revocations/grants. A conflicting overload, signature, or syntax error rolls back the attempt. The migration contains no nontransactional DDL.

The security-definer create RPC retains the qualified Supabase convention `extensions.gen_random_uuid()`. Repository history alone cannot prove its target availability, and the migration must not create extensions or use an unqualified fallback with an empty search path. Before later controlled application, run this read-only preflight:

```sql
SELECT
  to_regprocedure('extensions.gen_random_uuid()') AS extensions_generator,
  to_regprocedure('gen_random_uuid()') AS search_path_generator;
```

Do not apply until `extensions_generator` resolves.

After review and migration application, use disposable dates/UUIDs and rollback transactions where possible to test: unauthenticated, missing-profile, inactive-profile, missing/`none`/`view` checkpoint-permission rejection; current create with `use`; non-manager `use` backdate/revise/remove; manager without checkpoint `use` rejection; broad `production = use` without checkpoint `use` rejection; authorized future-date rejection; first-create values/attribution; duplicate dates and UUID retries/collisions; concurrent first creates; revise links/stale guards/concurrent winner; mandatory removal reason/copied audit/no-confirmed-row; same-series reconfirmation; and preservation of Board reads, July 6 fallback, and later resets.

Idempotency concurrency testing must additionally cover: the same UUID and same date with identical payload; the same UUID with a different date, operation, actor, or predecessor; and two concurrent creates using the same command UUID but different dates and payloads. Exactly one cross-date command may succeed; the other must return `checkpoint.command_uuid_collision`, with no raw primary-key violation or partial history. In a disposable isolated database, also verify migration atomicity by adding a deliberately failing statement to a copy of the migration and confirming that function creation and privileges roll back. Never perform that failure test in production.

For later controlled setup, an administrator may substitute a disposable test UUID—never a hard-coded live identity—and run the following. Phase 2F-C2 does not execute it:

```sql
INSERT INTO public.dg_user_permissions (user_id, permission_key, access_level)
VALUES (:test_user_id, 'production_checkpoints', 'use')
ON CONFLICT (user_id, permission_key)
DO UPDATE SET access_level = EXCLUDED.access_level, updated_at = pg_catalog.now();
```

Static verification does not prove PostgreSQL compilation, extension availability, real concurrent execution, transaction rollback, deferred-trigger behavior, RLS, or PostgREST overload resolution.

## Live verification

Controlled Supabase verification confirmed successful application of both the
checkpoint RPC migration and the deferred-validator security follow-up. The
validator runs as a `postgres`-owned `SECURITY DEFINER` function with an empty
`search_path`; PUBLIC, anon, and authenticated cannot invoke it directly, and
direct checkpoint-table mutations remain revoked.

An authenticated user with `production_checkpoints = use` successfully created,
revised, removed, and reconfirmed a checkpoint through revisions 1–4 in one
shared series with reciprocal links. Identical retries for every operation were
idempotent. Stale revise/remove attempts and changed-data reuse of a command UUID
were rejected. The disposable checkpoint history used for verification was
deleted after the checks completed.
