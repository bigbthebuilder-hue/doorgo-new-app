# DoorGo Scheduling Continuity Log
> **Historical notice:** This file preserves continuity from earlier Apps Script and Google Calendar work. It is not current architectural authority. The current explicit task, root `AGENTS.md`, current checkpoint and workflow governance, and detailed new-app contracts take precedence. Do not use this history to override current new-app architecture.

**Coverage:** June 20, 2026 through July 3, 2026
**Purpose:** Project source material and end-of-chat continuity record.
**Scope:** Production scheduling, Production Board, Calendar integration, and related workflow decisions. Intake/work-order work is noted only where it affects scheduling.

---

## How to read this log
- **Verified** = tested or clearly confirmed in the project record.
- **Built / retained** = present in the working direction or source history, but may still need current-screen verification.
- **Intentional hold / hidden** = deliberately kept out of the normal UI; not discarded.
- **Next work** = genuine remaining work, not a request to rebuild something already proven.

---

# Day-by-day progress

## Friday, June 20, 2026
### Scheduling foundation and capacity rules
- Established the staff-capacity model:
  - Jordan: 8 scheduled hours / 7 productive hours per day.
  - Daniel: 8 scheduled hours / 5 productive hours per day.
  - Craig: 8 scheduled hours / 0 productive hours while off injured.
- Defined that scheduled workday hours and productive capacity are separate:
  - scheduled hours are used for partial-day absence deductions;
  - productive hours are used for production planning.
- Defined absence handling:
  - all-day staff absence deducts the full productive capacity for that staff member;
  - timed absence deducts proportionally;
  - names must match the staff roster.
- Added/defined daily capacity overrides as the authoritative total productive capacity for a date when entered.
- Confirmed capacity needs to be evaluated at both daily and weekly levels:
  - daily overload must be visible;
  - a daily overload within an otherwise open week is a balancing/review issue;
  - a weekly overage is the stronger warning.
- Established that production bookings before the current local date are treated as complete by default:
  - excluded from active capacity and Needs Attention;
  - still retained in audit/history.

**Status:** Foundational rules established and retained.

---

## Saturday, June 21, 2026
### No separate scheduling implementation milestone recorded
- No distinct Production Board or scheduling milestone was captured in the transferred project history for this date.

---

## Sunday, June 22, 2026
### No separate scheduling implementation milestone recorded
- No distinct Production Board or scheduling milestone was captured in the transferred project history for this date.

---

## Monday, June 23, 2026
### Production Review workflow and paperwork planning
- Continued Production Review design around actionable warnings rather than passive reports.
- Defined that Needs Attention should:
  - return the user to the relevant targeted review;
  - preserve filters/scroll where appropriate;
  - show a true “All caught up” state.
- Defined fulfillment conflict behavior:
  - fulfillment earlier than production opens a decision card;
  - options include moving production earlier, marking complete, revising fulfillment, holding/escalating, or overriding with a reason.
- Defined missing Shop Hours behavior:
  - amber / incomplete;
  - not treated as zero hours;
  - primary action is Add Shop Hours.
- Defined overload-day review behavior:
  - show planned, available, and over-by hours.
- Defined paperwork movement principles for later implementation:
  - compact All Moves history;
  - per-job move history;
  - reflow packets for large date shifts;
  - exceptions for held, priority, delivery conflict, or missing paperwork.

**Status:** Workflow design established; not all paperwork actions were intended for immediate implementation.

---

## Tuesday, June 24, 2026
### Production Board capability expansion
- Verified baseline Version 175:
  - Production Board planning labels;
  - in-board Planning Review panel;
  - 4-day delivery/pickup buffers;
  - corrected capacity warnings.
- Confirmed a prior loading-animation JavaScript change was rolled back; CSS loading styles may remain, but the removed shared JavaScript helper should not be reused without source inspection/testing.
- Verified baseline Version 179:
  - read-only chain-capacity preview;
  - capacity map;
  - later open capacity;
  - bridge dates;
  - pressure carried forward through the visible schedule.
- Reconfirmed key scheduler rule:
  - production jobs/calendar bookings are whole indivisible bookings;
  - no splitting a job across dates.
- Reconfirmed overload philosophy:
  - prefer useful breathing room over merely reducing a day to exactly zero overload;
  - still respect anchors and avoid excessively disruptive moves.

**Status:** Read-only pressure and forward-capacity planning was working; no Calendar moves enabled in that baseline.

---

## Wednesday, June 25, 2026
### Board-safe package preview and action safety groundwork
- Verified baseline Version 191:
  - read-only Board Capacity Ledger;
  - clear role-based ledger interpretation:
    - local overload;
    - pressure absorption;
    - neutral carry-forward.
- Verified baseline Version 195:
  - board-level package preview;
  - a proposed whole-booking move is accepted only if it does not increase remaining forward-only board pressure;
  - no Calendar moves enabled in that baseline.
- Verified baseline Version 197:
  - restored board-level package preview;
  - plan-quality explanations;
  - identified why flexible jobs could not fit;
  - preserved explicit forward-capacity shortage rather than hiding it.
- Established important package safety principle:
  - a package can be “board-safe” even when unresolved pressure must carry beyond the currently visible future capacity;
  - DoorGo must show this as unresolved/deferred overload, never as a solved schedule.

**Status:** Core recommendation logic and quality explanations were proven in read-only form.

---

## Thursday, June 26, 2026
### No separate scheduling implementation milestone recorded
- No distinct Production Board or scheduling milestone was captured in the transferred project history for this date.

---

## Friday, June 27, 2026
### No separate scheduling implementation milestone recorded
- No distinct Production Board or scheduling milestone was captured in the transferred project history for this date.

---

## Saturday, June 28, 2026
### Architecture and migration guidance
- Confirmed DoorGo should maintain a clean separation between:
  - saved job data;
  - generated work orders;
  - picking tickets;
  - production schedule views;
  - printed outputs.
- Confirmed Google Sheets mappings should be centralized so a later Supabase migration does not require changing user-facing behavior.
- This matters for scheduling because Calendar actions, job scheduling status, move history, and future paperwork workflows should be structured data—not inferred only from printed layouts or titles.

**Status:** Architecture decision retained for future work.

---

## Sunday, June 29, 2026
### No separate scheduling implementation milestone recorded
- No distinct Production Board or scheduling milestone was captured in the transferred project history for this date.

---

## Monday, June 30, 2026
### Product roadmap and scope boundary
- Confirmed DoorGo should become usable and saleable before adding the later shop/manual/training layer.
- Longer roadmap retained:
  1. Finish scheduling.
  2. Move the application to Supabase.
  3. Add training manuals/images.
  4. Link training content to work orders.
  5. Later digitize the shop/manual and Door Hangers Guide.

**Status:** Scheduling remains the immediate major product milestone.

---

## Tuesday, July 1, 2026
### Current project baseline and scheduler direction
- Verified intake/work-order rollback baseline:
  - V224 source restored and deployed as Version 226;
  - this is the safe rollback/starting point for intake/work-order work.
- Confirmed the B.P. intake/work-order pass was verified and should not be disturbed while scheduling work continues.
- Confirmed scheduler stabilization policy for genuine overload:
  - protect anchored booked jobs first;
  - shift eligible unanchored whole bookings later through short moves where appropriate;
  - unresolved overload may intentionally carry to the end of the reviewed period;
  - label it clearly as deferred/carry-forward overload.
- Confirmed two separate reserve concepts:
  - **new-job booking reserve** for automatic initial placement;
  - **existing-booking carry-forward/stabilization reserve** for reshuffling booked work.
- Suggested future defaults to validate:
  - new-job reserve: 2 hours/day;
  - stabilization reserve: separate, lower/configurable amount.
- Adopted naming preference:
  - new scheduling sheets/tables should use the `dg_` prefix where new objects are created.

**Status:** Scheduler policy was clarified; intake/work-order baseline protected.

---

## Wednesday, July 2, 2026
### New clean Board shell and package-review direction
- Production Board was loading visible future schedule data once into a browser-held snapshot.
- The intended Board architecture was clarified:
  - normal Board opening does one live Calendar read;
  - Immediate Stabilization and Later Backlog reviews work from the loaded Board snapshot;
  - normal Board opening must not automatically load historical lookback, delivery/pickup scans, document moves, or package calculations.
- Targeted live validation was retained for any eventual package execution:
  - package events;
  - source/destination dates;
  - affected anchors;
  - capacity on touched dates.
- Existing legacy Rolling Package Action controls were identified as duplicate visible workflow clutter:
  - Save;
  - Approve;
  - Final Check;
  - Execute.
- Decision:
  - hide/remove the duplicate old controls from normal Board view;
  - do **not** delete or rewrite the established execution safeguards until the clean Board UI reconnects to them intentionally.
- Board card wording direction was simplified:
  - confirmed fulfillment: “1 day before delivery,” “2 days before pickup,” etc.;
  - no usable fulfillment anchor: “No fulfillment date selected.”
- Important internal distinction retained but not exposed as shop-facing card language:
  - some bookings are linked DoorGo jobs with no fulfillment selected;
  - others may be Calendar-only/manual/unlinked placeholders;
  - both can show the same simple missing-fulfillment message to the shop.

**Status:** Clean UI direction established. Legacy action engine intentionally hidden, not discarded.

---

## Thursday, July 3, 2026
### Current-chat validation, corrections, and important reset
#### Board review behavior
- Initial Board load tested at approximately 23 seconds.
- Immediate Stabilization review tested at approximately 8 seconds.
- Later Backlog review tested at approximately 6 seconds.
- Current understanding:
  - Board load is the main live Calendar/snapshot load;
  - Immediate/Later review should calculate from the loaded Board snapshot rather than perform a broad second Calendar scan.
- Old visible Rolling Package Action panel was successfully removed from the normal Board screen.
- The new Immediate/Later panels remained visible and usable.

#### Package recommendation display
- Later Backlog review successfully displayed a concrete whole-booking recommendation:
  - Cash-Daniel Swift 1190860;
  - 2.0 hours;
  - Jul 15 → Jul 16;
  - Jul 15 changes from 1.0 hour over to balanced;
  - Jul 16 changes from 4.0 hours open to 2.0 hours open;
  - no fulfillment date selected.
- Confirmed that selecting a different local Planning Review date does not change the Board-wide Later Backlog package. This is correct:
  - Planning Review is a local day-detail view;
  - Later Backlog is tied to the Board’s actual pressure path.

#### New-job booking reserve test
- Future Auto-Booking Preview was tested.
- A reserve-rule correction was made and deployed:
  - “large job” qualification changed from comparing Shop Hours against the whole normal daily booking ceiling;
  - it now compares Shop Hours against the protected new-job reserve.
- Result verified with test job JOB-0048:
  - 4.0-hour booking;
  - 2.0-hour protected new-job reserve;
  - allowed to use reserve when enabled;
  - still must fit true daily capacity;
  - suggested earlier date Jul 16 when preferred Jul 23 could not fit.
- Small 1.3-hour Facet job remained blocked from using the protected reserve, as intended.
- This validates the intended distinction:
  - small jobs preserve reserve;
  - genuinely larger whole bookings may use reserve only when enabled and still under true capacity.

#### Critical process correction
- It was recognized that the project already had a proven scheduling action engine before this chat:
  - save recommended move for review;
  - recheck against current/live Calendar data;
  - approve;
  - dry run;
  - execute Calendar move;
  - record action;
  - return/undo individual or grouped executed moves;
  - reconcile if Calendar changed externally;
  - rollback protections if execution logging fails.
- The correct next direction is **not** to rebuild review, approval, execution, or undo.
- The clean Immediate/Later review screen must become the front end for the existing proven action engine.
- Initial booking of a job that does not yet have a Calendar event remains a separate genuinely new workflow.

#### Code-editing process decision
- Recent patches exposed that approximate or reformatted “Find this” blocks are unsafe in the large Apps Script files.
- Going forward:
  - inspect the latest current source before giving a patch;
  - provide one exact, uniquely searchable source snippet;
  - include enough nearby context for visual verification;
  - avoid partial/reformatted snippets and avoid parallel workflow additions.

**Status at end of day:**
- Clean Board review and package display are functioning.
- Existing action engine remains in source but hidden from normal Board use.
- New-job reserve behavior is verified.
- No new Calendar move was executed in this chat.
- Next work must reconnect the clean Board package recommendation to the existing proven action engine, rather than rebuilding it.

---

# Current state map

## Already built and proven / retained
- Whole-booking-only production moves.
- Delivery and pickup anchors protected from automatic movement.
- Capacity evaluation at daily and weekly levels.
- Carry-forward/deferred overload shown explicitly when it cannot be safely resolved.
- Board-safe move/package logic that avoids worsening forward pressure.
- Individual move review, live recheck, approval, final dry run, execution, logging, and return/undo workflow.
- Group return workflow for multiple previously executed actions.
- Calendar reconciliation for external changes.
- Rollback safeguards for execution/recording failures.
- Snapshot-based normal Board load direction.
- New-job reserve and separate stabilization reserve model.

## Intentionally hidden / not to rebuild
- Older Rolling Package Action interface and its duplicate visible Save / Approve / Final Check / Execute controls.
- The underlying action engine was intentionally retained and should be reused.

## Currently visible and working
- Production Board.
- Board Capacity Ledger.
- Immediate Stabilization review.
- Later Backlog review.
- Concrete Later Backlog whole-booking recommendation path.
- Future Auto-Booking Preview.
- New-job capacity / reserve preview behavior.

## Genuine remaining work
1. Reconnect the new clean Immediate/Later package recommendation to the existing proven package/action workflow.
2. Keep that workflow in one clean visible place; do not restore the old duplicate panel unchanged.
3. Add controlled initial Calendar booking for new DoorGo jobs:
   - preview one recommendation;
   - user confirms;
   - create one DoorGo-managed production event;
   - store durable event/job linkage;
   - no silent Calendar writes.
4. Continue testing reserve settings and real-world recommendation quality.
5. Add later paperwork/reflow handling only after actual scheduling action flow is being used reliably.

---

# Guardrails that must remain true
- Google Calendar remains the visual live production schedule.
- DoorGo is the planner, validator, action log, and controlled action layer.
- Never split a production booking across dates.
- Never automatically move Delivery or Customer Pickup anchors.
- Do not hide unresolved overload by forcing unrealistic moves.
- Existing protected anchored work is stabilized first in genuine overload.
- Calendar-only / ambiguous / unlinked items should not become freely movable automated work.
- Normal Board opening should remain light: one visible-schedule snapshot load, not broad unrelated scans.
- Package execution must use targeted live validation immediately before Calendar changes.
- Do not create duplicate review/approval/execute/undo paths.
- Do not touch verified intake, POs, Shop Date, Saved Jobs, or work-order details unless the task explicitly requires it.

---

# End-of-chat update template

Append a new section at the end of this file after each DoorGo chat:

```md
## YYYY-MM-DD — Chat update
### Work completed
-

### Verified / tested
-

### Decisions made
-

### Intentionally deferred
-

### Current risks or known issues
-

### Exact next starting point
-

### Do not disturb
-
```
