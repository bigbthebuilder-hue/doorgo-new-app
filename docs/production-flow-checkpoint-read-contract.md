# Production flow checkpoint read contract (Phase 2F-C4A)

Direct authenticated reads of `dg_production_flow_checkpoints` remain unavailable. Two restricted, authenticated read RPCs provide only the fields needed by the future checkpoint page, including the opaque checkpoint identifier and revision required for stale-revision-safe C3 mutations. User UUIDs, series links, reciprocal revision IDs, and authorization details are excluded.

Active users with `production_checkpoints = view` or `use` may read a selected day's revisions and bounded recent history. Only `use` may mutate through the existing C3 actions. Manager status and the broad `production` permission provide no fallback.

Internal checkpoint states are translated into `confirmed`, `revised`, or `removed`; the stored calculated-carry snapshot remains nullable. Staff identity is limited to a nullable display name.

The read migration was applied and its permission, validation, lifecycle, and rollback behavior was verified live before UI implementation.

## Private checkpoint page

`/production-checkpoints` is a private, phone-first selected-date workflow. Authentication, active-profile state, password setup, and the dedicated `production_checkpoints` permission are resolved before checkpoint or calculated-carry reads. `none` and missing access are denied; `view` may read without mutation controls; `use` may confirm, revise, remove, and reconfirm through the existing C3 Server Actions. Manager status and broad `production` access provide no fallback.

The selected date defaults to the current `America/Vancouver` date and cannot be in the future. Today uses the existing trusted Production Board calculation only after authorization; a server-only scalar helper returns just the final calculated opening carry or null. No Board model, booking, job, capacity, chronology input, or credential reaches the page. A past date uses the calculated snapshot recorded with its newest revision. A past date without revisions displays `Unavailable` and submits null rather than zero.

Current state comes only from the newest selected-date revision: no history offers Confirm, confirmed offers Revise and Remove, and removed offers Reconfirm. Selected-date and bounded recent histories show `Confirmed` for the active current revision, `Removed` for a removal revision, and `Previous version` for every older non-removal revision. This presentation avoids implying that an employee explicitly performed a revise operation. The opaque `checkpoint_id` remains internal typed concurrency state required by C3 and is never displayed; the read RPC returns no separate command or idempotency identifier.

Each form keeps one browser-generated command UUID stable across unchanged recoverable retries and starts a new identifier only for a materially changed or completed operation. Success feedback appears once for the completed operation and is not initialized on a clean refresh; recoverable errors stay with their operation. The internal `production_checkpoints` permission key is displayed as `Production checkpoints` on the account page. Errors are mapped to plain language, internal database details are not rendered, and the public `/production-board` route and its behavior remain isolated and unchanged. This section documents local implementation only; it does not claim deployment or production UI verification.
