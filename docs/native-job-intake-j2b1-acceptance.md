# Native Job Intake J2B1 technical acceptance

J2B1 implements the contract-approved glass geometry domain and local aggregate persistence. It does not expose the final progressive editor or diagram UI.

- [x] Existing J1/J2A jobs load without changing job, line or revision identities.
- [x] Free-entry dimensions require explicit units and normalize to 1/16 inch.
- [x] SD, DS, SDS, SDDS, T/D, T/DD, T/SD, T/DS, T/SDS and T/SDDS calculate using the approved formulas.
- [x] One unit-level Glass or Panel sidelight type is enforced; mixed state is rejected.
- [x] Glass Detail Needed saves, reopens, archives, restores and duplicates with partial data intact.
- [x] Manual override requires Jobs = USE, a reviewable warning, reason and audit fields; hard blockers cannot be overridden.
- [x] Every approved J2B Shop Hours base is available, including SDDS 270 and T/SDDS 330 minutes.
- [x] Work-order detail and vendor copy are deterministic and omit stale or incomplete calculated output.
- [x] Header and lines remain one revisioned, atomic local-file aggregate.
- [x] J2B1 has no hosted intake, production-booking, fulfillment, scheduling or Calendar write path.
