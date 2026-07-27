# DoorGo Testing and Release Discipline

## Test priorities
Automated coverage should be strongest around:
- canonical configuration parsing and legacy compatibility
- repeated sidelight/transom calculations
- slab, jamb-leg, frame, and cut calculations
- B.P. finished-opening behavior
- hinge normalization and printing
- preflight states and acknowledgements
- identifier and filename precedence
- permissions and absence of manager fallback
- production booking capacity, reserve, override, and duplicate prevention
- scheduling move safety and anchor protection
- PDF pagination and omitted-line regressions

## Change process
1. Confirm branch, checkpoint, and clean/dirty state.
2. Define goal, rules, out-of-scope items, and definition of done.
3. Inspect current implementation and existing tests.
4. Implement the smallest coherent change.
5. Run targeted tests, then broader tests appropriate to the risk.
6. Review the diff for unrelated changes and duplicated logic.
7. Provide manual acceptance steps.
8. Commit only when requested.
9. Do not push, merge, deploy, migrate, or perform hosted writes without explicit approval.

## Risk-based review
Use a separate review pass for:
- calculations
- permissions
- scheduling or hosted writes
- migrations and RLS
- PDF generation
- authentication
- destructive or irreversible operations

## Manual acceptance
Where relevant, test:
- desktop and phone layouts
- light and dark themes
- dedicated light print output
- read-only versus use permissions
- draft and confirmed states
- saved, dirty, and save-failure states
- preview, download, print, and future Send consistency when Send is implemented
- realistic multi-line door jobs and edge configurations
