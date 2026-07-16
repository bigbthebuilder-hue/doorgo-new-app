# Production status events contract

`public.dg_production_status_events` is the earlier Phase 2F-A legacy
status-event structure. It remains present and unchanged, but it is not the
native completion/reopen audit authority introduced in Phase 2F-F1.

Native F1 completion and reopen events are stored only in
`public.dg_production_booking_completion_events`. No runtime workflow writes a
completion action to both tables. The legacy table must not be used for a new
completion/reopen implementation without a separate, deliberate migration
decision.

Completion belongs to a booking, not directly to its parent job, because one
job may have multiple legitimate production bookings.

## Authority boundary

- DoorGo owns completion state.
- Google Calendar and bridge processes must never overwrite completion events.
- Completion is qualitative. It never subtracts a booking's original Shop Hours
  from aggregate carry.
- A past booking without a completion event means **completion not confirmed**;
  it does not prove that the work is unfinished.
- Aggregate carry is independently governed by production flow checkpoints.

## Event vocabulary

- `completion_confirmed` confirms completion of the booking.
- `completion_reopened` returns the booking to completion-not-confirmed state.
- `completion_voided` records that an earlier event is invalid.

These legacy event rows are append-only. A correction inserts another event and
may reference the event it supersedes. The database validates that a superseding
event belongs to the same booking. Direct update and deletion are rejected so
the original actor, time, source, note, and metadata remain auditable.

`idempotency_key` is unique within `source_system` when present. This supports
future retry-safe office and tablet writes without merging unrelated sources.

## Time contract

Production dates and production-day boundaries use `America/Vancouver`.
`effective_at`, `recorded_at`, and `created_at` are stored as absolute
`timestamptz` values. Consumers interpret operational day boundaries in
`America/Vancouver`.

## Security and retention

RLS is enabled. No anon or authenticated mutation policy is provided, and their
direct mutation privileges are revoked. Future writes will use narrowly scoped,
authenticated functions introduced in a later phase. Audit events are retained;
ordinary workflows correct history by appending events, not by erasing rows.

Phase 2F-A provides storage contracts only. It adds no UI, write action, current
status snapshot on `dg_production_bookings`, or Calendar integration.
