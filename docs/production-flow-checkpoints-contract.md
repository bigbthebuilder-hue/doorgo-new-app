# Production flow checkpoints contract

`public.dg_production_flow_checkpoints` is the audit authority for confirmed
actual aggregate opening carry on a production date.

## Authority boundary

- An actual confirmed checkpoint overrides calculated opening carry beginning on
  its `production_date` and affects calculated flow forward.
- A later confirmed checkpoint creates a later authoritative reset.
- Completion events never change aggregate carry automatically.
- Google Calendar and bridge processes must never own or overwrite checkpoints.
- Production dates and checkpoint-day boundaries use `America/Vancouver`.

## Revisions and supersession

There is one logical `checkpoint_series_id` per production date. The first row is
revision 1. Correcting a checkpoint creates a new immutable revision in the same
series and links it to the prior revision. The earlier row becomes `superseded`;
it is not deleted or silently replaced. A row may instead be `voided` when its
observation must no longer be authoritative.

The future constrained checkpoint RPC is the only supported mutation path. It
must lock the production date and current confirmed revision, reuse that date's
existing `checkpoint_series_id`, and reject a request carrying a different series
ID. This RPC-enforced invariant prevents multiple logical series for one date
without introducing another table in Phase 2F-A. Ordinary writes remain
unavailable until that RPC phase.

Only one row with `checkpoint_status = 'confirmed'` may exist for a production
date. Series/revision pairs are unique, revisions are positive, and linked rows
must have the same series and production date. Opening carry is nonnegative and
stored to two decimal places. Snapshot columns preserve the calculated opening
carry, adjustment, and calculation version visible when the observation was
recorded.

Atomic insertion and supersession will be implemented later through a constrained
database function/RPC. Phase 2F-A intentionally provides no direct user mutation
path. Ordinary users must not update or delete checkpoint audit history.

That RPC must reject stale-revision edits and perform one transaction that:

1. locks or verifies the current confirmed revision;
2. changes the old revision to `superseded` and sets its
   `superseded_by_checkpoint_id`;
3. inserts the adjacent new revision as the sole `confirmed` row with a reciprocal
   `supersedes_checkpoint_id`;
4. rolls back completely if any status, link, revision, uniqueness, or concurrency
   check fails.

The reverse self-reference and reciprocal-link constraint trigger are deferred to
transaction end so the future RPC can reference the preallocated new checkpoint
UUID before inserting that row without weakening referential integrity.

## Security and retention

RLS is enabled. No anon or authenticated mutation policy is provided, and their
direct mutation privileges are revoked. Future office and tablet roles will use
narrowly scoped authenticated RPCs with actor identity derived by the server or
database. Audit revisions are retained permanently unless a later formal
retention policy says otherwise.

## Future flow anchoring

Phase 2E still calculates from the explicit July 6, 2026 migration baseline.
A later read-only phase will find the latest confirmed checkpoint on or before the
visible Board start, begin historical reads at that checkpoint, and load later
in-window checkpoints as additional resets. When no checkpoint exists, the July 6
baseline remains the fallback.

Phase 2F-A adds storage contracts only. It does not change Board queries,
normalization, UI, Supabase write behavior, Calendar, or Apps Script.
