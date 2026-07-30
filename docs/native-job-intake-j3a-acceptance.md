# Native Job Intake J3A technical acceptance

J3A generates a pure typed work-order document model from one repository-saved native job aggregate. The server-only boundary authorizes `jobs=view` or `jobs=use`, loads by immutable internal job ID and performs no write. `jobs=none` and manager-only access are rejected. Callers remain responsible for blocking dirty editor state; generation never auto-saves or accepts an unsaved aggregate payload.

The model records internal correlation ID and source revision separately from visible output. BizTrack Sales Order takes visible precedence over the DoorGo reference. PDF filenames use `Work_Order_<visible identifier>.pdf`, sanitize unsafe/path characters and contain no UUID, revision, customer/site or contact data.

Persisted PO values are trimmed, validated, deduplicated, sorted by length then lexical order and compressed using the deployed shared-prefix rule while retaining the full normalized list. The first-page header maps persisted customer/site, Phone/Email contact, salesperson, Shop Hours/source, fulfillment, notes, generated date, Shop Date and PO display.

Only Active lines are included, ordered by `lineIndex`; Archived and hidden Merged lines are excluded. Main rows expose the twelve approved columns. Non-glass D/DD and B.P. detail comes only from the shared frame/cut calculator. Glass/panel/transom detail comes only from persisted J2 glass calculation, units, panels, issues and override data. Incomplete or blocked geometry is never presented as finalized output.

Status presentation covers Complete, Glass Detail Needed, Warning, Blocked and Manual Override. Attached detail rows carry frame/cut, glass/panel, warnings/blockers and calculated/accepted override values with the approved reason.

Pagination is pure and weighted: first page capacity 22, continuation capacity 26. Each primary row weighs one; a detail block adds `max(2, ceil(nonblank detail lines / 3))`. Parent/detail groups remain intact, including oversized groups. Pages provide first/continuation metadata, weighted usage and `Page N of total` footers without DOM or CSS measurements.

Tests verify deterministic equality, saved-source permission enforcement, filename/PO behavior, header and line mapping, all major configurations/statuses, pagination boundaries and unchanged repository bytes, revisions, lifecycle, timestamps and identities. J3A adds no preview/print UI, PDF renderer, email adapter, hosted access or operational side effect.
