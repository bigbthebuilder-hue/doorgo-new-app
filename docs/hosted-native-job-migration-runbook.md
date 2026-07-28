# Hosted Native-Job Migration Runbook

## Boundary

This package prepares a controlled manual application to the approved pilot Supabase project. It does not authorize Codex, the application, or an automated tool to apply the migration. The application repository adapter remains unimplemented and must not be started until every verification result is reviewed and accepted.

Authoritative migration: `supabase/migrations/20260728000000_create_native_job_persistence.sql`

Expected SHA-256: `2F13B297F395440912F6CD0B40FCD636DF6A23DD6331B4454DDA867258763B05`

## Manual sequence awaiting approval

1. Recalculate the migration SHA-256 locally and stop unless it exactly matches the value above.
2. Open the approved pilot project in Supabase SQL Editor. Do not open or modify another project.
3. Paste the complete contents of `scripts/inspect-native-job-hosted-preflight.sql` into a new query and run it once.
4. Use **Download CSV** or **Copy as JSON** to preserve the single ordered preflight result set.
5. Review every section. Stop unless planned-object collision counts are zero, required roles/extensions and assumed columns are present, the highest valid legacy DG suffix remains 2, `DG-000007` is unoccupied, and legacy/operational baselines are recorded.
6. Reconfirm the migration file checksum. Paste the complete authoritative migration into a new SQL Editor query and run it exactly once. Do not retry after any error; preserve the complete error and stop.
7. From `scripts/verify-native-job-hosted-application.sql`, select and run only **PORTION 1**. Export its single ordered result set with **Download CSV** or **Copy as JSON**. Confirm all objects, exact signatures, RLS, grants, sequence settings, schemas, and counts match the preflight and contract.
8. Review **PORTION 2** before running it. It selects one—and only one—active controlled `jobs=use` profile without displaying email or customer data, changes its profile/permission state only inside the test transaction, and ends with `ROLLBACK`.
9. Important: PostgreSQL sequence allocation is nontransactional. Although all test jobs, lines, receipts, profile changes, and permission changes roll back, behavioral testing permanently consumes DG sequence values. Gaps are expected and must never be reused.
10. Select and run the complete **PORTION 2** block from `BEGIN;` through `ROLLBACK;` once. Success is the notice that every assertion passed followed by rollback. Any exception is a failed acceptance; preserve the error and stop.
11. Run **PORTION 1** again and export the final result. Compare legacy mirror schemas/counts and production, Calendar, and capacity counts with the preflight export. Native table row counts must be zero after the rolled-back tests. Sequence advancement alone is expected.
12. Stop immediately on any object, privilege, signature, schema, count, permission, pagination, identifier, or mutation discrepancy. Do not proceed to the application adapter.

## Result handling

Use descriptive local filenames containing the project ref, phase (`preflight`, `post-apply`, or `post-behavior`), and timestamp. Keep exports outside the repository because catalog/grant information is operational evidence. Do not paste secrets, JWTs, service-role keys, customer details, or personal email addresses into the repository or review report.

## Emergency rollback boundary

`scripts/rollback-native-job-persistence.sql` is for separately authorized emergency use only before native application data becomes authoritative. It removes only the five native RPCs, three native tables, and native reference sequence. Never run it after accepted native records become authoritative; use a reviewed forward recovery plan instead. Do not run it merely because a behavioral assertion failed—first preserve evidence and review whether the migration transaction already rolled back.
