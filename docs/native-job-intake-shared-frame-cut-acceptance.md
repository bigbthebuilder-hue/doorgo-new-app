# Native Job Intake shared frame/cut calculator acceptance

The shared jobs/domain calculator supports persisted non-glass Interior D, Interior DD, Exterior D, Exterior DD and B.P. lines. PKT and unsupported configurations return `Not Applicable`.

It returns typed `Complete`, `Incomplete`, `Blocked` or `Not Applicable` results with numeric inches, canonical inches-only display values, structured issues and deterministic shop-detail lines. Supported dimensions include actual/final slab size, jamb legs, header, exterior sill/threshold, frame width, DD core width, cut-down and resolved B.P. Finished Opening height. B.P. Finished Opening width is always Not Applicable.

Blank B.P. height resolves to applicable slab height plus 2-3/4 inches. Entered height is preserved and produces finished door height by subtracting 2-3/4 inches. Invalid/nonpositive/impossible values are blocked. Missing required non-B.P. inputs are incomplete and no dimensions are invented.

Calculated output uses the existing 1/16-inch shop formatter; nominal selector labels remain feet/inches. J2 calls the same calculator through its domain helper, and future J3A generation will call the shared calculator using repository-saved lines. No derived result is persisted solely for J3.

The calculator reads no repository, browser state, clock, random source, hosted service or operational integration. Tests verify determinism, frozen-input safety, repository-byte and revision stability, identity preservation, unchanged glass state and J2/direct result equality.
