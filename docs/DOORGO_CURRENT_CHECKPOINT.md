# DoorGo Current Checkpoint

## Development state
- Branch: `feature/native-job-intake-glass-unit-builder`
- Previous governance checkpoint: `d7e2f6fcc64fccadda5b191be2e756fbe58a177a`
- This document records the documentation checkpoint with commit subject `Record J3C hosted recipient acceptance`.
- Nothing has been pushed, merged, deployed, migrated, or written to hosted systems.
- J3C Send is implemented locally with mocked runtime coverage and a production-isolated Playwright React component harness. Headless and headed Chromium scenarios passed, and human visual acceptance passed for desktop/narrow layout, Preview/Download/Print/Send controls, the compact Send panel, recipient selection and confirmation, dirty-state blocking, warning/blocker handling, loading, success/failure/partial/retry feedback, toast clarity, remaining on the current work order, and overflow safety. Hosted recipient-directory acceptance passed through the local application using read-only access to Supabase project `lwhrhnfnuutpisfpkadb` for the single existing active `jobs=use` manager account. No provider request or email occurred. Real-delivery acceptance and all hosted/production enablement remain pending; no production send workflow is active.

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
- J3C hosted recipient-directory acceptance through the local DoorGo application
  - normal authentication, active profile and explicit `jobs=use` access passed
  - manager status was present but did not provide permission authority
  - Preview, Download, Print and Send controls were available
  - exactly one expected active login recipient appeared with the correct display name and authoritative login email
  - no unexpected recipient, manual email entry, browser-visible service-role value, unrestricted Auth Admin data or environment secret appeared
  - no hosted application-data write, provider request or email occurred
  - the ignored synthetic local fixture includes `NON-PRODUCTION TEST – DO NOT BUILD OR SCHEDULE` and is not part of this checkpoint
  - `jobs=view`, `jobs=none`, manager-only, inactive requester/recipient, email-less recipient, multiple-recipient and hosted multi-page cases were not reproducible with the single-account directory; existing runtime and Playwright coverage remains their evidence

Manual acceptance passed. Minor visual polish is deferred.

## Immediate product direction
- Close complete native workflows before opening broad new feature areas.
- J3C local human visual acceptance and single-account hosted recipient-directory acceptance are complete. Controlled one-message real-delivery acceptance, provider-controlled test-sender eligibility and setup, received attachment filename/byte comparison, a permanent DoorGo-owned sender-domain decision, and all push/Preview/merge/hosted-configuration/Production boundaries remain unfinished.
- DoorGo email identity must remain independent from Central Builders. Do not require an `@centralbuilders.ca` sender, Central Builders DNS changes or an Outlook mailbox connection. Prefer a provider-controlled test sender for the first controlled real-delivery acceptance when the provider permits it. A permanent DoorGo-owned domain or subdomain and optional customer-branded sender domains are future work.
- Keep hosted writes disabled until the relevant end-to-end replacement workflow is approved and verified.
- Add durable repository guidance and automated regression coverage before substantial new domain work.

## Branding checkpoint
- Product name: `DoorGo`
- Descriptor: `Door Shop Operations`
- Tagline: `Measure. Build. Schedule.`
- Approved logo direction: simplified T/SD mark with navy transom, narrow navy sidelight, larger blue door, crisp geometry, and only a very slight corner radius.
- No handle hole.
