# DoorGo Current Checkpoint

## Development state
- Branch: `feature/native-job-intake-glass-unit-builder`
- Latest local checkpoint: `d7e2f6fcc64fccadda5b191be2e756fbe58a177a`
- Commit subject: `Install DoorGo governance baseline`
- Working tree was clean after the checkpoint commit.
- Nothing has been pushed, merged, deployed, migrated, or written to hosted systems.
- J3C Send is implemented locally with mocked runtime coverage and a production-isolated Playwright React component harness. Headless and headed Chromium scenarios passed, and human visual acceptance passed for desktop/narrow layout, Preview/Download/Print/Send controls, the compact Send panel, recipient selection and confirmation, dirty-state blocking, warning/blocker handling, loading, success/failure/partial/retry feedback, toast clarity, remaining on the current work order, and overflow safety. Real provider credentials and a verified sender remain unconfigured, no real email has been delivered or accepted, hosted recipient-directory acceptance and enablement are pending, and no production send workflow is active.

Codex must verify all of the above against the repository before relying on it.

## Completed and manually accepted in this checkpoint
- Exterior Glass Unit Builder
- Canonical configuration parser/resolver
- Repeated left/right sidelights
- Transoms
- Single-sidelight latch-side swing behavior
- SD/DS/SDS/SDDS legacy compatibility
- DSS, DSSS, SSD, SSSD and transom variants
- Repeated glass and panel calculations
- Ordered live diagrams
- Slab width and height editing
- 7'0" and 8'0" exterior doors default Prep to Multipoint/MULTI
- Progressive Leave Glass Detail Needed workflow
- Canonical configuration display in compact intake
- Grouped repeated sidelights on work orders
- Reserved right-side work-order diagram space
- Corrected jamb-leg rule:
  - inswing = final slab height + 2 1/4"
  - outswing = final slab height + 2"
  - taller RO does not lengthen jamb legs
  - extra transom RO affects transom height only
- J3C human visual acceptance through the headed Playwright component harness
  - minor non-blocking polish deferred: simplify user-facing saved-revision wording
  - minor non-blocking polish deferred: consider adjusting the mobile toast position to reduce overlap

Manual acceptance passed. Minor visual polish is deferred.

## Immediate product direction
- Close complete native workflows before opening broad new feature areas.
- J3C local human visual acceptance is complete. Hosted recipient-directory acceptance, verified company sender/domain configuration, controlled real Resend delivery, received attachment filename/byte comparison, and hosted/production enablement remain unfinished.
- Keep hosted writes disabled until the relevant end-to-end replacement workflow is approved and verified.
- Add durable repository guidance and automated regression coverage before substantial new domain work.

## Branding checkpoint
- Product name: `DoorGo`
- Descriptor: `Door Shop Operations`
- Tagline: `Measure. Build. Schedule.`
- Approved logo direction: simplified T/SD mark with navy transom, narrow navy sidelight, larger blue door, crisp geometry, and only a very slight corner radius.
- No handle hole.
