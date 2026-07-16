# Production completion UI contract

Phase 2F-F2 adds completion controls only to the private Production Schedule. A booking is **Ready** exactly when `completed_at` is null and **Completed** exactly when it is non-null. No Started, partial-completion, percentage, or remaining-hours state exists.

Only an active authenticated user with `production=use` receives the interactive Schedule and its completion controls. Ready bookings show **Complete** and existing eligible movement controls. Completed bookings stay muted and immovable and show **Reopen**. `production=view` receives the same read-only Schedule data without mutation-capable controls. Manager status, Calendar, `production_checkpoints`, and company/location data provide no fallback. The public Production Board remains read-only and imports no completion actions.

Complete requires confirmation that the entire production booking will be marked Completed on its current date, remain unarchived, retain its Shop Hours, and become immovable. The browser sends only a stable command UUID, booking ID, and exact expected production date to `completeProductionBooking`.

Reopen requires a trimmed 1–500-character audit reason. Its displayed character count, validation, command identity, and request all use that same normalized reason. The browser sends only a separate stable command UUID, booking ID, exact expected production date, exact server-returned `completed_at` string, and normalized reason to `reopenProductionBooking`. The timestamp string is passed through without JavaScript `Date` conversion.

An unchanged retry retains its command UUID. A material reopen-reason change rotates the reopen command identity; refreshed booking/date/completion state starts a new component session and therefore a new command. Complete and Reopen never share command UUIDs. Success and stale/current-state failures refresh from server authority; the UI does not directly write Supabase state or keep a final optimistic completion state.

Completion and movement are separate actions. A Ready booking may move under the existing schedule rules or be completed, but one card cannot start Move and Complete simultaneously. Reopening does not move a booking; refreshed Ready state restores movement only when the existing movement rules allow it.

Completion does not archive a job, reopening does not restore an archived job, and neither action freezes or changes Shop Hours. Calendar data, `dg_jobs.shop_date`, capacity, checkpoints, and archive data remain outside this UI contract. Live authenticated mutation and responsive browser verification are deferred until the F2 branch is deployed for controlled testing.

Permanent behavioral verification covers permission-scoped card rendering, completed-card immovability, duplicate submission, retry identity, stale-response association, and authoritative refresh outcomes.
