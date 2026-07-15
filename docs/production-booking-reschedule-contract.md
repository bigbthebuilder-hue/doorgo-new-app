# Production booking reschedule contract

Phase 2F-E2B supplies the invisible guardrails for a later desktop drag-like scheduling experience. It adds no visible scheduling control. DoorGo remains operationally read-only until every replacement workflow is complete and parallel-tested against the current Apps Script DoorGo before final cutover.

Production has two first-version states: **Ready for production** and **Completed**. There is no Started state. A booking with `completed_at IS NOT NULL`, a locked booking, or any otherwise ineligible booking cannot move. Absence of completion data does not prove that older work was untouched, so a source date on or before Vancouver today requires the explicit “whole job was not started” acknowledgement. Partly completed work remains on its original date; remaining aggregate hours belong in Actual carry and are not assigned to a booking.

The database derives Vancouver today, the action type, actor identity/display-name snapshot, Shop Hours snapshot, and destination closure state. A destination before today is a `backdate` and requires a trimmed permanent reason. A destination with `dg_daily_capacity.is_closed = true` requires an explicit closed-date override. Unknown or overloaded capacity does not block a valid move; overload is a later UI warning. A normal destination stores neither a backdate reason nor a closure acknowledgement.

Command and booking advisory locks plus an exact booking-row lock enforce first-valid-move-wins behavior. Identical command retries return the existing audit row; materially different command reuse and stale source dates reject. The existing booking is updated atomically with one immutable history insert. No booking is cloned.

Completed-command identity is based only on the normalized original caller request. A retry returns the stored action, closure snapshot, dates, hours, timestamp, and move ID without re-reading mutable capacity, date classification, or booking state. The four-argument recovery-to-today RPC returns completed retries the same way, but a new recovery command rejects when Vancouver today is closed because that legacy signature cannot carry the required override confirmation.

Only `production=use` may call the mutation. Manager, Calendar, production-checkpoint, and company/location values provide no fallback. The authenticated Server Action revalidates the public Board, private Schedule, recovery page, and checkpoint page after success while returning only a narrow typed result.

E2B does not mutate Calendar fields, `dg_jobs.shop_date`, checkpoints, or capacity; it adds no Calendar or Apps Script runtime dependency. `/production-schedule` remains read-only with no drag-and-drop, button, picker, menu, dialog, prompt, or form.
