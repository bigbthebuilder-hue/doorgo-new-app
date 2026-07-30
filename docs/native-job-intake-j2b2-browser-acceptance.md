# Native Job Intake J2B2 browser acceptance

Run against local/disposable intake persistence only. Confirm no hosted intake, production, fulfillment, scheduling or Calendar write occurs.

- [x] Exterior SD Glass calculates and persists through save/reopen.
- [x] Exterior DS visibly mirrors SD with the sidelight on the right.
- [x] Exterior SDS Panel shows one unit-level Panel choice and two panel positions.
- [x] Transom configurations reveal RO height and Transom Glass and render aligned engine-derived transom bars.
- [x] SDDS and T/SDDS use double-door topology and retain their approved Shop Hours.
- [x] Free-entry shop geometry accepts numeric inches with a permanent inch suffix and displays canonical 1/16-inch output; nominal door selectors retain feet/inches.
- [x] Leave Glass Detail Needed saves partial state and recalculation clears it when the engine returns Complete, Warning or Blocked.
- [x] Missing measurements are incomplete detail; invalid, unsupported or impossible entered measurements are hard blockers.
- [x] Fiberglass panel width is limited to 11 3/4 inches or 13 3/4 inches; custom Wood accepts other valid positive widths.
- [x] Unsupported Fiberglass panel width cannot be manually overridden.
- [x] Jobs = USE can apply/remove a reasoned reviewable-warning override; Jobs = VIEW remains read-only.
- [x] Archive/restore preserves J2B detail and identity.
- [x] Duplicate creates a new identity and requires fresh override approval; only equivalent lines merge.
- [x] Light and Dark modes retain diagram borders, contained labels and measurements; print is light.
- [x] Engine-derived doors, glass, panels, dividers, mullions and transom edges align without React geometry approximations.
- [x] Phone layout stacks without horizontal page overflow and keeps controls reachable.
- [x] Complete Glass, Complete Panel, detail-needed, warning and override state persist after server restart.
