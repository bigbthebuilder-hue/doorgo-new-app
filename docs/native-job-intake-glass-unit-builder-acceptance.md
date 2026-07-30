# Native Job Intake Glass Unit Builder acceptance

1. Interior intake is unchanged.
2. Exterior D/DD and decorative slab glass remain compact.
3. Configure Glass Unit opens the focused workspace.
4. The first sidelight appears on the latch side; swing changes flip DS/SD.
5. Two and three sidelights can be added on one side; opposite arrangements remain distinct.
6. A transom adds `T/`.
7. RO, Glass/Panel, diagram, calculation, warnings and actions are visible together.
8. Cancel preserves the parent draft; Use Configuration changes only that draft.
9. Apply Changes/Add Line remains required.
10. Existing SD/DS/SDS/SDDS lines reopen correctly.
11. DSS/DSSS produce ordered glass components; repeated Panel units calculate correctly.
12. Saved jobs reopen with the same composition.
13. Duplicate preserves composition and clears override approval.
14. Merge does not combine different physical layouts.
15. Work-order configuration, details and diagram match the saved result.
16. Notes/Glass does not regain the generic Glass marker.
17. At narrow width the builder occupies the full viewport.
18. The sidelight-type control and calculation use the same authoritative `sidelightType`; no visual fallback can mask a blank value.
19. Glass Detail Needed exposes only the explicit Leave Glass Detail Needed action; blocked geometry exposes neither apply action.
20. Material changes invalidate prior progressive acceptance, and Add/Update still enforces the existing J2B2 commit boundary.
21. The live schematic uses the shared composition projection and shows repeated left/right sidelights, dividers, double doors and transoms before measurements are complete.
22. RO fields retain focus through multi-character entry, and forward Tab follows the visible workflow without stopping at header Cancel.
23. Saved slab width and height load in the builder; height changes use the shared Prep compatibility rule.
24. Applied frame-glass configurations display their canonical resolved value in the compact editor.
25. The desktop builder uses up to 98vw by 96vh with sticky header/footer and internal scrolling.
26. Work-order detail groups identical sidelights and panels without changing saved component order.
27. Work-order PDF measurement reserves the upper-right diagram column before wrapping notes and detail text.
