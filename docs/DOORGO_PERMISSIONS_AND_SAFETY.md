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
- `jobs=view` may preview, download, print and, when J3C is separately enabled, send saved work orders.
- `jobs=use` has the same document-output access and may save edits through currently implemented workflows.
- `jobs=none` has no work-order output access. Manager status provides no fallback, and J3C does not introduce a separate `documents` permission.
- J3C recipients are one or more active DoorGo login users resolved server-side by stable user ID. Arbitrary, customer and external addresses are prohibited.
- J3C uses the existing J3B renderer and sends one separate Resend message per recipient. Unsaved, stale or blocked jobs cannot be sent, and warnings require acknowledgement.
- Current implementation status: J3C Send is implemented locally; its automated, human visual, single-account hosted recipient-directory and controlled local real-email acceptance passed. Manager status was not used as permission authority. The repaired reacceptance used the sole controlled DoorGo recipient and Resend's provider-controlled test sender; the received attachment was byte-for-byte identical to the authoritative J3B Download and local revision-pinned J3C attachment. No production send workflow is active, and every Preview/Production configuration and enablement boundary remains separately unauthorized and pending.
- The single-account hosted directory could not reproduce `jobs=view`, `jobs=none`, manager-only, inactive requester/recipient, email-less recipient, multiple-recipient or hosted multi-page cases. Existing automated runtime and Playwright coverage remains the evidence for those cases.
- DoorGo email identity is independent from Central Builders: the controlled acceptance used Resend's provider-controlled test sender without an `@centralbuilders.ca` sender, Central Builders DNS changes or an Outlook mailbox connection. A permanent DoorGo-owned domain or subdomain and optional customer-branded sender domains are future decisions.
- Printing is read-only.
- J3C Send is blocked by any unsaved changes and never auto-saves. Preview, download and print retain their existing J3B saved-output behavior.
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
