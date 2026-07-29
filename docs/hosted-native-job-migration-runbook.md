# Hosted Native-Job Migration Runbook

## Boundary

This package records the controlled manual application and acceptance in the approved pilot Supabase project. It does not authorize further migration, deployment, or hosted mutation. The hosted application repository adapter is implemented and its controlled acceptance is complete.

Authoritative migration: `supabase/migrations/20260728000000_create_native_job_persistence.sql`

Expected SHA-256: `2F13B297F395440912F6CD0B40FCD636DF6A23DD6331B4454DDA867258763B05`

The authoritative migration has been applied once. Permanent verification found that Supabase database default privileges granted `service_role` direct access to the new tables, sequence, and RPCs. PostgreSQL `postgres` owner privileges are normal ownership evidence and are not client exposure.

Applied grant-hardening migration: `supabase/migrations/20260729000000_harden_native_job_service_role_grants.sql`

The grant-hardening migration contains only exact revocations from `service_role`. Post-correction permanent verification passed: it proved zero direct native-table privileges for `PUBLIC`, `anon`, `authenticated`, and `service_role`; exactly five authenticated RPC `EXECUTE` grants; exactly five normal `postgres` owner RPC privileges; zero `service_role` RPC privileges; no other RPC privileges; and zero direct native-sequence privileges for `PUBLIC`, `anon`, `authenticated`, and `service_role`.

Applied update-expression correction: `supabase/migrations/20260729010000_fix_native_job_update_greatest.sql`

The first rolled-back behavioral attempt exposed an invalid schema-qualified `GREATEST` expression inside `dg_update_native_job`. The correction was applied and permanent and rolled-back behavioral verification passed. Sequence values consumed by failed or rolled-back attempts remain permanent gaps and must not be reset or reused.

## Manual sequence awaiting approval

1. Recalculate the migration SHA-256 locally and stop unless it exactly matches the value above.
2. Open the approved pilot project in Supabase SQL Editor. Do not open or modify another project.
3. Paste the complete contents of `scripts/inspect-native-job-hosted-preflight.sql` into a new query and run it once.
4. Use **Download CSV** or **Copy as JSON** to preserve the single ordered preflight result set.
5. Review every section. Stop unless planned-object collision counts are zero, required roles/extensions and assumed columns are present, the highest valid legacy DG suffix remains 2, `DG-000007` is unoccupied, and legacy/operational baselines are recorded.
6. Reconfirm the migration file checksum. Paste the complete authoritative migration into a new SQL Editor query and run it exactly once. Do not retry after any error; preserve the complete error and stop.
7. Apply the complete update-expression corrective migration exactly once only after separate authorization. Do not proceed after any error.
8. From `scripts/verify-native-job-hosted-application.sql`, select and run only **PORTION 1**. Export its single ordered result set with **Download CSV** or **Copy as JSON**. Confirm all objects, exact signatures, RLS, table/RPC/sequence grants, sequence settings, schemas, and counts match the preflight, contract, and post-correction requirements above. This verification must pass before behavioral testing.
9. Review **PORTION 2** before running it. It selects one—and only one—active controlled `jobs=use` profile without displaying email or customer data, changes its profile/permission state only inside the test transaction, and ends with `ROLLBACK`.
10. Important: PostgreSQL sequence allocation is nontransactional. Although all test jobs, lines, receipts, profile changes, and permission changes roll back, behavioral testing permanently consumes DG sequence values. Gaps are expected and must never be reused.
11. Select and run the complete **PORTION 2** block from `BEGIN;` through `ROLLBACK;` once. Success is the notice that every assertion passed followed by rollback. Any exception is a failed acceptance; preserve the error and stop.
12. Run **PORTION 1** again and export the final result. Compare legacy mirror schemas/counts and production, Calendar, and capacity counts with the preflight export. Native table row counts must be zero after the rolled-back tests. Sequence advancement alone is expected.
13. Stop immediately on any object, privilege, signature, schema, count, permission, pagination, identifier, or mutation discrepancy. Do not proceed to the application adapter.

## Result handling

Hosted persistence acceptance is complete. The application repository now uses the five authenticated native-job RPCs in normal runtime, while local persistence is test-injected only. DG sequence gaps consumed by failed or rolled-back acceptance attempts are expected, permanent, and must not be reset or reused.

Hosted application-adapter acceptance also passed with controlled non-production job `DG-000013`. Create, reopen/reload, update, stale-revision concurrency rejection, work-order Preview/Download, J3C pre-send inspection without email delivery, and soft archive were accepted. A saved Revision 9 became archived Revision 10 exactly once with the reason `Controlled hosted adapter acceptance complete`; both active lines and the legitimate linked idempotency receipt remained, with no orphan receipt. The archive RPC updated only its six accepted archive/audit fields on `public.dg_native_jobs` and caused no Production, Calendar, capacity, fulfillment, document, email, or legacy mutation. Current accepted legacy baselines are 45 jobs and 165 lines; read-only identifier and UUID scans proved the added legacy activity was unrelated to `DG-000013`. Legacy transfer remains unimplemented and out of scope.

Use descriptive local filenames containing the project ref, phase (`preflight`, `post-apply`, or `post-behavior`), and timestamp. Keep exports outside the repository because catalog/grant information is operational evidence. Do not paste secrets, JWTs, service-role keys, customer details, or personal email addresses into the repository or review report.

## Emergency rollback boundary

`scripts/rollback-native-job-persistence.sql` is for separately authorized emergency use only before native application data becomes authoritative. It removes only the five native RPCs, three native tables, and native reference sequence. Never run it after accepted native records become authoritative; use a reviewed forward recovery plan instead. Do not run it merely because a behavioral assertion failed—first preserve evidence and review whether the migration transaction already rolled back.
