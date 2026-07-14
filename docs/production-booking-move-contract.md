# Production booking recovery move contract (Phase 2F-D2)

After final import and reconciliation, Supabase is the permanent production
schedule source of truth. Google Calendar is import-only: legacy calendar IDs,
event IDs, timestamps, and synchronization labels remain historical references
and are never read as authorization or updated by this workflow. The original
Apps Script application, Calendar APIs, dual writes, and synchronization queues
are not runtime dependencies.

This contract is not active until final cutover has disabled legacy writers and
the reviewed migration has been applied separately. This phase does not claim
deployment, migration application, or an operational production-recovery UI.

## Booking vocabulary and eligibility

`dg_production_bookings.production_date` is the native scheduling authority. It
remains legacy ISO `YYYY-MM-DD` text for this phase; database functions validate
the value strictly before converting it to `date`. A later migration may
normalize the column type independently.

`booking_kind = 'production'` identifies a real whole production booking.
`booking_kind = 'placeholder'` identifies a non-job scheduling hold and is never
eligible for recovery. Future creation/import paths must choose one value
explicitly; title, customer, sales-order presence, hours, and Calendar wording
are never placeholder heuristics. Existing imported `production` rows are the
approved real-booking baseline.

Recent reads and moves require a valid past production date, a nonempty durable
`booking_id`, valid known Shop Hours, `active` status, `confirmed` schedule
status, visible/unlocked state, no cancellation or deletion, `production` kind,
and no explicit `completed_at`. Absence of completion data means only
“completion not confirmed”; it never automatically declares work unfinished.
The employee must affirm: **The whole job was not started.**

A partly completed booking stays on its historical date. Its remaining hours
belong in the aggregate Production Carry Checkpoint. The future move UI must
warn: **Do not include this moved job's hours in Actual carry.**

## Permissions and reads

The read RPC accepts bounded explicit dates and at most 100 rows. It derives the
caller from `auth.uid()`, requires an active profile, and permits only
`production = view` or `production = use`. The move RPC permits only
`production = use`. Missing/`none`, manager status, `calendar`, and
`production_checkpoints` grant no fallback.

The read projection contains only the booking identity, production date, Shop
Hours, display title, optional job and exact imported sales-order identifiers,
booking kind/status/origin, explicit-completion and locked guards, and a boolean
historical Calendar-link indicator. It exposes no Calendar identifier, customer
contact/address, user identity, permission row, or command UUID.

## Atomic move and audit

The caller supplies a command UUID, exact booking ID, expected original date,
and true whole-unstarted acknowledgement. The database serializes command UUID
and booking identity, checks idempotency, locks the existing booking row, compares
the expected date, and revalidates eligibility. It updates only that row's
`production_date` and `updated_at`, then inserts one immutable
`dg_production_booking_moves` audit row in the same transaction. Shop Hours,
booking/job identity, Shop Date, status, schedule status, origin/ownership,
Calendar fields, checkpoints, and capacity rows remain unchanged.

The generic audit table requires only that its source and destination dates
differ, so a future separately controlled return operation can reuse it. The
current recovery RPC remains narrower: it accepts only a past source date and
derives Vancouver today internally as the destination.

The audit row stores the authenticated profile's trimmed display name as a
required server-derived snapshot. Its actor UUID is retained while the Auth
account exists, but the foreign key uses `ON DELETE SET NULL`; account removal
therefore preserves the immutable history and display-name snapshot. The UUID
is never returned by the move RPC or accepted from the browser.

An identical completed command retry returns its original audit result. Reusing
the UUID for another actor, booking, or expected date is a stable collision.
Another move that observes today returns already-moved; another changed date is
stale. No duplicate booking is inserted, and history retains enough original
date and timestamp context for a future separately controlled return workflow.
Undo is not part of this phase.

Capacity and overload never veto the move. After success, the Server Action
revalidates `/production-board`, `/production-checkpoints`, and the future
`/production-recovery` route. Board normalization then removes starts from the
old date, adds them to today, and recalculates rolling carry without creating or
altering an Actual carry checkpoint.
