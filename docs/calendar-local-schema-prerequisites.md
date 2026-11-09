# Calendar local authorization prerequisites — 2026-11-04

Result: **NO-GO; SQL authorization suites not executed.** No database changes were made.

## Verified local state

Read-only connections explicitly targeted `127.0.0.1:5433`, user `postgres`, databases `doorgo_notes_test` and `doorgo_staff_away_test`. PostgreSQL reports 18.4. Notes contains only `dg_daily_capacity` in public (postgres-owned, RLS enabled, not forced); Staff Away contains no public tables. Both contain minimal `auth.users` and a stable SQL `auth.uid()` reading `request.jwt.claim.sub`. These are compatibility objects, not proof of Supabase security equivalence.

Local `anon`, `authenticated` and `service_role` are NOLOGIN, non-superuser, inheriting roles without BYPASSRLS. The intended service-role attributes, memberships and grants need authoritative confirmation before any cluster-wide change; no role was altered. Existing password bootstrap explicitly models test-only Auth stand-ins and targets a different database/cluster, so it was not reused.

## Required authoritative information

The 59 migration files reference three public tables for which no creation definition exists anywhere in the available repository SQL:

- `public.dg_production_bookings`
- `public.dg_jobs`
- `public.dg_calendar_links`

Retrieve a schema-only export for all three, including exact column types/defaults/generated or identity attributes, sequences and ownership, primary/foreign/check/unique constraints (including validation/deferral), indexes, owners, table/column/sequence ACLs, RLS enabled/forced state, policies, and triggers with enabled state and exact `pg_get_triggerdef` output. Include referenced types, functions, sequences and external FK targets not defined by repository migrations. Include schema USAGE and applicable default privileges. Do not export application records or secrets.

The owner reports production RLS enabled with no policies on all three, plus two booking trigger functions. This is useful evidence but does not supply executable DDL or complete ACLs. Preserve zero-policy RLS; do not add permissive policies.

For booking triggers, retrieve exact trigger names/events/conditions and function signatures, full definitions, owner, SECURITY DEFINER/INVOKER, search path/settings and ACLs. Repository definitions exist for `assign_production_booking_day_order()` in `20260821000000`, and `assign_native_production_job_link()` in `20260821040000`, replaced in `20260902010000`. Compare effective definitions rather than inventing replacements. Also retrieve authoritative Auth compatibility definitions/ACLs and application-role attributes/memberships, including `service_role` BYPASSRLS, sufficient to establish the tested security boundary. Real JWT issuance/verification is outside these SQL session tests.

## Dependency-safe setup remains blocked

`20260711000000` immediately requires the missing booking table for its foreign key. Migration references and application types do not establish original table security or complete DDL.

A current schema export cannot simply precede all historical migrations: `20260821000000` adds `day_order` and its trigger; later migrations add native links and more current schema. Current baseline definitions may already contain those additions, and FK targets may themselves be created later. Need either an authoritative historical baseline, or a reviewed object-by-object replay plan using the authoritative current export, explicit handling of overlapping DDL, and a final effective-schema/security comparison. Do not silently skip migrations, remove constraints, fabricate history or claim current DDL is the original baseline.

Password/business-access migrations also require documented same-session cutover acknowledgements (`20261023160000`, `20261027120000`). A future local runner must isolate such acknowledgements to the two named test databases and must not bypass their preconditions.

Only after these gaps are resolved can a reusable fail-closed setup apply migrations, seed synthetic actors/linkage/workweek/absence cases and execute both existing SQL suites. It must hard-code loopback port 5433, reject every other database/endpoint, inspect existing state before mutations and preserve existing data. No executable setup was authored against unknown definitions.

## Checks executed

- Both local database read-only inspections: passed.
- `node --experimental-vm-modules scripts/verify-calendar-view-visibility.mjs`: passed after source reads normalize CRLF to LF; application behavior unchanged.
- `node scripts/verify-calendar-linked-notes.mjs`: passed.
- `node scripts/verify-calendar-staff-away-read.mjs`: passed.
- `node scripts/verify-calendar-operational-permissions.mjs`: passed.
- `git diff --check`: passed.
- Both Calendar SQL suites: **not run**, incomplete prerequisites. Static/mocked passes are not SQL/RLS proof.

No port-5432 access, production access, migration/fixture writes, commit, push or deployment occurred. Retrieve the schema information above through separately authorized connected Supabase inspection, then resume local setup. Browser and real-session acceptance remain separate release gates.
