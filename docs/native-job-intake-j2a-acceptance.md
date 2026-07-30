# Native Job Intake J2A acceptance checklist

Use only local disposable intake with `DOORGO_LOCAL_INTAKE_ENABLED=true` in a non-production runtime.

- Load and reopen drafts created by J1 without editing the JSON file.
- Add and persist an Interior D line.
- Add and persist an Exterior D line, including visible 2'0" and 4'0" width choices.
- Add a PKT line and verify its no-swing/no-jamb/no-hinge behavior and deployed prep choices.
- Duplicate a line, merge equivalent active lines, and reorder active lines; reopen and verify stable identities/order.
- Archive and restore a line; inspect it in the separate Archived Lines section.
- Explicitly change Draft to Confirmed Job with a valid active line, then return it to Draft.
- Verify confirmation with zero active lines, final-line archive, and final-line invalidation are blocked clearly.
- Stop and restart Next.js and confirm the complete aggregate remains available.
- Sign in with `jobs=view` and confirm active/archived line details are visible without any mutation or lifecycle controls.

J2A does not write hosted jobs, create production bookings or fulfillment records, or mutate Calendar/scheduling data. Glass, sidelight and transom calculation remains deferred to J2B.
