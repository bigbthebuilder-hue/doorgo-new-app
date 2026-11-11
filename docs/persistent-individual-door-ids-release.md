# Persistent individual Door IDs — release readiness

2026-11-11. Local candidate on `codex/persistent-individual-door-ids`, based on `0dd04b13a2d96839ed6f4c293a5b240f39db91b7`. No hosted release is authorized by this note.

## Behavior and compatibility

Individual IDs persist by line/copy position, with shared Door ID fallback. Quantity reductions retain IDs for reuse. Print Door Labels saves pending changes before opening; failure blocks preview. Unapplied door-editor changes must first be applied or cancelled. The dialog uses saved values and performs no writes. Product-code barcode generation and 4 x 6 layout are unchanged.

The migration requires `20261111020255_save_native_door_labels.sql`. It transactionally patches only label-key preservation in the existing aggregate function and replaces the existing label RPC without changing its signature. No table/column, backfill, scheduling or customer-job change is included. Absent individual IDs read as an empty array; old scalar RPC payloads remain valid. Ordinary saves preserve stored individual IDs even from old clients. Retain both preservation patches during application rollback; reverting the database function can lose that protection.

## Migration review

- Authorization: authenticated-only execute, no PUBLIC/anon/service_role grant; auth UID, locked active profile, business eligibility, explicit Jobs use, nonarchived parent and matching parent/line required. Empty search path; objects qualified.
- Concurrency: profile-parent-line lock order matches ordinary saves; field expected/value checks reject stale changes, accept exact retries and preserve independent fields. The array is one conflict unit. Multiple line saves are separate transactions; successful earlier saves remain on later failure.
- Preservation: trailing copy positions survive quantity changes. Aggregate updates remove incoming label keys and restore latest stored keys; new lines accept initial metadata. Unknown JSON and geometry remain intact. Label-only saves do not increment parent revision or touch scheduling.
- Guard: migration aborts on unexpected aggregate definition and rolls back the transaction. Hosted definitions/grants and dependency order must be verified before any later authorized application. This review does not certify hosted state or run hosted advisors.

## Verification evidence

The preceding implementation report records contract/adapter, isolated PostgreSQL, real editor against synthetic backend, six browser cases, J2A, TypeScript, build and diff checks passing; lint had zero errors and one existing unrelated warning. These are prior-pass results, not all rerun in this short pass.

This readiness pass reran `node scripts/verify-door-label-save-contract.mjs`: save-contract and hosted adapter tests passed. `git diff --check` passed. Source review found no changes to barcode encoding or label page dimensions.

J3A and J3B static verifiers were rerun and failed: J3A expects `normalizeGlassDomainFields(line)` in the work-order model; J3B asserts that saved output derives current glass geometry from source inputs. The model and both verifier files are byte-identical to base `0dd04b1` (`git diff 0dd04b1 --` those paths is empty). The preceding pass also reproduced both failures on the untouched baseline. No work-order repair is included. Full J3A/J3B commands stop at those static assertions; their later contract stages are not claimed as passing.

## Controlled-release decision

GO for a separately authorized controlled release, with the known baseline J3A/J3B mismatch recorded. This is not a claim that every repository check passes. Before production: verify effective hosted function definitions/grants and migration prerequisite, capture rollback evidence, apply the reviewed migration before the application, then validate save/reopen/reprint and failed-save behavior using an approved synthetic/internal job. Stop if hosted definitions differ or targeted acceptance fails. Physical Zebra feed, alignment and scanning remain manual acceptance. No push, deployment, production SQL or customer-job changes occurred in this pass.