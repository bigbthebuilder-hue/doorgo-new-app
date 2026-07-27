# DoorGo Permissions and Safety

## Permission model
Permission keys use `none`, `view`, or `use`:
- production
- production_checkpoints
- calendar
- jobs
- documents
- tools
- reports
- settings
- users

## General rules
- Do not add manager fallback for feature permissions.
- `view` is read-only.
- `use` permits the feature's approved write actions.
- Authorization must be enforced server-side as well as reflected in the UI.
- User profiles include active state, manager state, company location, and initial-password state.

## Native intake and documents
- `jobs=view` may preview and print work orders.
- `jobs=use` may preview, print, and save edits through currently implemented workflows.
- Future test-email or send behavior is governed by its approved detailed contract and must enforce its specified permissions, recipient controls, saved-source rules, and no-fallback boundaries when implemented.
- Current implementation status: J3C Send has not been implemented, no production send workflow is active, and this governance baseline authorizes neither email delivery nor hosted changes.
- Printing is read-only.
- Output is blocked when unsaved changes cannot be saved.
- Draft may save without a Sales Order.
- Confirmed requires at least one valid door line but does not require a Sales Order.
- Production readiness is a separate later state.

## Identifiers
- Use an immutable internal ID from first save.
- Show a temporary DoorGo reference until a BizTrack Sales Order is added.
- Work-order filename precedence:
  - with Sales Order: `Work_Order_<SalesOrder>.pdf`
  - otherwise: `Work_Order_<DoorGoReference>.pdf`

## Production booking creation
- Only `production=use` may create the first production booking.
- No manager or other-permission fallback.
- Only jobs created and managed in the new DoorGo are eligible.
- Salesperson and authoritative Shop Hours greater than zero are required.
- Only one active production booking may exist per job; move existing bookings rather than duplicate them.
- Capacity is checked automatically.
- Overload and closed dates require the existing explicit override flow.
- No silent scheduling writes.
