# DoorGo Work-Order Rules

## Output purpose
Work orders are production instructions, not customer summaries.

## Approved columns
`QTY | CONFIG | SIZE | THICK | DOOR TYPE | DRILL | HINGE | SWING | JAMB | SILL | W/S | NOTES / GLASS`

## Content rules
- Show machining, frame/slab cuts, required opening and glass measurements, warnings, blockers, and approved overrides.
- Omit generic job summary content.
- Do not print `Complete`.
- Do not duplicate slab size, frame geometry, divider, or glass information across sections.
- Show cut-to information only when a cut is present.
- Keep main values in individual cells.
- Keep each door line and its detail rows in one bordered group.
- Reserve right-side space for an optional diagram.
- Use larger readable text and cell wrapping rather than shrinking content excessively.
- Maintain footer clearance.
- Multi-page output must never silently omit a door line.

## Preflight states
- Complete: silent.
- Warning: requires acknowledgement and prints the warning.
- Manual Override: requires acknowledgement and prints the reason.
- Blocked: prevents preview/download/print/send.
- Glass Detail Needed: actionable warning and prints unless another blocker prevents output.

## Rendering
- Use one server PDF renderer for preview, download, print, and any future approved Send implementation.
- Landscape Letter is the current approved format.
- Preview, downloaded, printed, and any future sent documents must use the same saved aggregate document model.

## Current Send status
J3C Send has not been implemented. No production send workflow is active, and these future output rules do not authorize email or network delivery.
