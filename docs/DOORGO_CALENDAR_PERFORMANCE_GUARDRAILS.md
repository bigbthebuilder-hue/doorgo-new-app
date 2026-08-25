# DoorGo Calendar performance guardrails

These rules apply to the permanent operational Calendar and its supporting read paths.

- Do not perform per-card database or RPC enrichment. Resolve compact card identity in a bounded batch or list read.
- Render the normal Calendar from compact operational fields: identity, date/state, order, type, layer, hours, completion, linkage, and concurrency data.
- Load detail, history, fulfillment-family, and full Job aggregate data only when an explicit workflow needs it.
- Reconcile small mutations against only the affected item, day, capacity, or detail state; do not reload the full visible Calendar.
- Run independent server reads in parallel when their inputs do not depend on one another.
- Remove measured duplicate work and excess payload before adding caching or shadow state.
- Any potentially delayed action must acknowledge itself immediately at the initiating control, prevent duplicate activation, and restore the control after failure.

The initial Calendar range remains thirteen weeks. Continuous range expansion remains incremental, and loaded weeks remain mounted; DOM virtualization is a future scaling option, not part of the current contract.
