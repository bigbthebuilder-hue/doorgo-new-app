# Calendar stabilization — release preparation

2026-11-11. Based on released commit cd489ce6acf986f4ec4ffa94c64d5dae9a1e1960. Local commit preparation only; no push, deployment, production records or database changes are authorized by this note.

## Scope

Compact rows expose Actions through the existing permission-gated details panel. Days no longer expand. Initial scrolling is immediate, incoming board props no longer remount the session, and shared updates poll the visible weeks every ten seconds while idle. Focus/reconnect recovery, retry status and guards against overwriting local work are included. Existing operation permissions, location scope, capacity calculations and scheduling/database contracts remain unchanged. There are no migrations, dependency or environment changes.

Architecture chapters 05 and 06 describe the implementation. The existing development branch is codex/persistent-individual-door-ids. The prepared commit SHA is reported by Git after commit; do not create an additional commit merely to insert its own SHA here.

## Verification and acceptance

Prior implementation: 42 browser checks (36 existing Calendar checks and six stability fixtures), focused Calendar/permission/route/merge checks, lint, TypeScript and production build passed. These were fictional-data or mocked-transport tests, not hosted two-user acceptance.

Final acceptance pass added desktop (1600 x 1000) and mobile (390 x 844) checks and changed screenshot output to Playwright's portable per-test directory. Seven of eight stability/layout checks passed. Desktop layout passed. The mobile panel stays within the viewport, actions are enabled, days stay compact and opening/closing preserves scroll. However the mobile test fails because the document is 656 pixels wide in a 390-pixel viewport. The Needs Attention toolbar still has the baseline width/min-width/max-width/flex-basis of 40rem in both this candidate and cd489ce. This existing toolbar overflow is not repaired in this preparation task. The failing assertion is retained; mobile acceptance is not claimed.

Hosted acceptance was not performed. Computer Use stopped because it could not verify the current Windows browser URL with sufficient confidence. No authenticated session was inspected, no credentials or browser state were exported, and no internal or customer records were modified. The local candidate is not deployed; old production behaviour could not certify this candidate in any case. Permissions and location visibility are supported by unchanged authorization code and the prior mocked checks, not by new hosted acceptance.

## Decision

Current decision: NO-GO for controlled production release pending authentic two-user acceptance. The mobile blocker from c579e271099dbe9d59fae0273452e887eca8714b is resolved by the focused follow-up described below.

## Release sequence — separately authorized future work

1. Mobile acceptance is now passed at 320px, 390px and 1600px. Preserve those browser checks.
2. Establish two authorized signed-in sessions against this candidate in an approved environment, with a specifically approved internal item. Verify remote edits/moves/completion, protected edits and dragging, return-to-tab/reconnect recovery, Calendar View/Use, and cross-location Staff Away visibility/edit restrictions. Fixture sessions do not satisfy this gate. Do not infer permission to write production from this note.
3. Once acceptance passes and release is separately approved, recheck GitHub main ancestry, the exact candidate scope, publishing access and current production/rollback deployments. Stop on drift or missing rollback evidence.
4. Publish only the approved commit(s), without force push, using the existing production deployment route. Apply no SQL for this candidate.
5. Confirm production READY and exact SHA, perform approved read-only smoke/integrity checks and retain release evidence.

## Focused mobile correction after c579e27 — 2026-11-11

The correction is CSS-only in production: below 42rem viewport width, the Needs Attention toolbar fills the available width, keeps its controls on the first row and the preview/hidden-layer message on a second row, and bounds the dropdown to the toolbar. Desktop keeps the existing 40rem presentation. The same narrow-screen rule removes the calendar overlay's desktop sidebar offset so Add/Close controls remain inside the viewport. No controls are hidden, no page overflow is masked, and the inner Calendar retains its established horizontal scrolling.

Verification: 12 stability/responsive browser checks and all 36 existing Calendar browser checks passed (48 total). Empty and populated toolbar states, Expand/Collapse, Add/Close, compact actions, no horizontal page overflow, unchanged desktop toolbar width and preserved scroll were checked at 320px, 390px and 1600px. Initial new control tests exposed the existing off-screen Add Close button; correcting the mobile-only overlay offset resolved those failures. These remain fictional-data component tests, not hosted acceptance.

TypeScript and full lint passed; lint reports two existing warnings: an unused review-evidence variable in legacy transfer validation and an anonymous default export in the previously committed stability test configuration. The final production build passed, including its TypeScript check and route generation. No dependencies, queries, polling, permissions, location rules, calculations or customer records changed in this follow-up. Architecture chapters 05 and 06 record the responsive rule and tests.

Hosted status: the authenticated Windows browser route is now available and one signed-in session at the production Calendar was observed read-only. This supersedes the earlier browser-URL inspection failure above. However that session serves the released Calendar, not this unpublished candidate. The user confirmed that there is no test URL running the candidate. There is no identified second candidate session or specifically approved internal test item. No candidate hosted two-user, permission or location acceptance was performed; no production interaction was used as a substitute. This task does not authorize deployment, so hosted acceptance is blocked pending a separately approved way to run the candidate.

## Rollback

This candidate changes application code only. Before release, capture the then-current production deployment and verify it remains eligible for application rollback. The expected code baseline is cd489ce6acf986f4ec4ffa94c64d5dae9a1e1960, whose recorded DoorGo label deployment was dpl_3Ev8UmrMw8RoQb9qY7GbTumBahge; revalidate rather than assuming that record is current. If a separately authorized rollback is required, restore the verified prior application deployment. Retain both door-label database preservation patches and the expanded label RPC. Do not apply reverse SQL or reset/delete operational records. Review deployment auto-assignment after rollback before resuming releases.
