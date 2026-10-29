# Employee password and business-access cutover

Prepared from `8ff5ab2`. Operator execution only; nothing in this runbook has been applied by its preparation. Scope is DoorGo, not shared `pet_`/`wt_` objects or role memberships. No custom session tracking. See [security architecture](architecture/03-authentication-and-security.md) and [ordered database dependencies](architecture/02-database-and-data-ownership.md#final-legacy-administration-restriction-and-pending-sequence).

## Decision and prerequisites

GO for a coordinated, controlled cutover after the local release checks pass. This is not permission to deploy only the application or to reopen before acceptance. Owner-supplied hosted checks establish the original profile/admin prerequisites, absent new operation state, all 31 compatible function bodies, all 19 RLS tables/permissive policies, linked-note prerequisites, no recorded legacy dependencies and an eligible administrator. No repeat structural inventory is needed unless that state changes. SQL runtime against the complete hosted business schema and native Auth session behavior are acceptance requirements, not proven by static/mocked tests.

The legacy-admin postcondition checks whether a client role belongs to an executable role. `supabase_admin` belonging to `authenticated` is the reverse direction and does not justify an exemption. Keep shared roles unchanged. The four legacy mirror tables receive no new policies. Own-profile/setup/logout access stays available.

## Operator preparation and pause

1. Record the final local release commit and current production deployment ID. Check `git status`, run the documented local checks, and arrange an existing database recovery point using the operator's established backup procedure. Do not export business data into Git.
2. Privately verify public and trusted Supabase URLs target DoorGo and required server-only credentials are present. Never expose keys. Confirm an authorized SQL operator and the eligible administrator are available, plus a designated synthetic acceptance employee. Do not experiment with the sole administrator's reset/deactivation.
3. Schedule a maintenance window. Block employee access at the hosting access-control/firewall layer for **all** current/old deployment URLs and aliases, including POST/Server Action endpoints; allow only the operator. A notice or hiding navigation is insufficient. This repository has no maintenance switch. Use an already-supported hosting control; if unavailable, stop before SQL and arrange that control rather than improvising an application flag.
4. Close old clients, stop separately identified DoorGo automated writers, and allow in-flight requests to finish. Verify old endpoints are blocked and no controlled worker/request remains in flight. Do not disable unrelated services, alter shared roles or touch the external Calendar bridge as part of this task.
5. Hosting restrictions do not block a client calling Supabase directly. The legacy SQL authority must therefore be retired before acceptance/reopening; do not claim the hosting pause alone provides database isolation. If controlled direct writers cannot be stopped, do not start cutover.

## SQL sequence (only after separate execution authorization)

Use the exact reviewed repository file contents, in order, in the confirmed DoorGo project's SQL Editor. No blanket `db push`, no original profile migration replay, no schema assumptions or shared-role changes. The files include their own transactions; check each result and stop on the first error.

| Order | File under `supabase/migrations/` | Prefix in the SAME SQL Editor execution as that file |
|---|---|---|
| 1 | `20261015120000_restrict_calendar_linked_fulfillment_notes.sql` | None |
| 2 | `20261016120000_password_operation_foundation.sql` | None |
| 3 | `20261023120000_employee_password_operation_snapshot.sql` | None |
| 4 | `20261023140000_password_atomic_profile_transitions.sql` | None |
| 5 | `20261023160000_retire_legacy_password_completion.sql` | `SET doorgo.password_completion_cutover = 'approved';` |
| 6 | `20261026120000_password_require_change.sql` | None |
| 7 | `20261026160000_password_reactivation.sql` | None |
| 8 | `20261027120000_business_access_requirement.sql` | `SET doorgo.business_access_cutover = 'approved';` |
| 9 | `20261028120000_restrict_legacy_user_administration.sql` | `SET doorgo.legacy_admin_cutover = 'approved';` |

Append the corresponding `RESET doorgo.<setting>;` after each guarded file's COMMIT. Do not set database/role defaults or assume another SQL Editor execution retains the session. Acknowledgements acknowledge timing; they do not establish compatibility.

October 15 is the pending linked-note security restriction, not Google synchronization. October 26 reactivation replaces reservation/settlement while retaining atomic flags. October 28 requires all replacements, the business helper and absence of legacy completion. Its RESTRICT/postconditions must not be bypassed.

SQL Editor execution does not automatically record CLI migration history. Record each successfully committed version through the established authorized migration-history process (for an already linked/authenticated CLI, `supabase migration repair <successfully_applied_version> --status applied --linked` marks history only; see [official CLI reference](https://supabase.com/docs/reference/cli/supabase-migration-repair)). Never mark a failed/unexecuted file applied. Keep exact execution results and versions; do not replay successful CREATE migrations after a later failure. History recording is a hosted write and belongs only to separately authorized execution.

## Deploy and verify while access remains restricted

1. Confirm all nine SQL steps succeeded. Verify trusted `dg_password_*` entrypoints are service-role-only, the legacy completion function is absent and both legacy administrative RPCs deny ordinary-client execution. Confirm the 31 wrappers and 19 restrictive policies exist alongside the original module/location policies. Check default/extra grants did not expose new internal tables/functions. These are postconditions, not a new pre-cutover investigation.
2. Only now push the reviewed release through the existing deployment process, deploy/promote that exact commit, and verify deployed SHA. Keep old deployments blocked. An automatic production deploy triggered by push must also stay behind the maintenance restriction. Do not expose a preview with production credentials before SQL is ready.
3. Run the six acceptance workflows below with the designated test employee. Verify real Auth and database results; do not infer success from a toast alone. Use only authorized synthetic records for business-action checks.

| Workflow | Required result |
|---|---|
| Create employee | Existing admin creates temporary password; profile active with setup required; employee cannot access business pages/actions/RPCs yet. |
| First setup | Correct authenticated employee changes password; operation succeeds; both setup state and profile requirement clear atomically; subsequent business access follows module permissions. |
| Normal login | New employee password works after logout; permission-denied modules remain denied. |
| Forgotten password | Admin reset succeeds; mandatory setup returns; employee completes setup with new temporary password. Check another device's old session and refresh behavior; do not claim native revocation before observing it. |
| Require Password Change | Requirement is established without an Auth password reset; existing password still reaches setup; business actions/direct RPCs remain denied until successful setup. |
| Deactivate/reactivate | Deactivation denies existing-session business access immediately. Reactivation requires temporary password and confirmed Auth success, then active + setup-required. Rejected/uncertain updates never activate. |

Also verify setup/logout stay reachable; manager status cannot bypass flags; inactive/setup-required callers cannot read protected rows through RLS or invoke guarded RPCs; eligible users retain original module/company-wide Calendar behavior; linked fulfillment notes exclude unrelated Jobs. Test ordinary legacy RPC denial directly, not just missing UI controls. Confirm representative Jobs, Production and Calendar reads/mutations with appropriate test permissions. Do not execute the disposable-local SQL fixture scripts against production.

4. Inspect errors and operation outcomes. Unknown/stale results must remain fail-closed. If all checks pass, reopen only the compatible deployment and announce completion. Keep former deployments inaccessible. No claim of immediate JWT invalidation is required or made: current active/setup flags must gate protected operations.

## Failure and recovery

- Before SQL: keep/revert the hosting pause as appropriate; no schema rollback needed.
- During SQL: stop, keep maintenance active, record the failed file/error and successful commits. Its transaction should roll back its own changes, not earlier migrations. Determine actual applied state before retry; never bypass a guard or blindly rerun the whole chain.
- After legacy retirement: do not roll back to the old app, restore session-only completion, or regrant legacy admin execution. Recover forward to a compatible release. If emergency database restoration is needed, coordinate application/database state under maintenance; it is not a blanket rollback command.
- After Auth writes: SQL rollback/backup restoration does not undo external Auth changes. Do not clear flags manually, delete reservations, use elapsed time as proof, or blindly retry a password write. A trusted operator must establish the actual outcome before using the existing restricted reconciliation transition. Without conclusive evidence, preserve blocked/inactive state and escalate; do not invent completion proof.
- A successful reset followed by a lost response must use the existing receipt/retry behavior, not an unreserved alternate Auth write. Preserve logs without passwords, tokens or keys.

## Local release verification

Run `npx.cmd tsc --noEmit` after, not concurrently with, `npm.cmd run build` (build regenerates `.next/types`). Run scoped ESLint for changed verifiers and connected auth/admin boundaries. Focused offline scripts: `verify-password-operations`, `verify-employee-password-setup`, `verify-admin-password-reset`, `verify-password-atomic`, `verify-password-authority`, `verify-password-require-change`, `verify-password-reactivation`, `verify-password-workflow-actions`, `verify-business-access`, `verify-legacy-admin-restriction`, `verify-admin-users`, `verify-permission-routing`, and `verify-calendar-operational-permissions` under `scripts/` (`node scripts/<name>.mjs`). Run `npm.cmd run verify:phase-2f-d3-production-recovery-ui`, `npm.cmd run verify:phase-2f-f2-production-completion-ui`, `node scripts/verify-calendar-operational-items.mjs`, and `git diff --check`.

These checks do not replace real post-migration SQL/RLS/Auth acceptance. Existing isolated password SQL results are documented in the [test runbook](../scripts/password-operation-test-runbook.md); no new environment or database execution is part of this preparation.
