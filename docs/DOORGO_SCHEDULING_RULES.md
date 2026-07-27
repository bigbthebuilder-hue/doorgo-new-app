# DoorGo Scheduling Rules

## Core rules
- Production jobs are whole indivisible bookings. Never split one job across dates.
- Delivery and Customer Pickup are protected customer-commitment anchors and are never auto-moved.
- Prefer forward-only short stabilization moves.
- Do not chase isolated daily overloads when the broader schedule is healthy.
- Unresolved pressure may carry forward, but it must be shown clearly rather than presented as solved.
- Calendar-only, ambiguous, or unlinked items must not become freely movable automated work.

## Capacity and reserve
- Capacity is evaluated daily and weekly.
- Missing Shop Hours is incomplete, not zero.
- New-job booking reserve and existing-booking stabilization reserve are separate concepts.
- Preserve approximately 2 hours/day for small new work unless the approved setting changes.
- A genuinely larger whole booking may use protected reserve when enabled and when it still fits true capacity.

## Scheduling permissions
- `production=none`: no production access.
- `production=view`: read-only.
- `production=use`: approved create and reschedule actions, including permitted backdating with reason.
- Manager and calendar permissions do not provide fallback.

## Architecture and actions
- Do not rebuild proven review, live recheck, approval, dry run, execution, logging, return/undo, reconciliation, or rollback safeguards.
- Keep one clean visible workflow connected to the proven action engine.
- Initial booking for a job with no event is a separate controlled workflow.
- The new DoorGo app becomes the operational source of truth after an explicitly approved cutover.
- Google Calendar is migration/import history for the new app, not the future operational source of truth or a permanent second source of truth after cutover.
- Hosted cutover has not occurred unless the current checkpoint explicitly says otherwise. Until then, follow the checkpoint's read/write restrictions.
- Historical Apps Script and Google Calendar scheduling direction is continuity material only and must not override current new-app governance or detailed contracts.
