# Production booking completion contract (Phase 2F-F1)

Phase 2F-F1 adds the database and authenticated Server Action foundation for completing and reopening a whole production booking. It intentionally adds no visible completion controls. The new DoorGo remains a parallel testing system; the Apps Script DoorGo remains operational until final cutover.

## State and scope

A production booking is **Ready for production** while `completed_at` is null and **Completed** while `completed_at` is non-null. There is no Started or partial-completion state. Partly completed work stays on its original production date, remains uncompleted, and is represented quantitatively only through an aggregate Actual carry checkpoint.

Completion and scheduling are separate. Completing or reopening a booking changes only `completed_at`; it does not move the booking, change Shop Hours, change booking status or schedule status, update Calendar data or `dg_jobs.shop_date`, or change capacity/checkpoint data. Completed bookings remain visible through the existing Board/Schedule model and remain ineligible for E2B rescheduling.

## Authorization and trusted execution

Both Server Actions and both database RPCs require an authenticated active profile with exactly `production=use`. `production=none` and `production=view` cannot mutate completion. Manager status, Calendar access, `production_checkpoints`, and company/location data provide no fallback.

The Server Actions use the cookie-aware authenticated Supabase server client. They perform no direct table writes and use no service-role client. The `SECURITY DEFINER` RPCs derive the actor and display-name snapshot from `auth.uid()` and the active profile, repeat the exact `production=use` check, and expose only a narrow result.

## Immutable completion history

`public.dg_production_booking_completion_events` is a narrow audit table rather than an extension of the legacy `dg_production_status_events` table. The legacy table has incompatible event vocabulary, text idempotency, supersession semantics, and no explicit completion transition or actor-name snapshots.

The F1 table records only `completed` and `reopened`. It stores a unique command UUID, booking and production-date identity, the server-derived actor and permanent display-name snapshot, occurrence time, previous/resulting `completed_at`, and the normalized reopen reason. A reopen requires a trimmed nonblank reason of at most 500 characters; a completion requires a null reason. Transition checks enforce null-to-timestamp for `completed` and timestamp-to-null for `reopened`.

History is immutable. Direct application-role access is revoked and RLS is enabled without broad policies. The only permitted row update is the narrow `actor_user_id` non-null-to-null transition needed by `ON DELETE SET NULL`; every snapshot remains unchanged and deletion is rejected.

## Idempotency and concurrency

Each RPC locks the command UUID and then uses the existing E2B booking advisory-lock namespace before checking stored command history and taking `SELECT ... FOR UPDATE` on the exact booking. Reschedule, complete, and reopen therefore serialize on the same booking identity. The first operation revalidates and commits; the next operation sees the resulting locked state and either remains valid or returns a stale/ineligible error.

An identical retry returns the original immutable event without updating the booking or inserting another event. Request identity includes actor, booking, expected production date, action, and—when reopening—expected completion timestamp and normalized reason. A UUID reused for a different action or request is rejected. Stored retry results remain stable after later reopen/completion, schedule movement, or display-name changes. If Auth-user deletion clears the stored actor UUID, a later caller cannot claim that command; reuse is rejected while the display-name snapshot remains.

## Eligibility

Both operations require a real `booking_kind='production'` row with a strictly parseable current production date equal to the expected date. Deleted, cancelled, inactive, nonconfirmed, hidden, or locked bookings are ineligible. Completion requires `completed_at IS NULL`; reopening requires `completed_at` to match the caller's expected timestamp. Future production dates are not silently prohibited. Capacity, closures, Shop Hours, and whole-unstarted acknowledgement are not eligibility inputs.

Locked completed bookings cannot be reopened in this first contract, matching the existing scheduling lock boundary.

## Hours and later lifecycle work

Completion does not freeze Shop Hours. Current linked job hours remain the Schedule's displayed truth, including for historical completed bookings. Manual hours authority and door-line-driven recalculation are later work and are not implemented here.

Archive and restore are separate, later reversible job-lifecycle states. F1 adds no archive schema, permission, or controls, and restoring a future archived job will not implicitly reopen production.

## Server surface

The public Server Actions are `completeProductionBooking(request)` and `reopenProductionBooking(request)`. They validate untrusted requests and RPC responses, map only exact stable database tokens, sanitize service failures, and revalidate `/production-board`, `/production-schedule`, `/production-recovery`, and `/production-checkpoints` after success.

There are no Complete/Reopen buttons, dialogs, menus, or other visible status controls in F1.
