# DoorGo Domain Rules

## Authoritative calculations
- Use one pure shared authoritative non-glass frame/cut calculator.
- Intake and work-order generation must call the same calculator.
- The calculator uses saved line inputs and returns deterministic structured results.
- Missing or invalid inputs return structured incomplete or blocker results.
- Do not persist duplicated derived output unless an explicit audit requirement is approved.

## Dimensions
- Store and calculate in inches.
- Nominal door sizes may use standard feet-and-inches notation, such as `3'0" × 6'8"`.
- Shop geometry uses inches-only notation unless a higher-authority detailed contract explicitly states otherwise. This includes rough openings, finished openings, cut sizes, jamb lengths, glass and panel sizes, and comparable calculated or free-entry dimensions.
- Where the detailed contract permits free-entry shop dimensions, accept its approved whole-number, fraction, hyphenated-fraction, and decimal inch formats without broadening that input contract.
- Allow enough space for handwritten-style fractional entry where applicable.

## Jamb legs
- Exterior inswing jamb leg = final slab height + 2 1/4".
- Exterior outswing jamb leg = final slab height + 2".
- Taller rough opening does not lengthen jamb legs.
- Extra rough-opening height for a transom changes transom height only.

## B.P. lines
- Finished Opening width is not applicable.
- Finished Opening height is optional.
- When entered, door cut height = Finished Opening height - 2 3/4".
- When omitted, assume Finished Opening height = applicable final slab height + 2 3/4", so there is no additional height cut.
- Work orders always show B.P. Finished Opening height.
- PKT and B.P. print no hinge.

## Exterior glass units
- All sidelights in one unit share one type: Glass or Panel.
- Fiberglass sidelight panels are limited to 11 3/4" or 13 3/4".
- Wood panels may use a custom positive width.
- Repeated identical sidelights may be grouped on work orders while preserving calculation accuracy and ordered diagram meaning.
- Diagrams default on for sidelights and transoms; they are not needed for plain doors.
- A user may leave Glass Detail Needed through the approved progressive workflow.

## Door sizing and preparation
- Standard 6'8" work-order size prints width only.
- 7'0", 8'0", and custom sizes print width × height.
- Exterior 7'0" and 8'0" doors default Prep to Multipoint/MULTI.
- PKT door construction is Interior Wood only.
- PKT drill options: Round Weiser, Reg Emtek, LRG Emtek.

## Hinge rules
- Hinge colors: blank, L1, C15, C4, 10B, C26, 26D, SS.
- Interior hinge types: REG, BB.
- Exterior hinge types: REG, BB, NRP, BOM.
- PKT and B.P. print no hinge.
- Legacy `C15 NRP` normalizes to `C15` color with NRP type handling.
- Exterior outswing SS rules remain authoritative.
- Printed forms:
  - REG + job hinge color
  - BB + job hinge color
  - NRP + job hinge color
  - BOM + job hinge color
  - exterior outswing uses SS as required
