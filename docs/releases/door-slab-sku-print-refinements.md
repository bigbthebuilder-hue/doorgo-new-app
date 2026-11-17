# Door Slab SKU and print refinements — release preparation

Baseline: `9b21cb97540f582f7a2b7ab0d0501c8914ce88d3`. Branch: `feature/slab-sku-print-refinements`.

## Prepared change

Reuse the existing line JSON metadata and label RPC for optional Door Slab SKU. No new inputs are required. Add the quick input alongside Door ID/Product Code with existing Save/permissions. Labels retain Code 128 encoding, per-copy IDs, borders and continuation; populate FRAME/SLAB only for a saved slab SKU, and use 11 pt Notes. Work Orders omit height-reduction amounts only; finished height and width rip remain in shared HTML/PDF output.

## Required approval / limitations

Migration `20261116200927_door_slab_sku.sql` is necessary and MUST receive separate approval before hosted application. It extends exactly two existing functions; no schema columns or operational records change. It must precede the new application. Browser/PDF and save/reopen checks require Windows Chromium because this Work runtime cannot launch Chromium (`socket() failed: Operation not permitted`). No claim of physical Zebra scanning.

SKUs are stored as complete strings without truncation. Print validation retains existing ASCII Code 128 and two-dot-per-module minimum at 203 dpi, including 10-module quiet zones. The example `zz_SO_DOOR_0123` and up to 29 Code-B characters fit; pure even-length numeric codes can be longer through existing Code C encoding. An over-width/unsupported value is saved intact but printing that selected line is blocked with a clear error. Continuation pages preserve printed text; they cannot make a single indivisible barcode narrower. No split/shortened code or reduced module width is silently substituted. Confirm this safe handling before release if longer mixed SKUs must also be printable.

## Verification

Passed locally: TypeScript, production build, save contract/adapter checks, three Node-only label cases, focused work-order document/PDF extraction. Disposable PGlite tests executed the migration against read-only captured current hosted save/validation function definitions, using synthetic tables, users and eligibility. Verified denials, exact string storage, line independence, retry/atomic conflicts, no parent updates in quick saves, stale aggregate preservation, no migration row rewrites, preserved owner/ACL and function rollback. Original hosted functions and accounts were not modified.

The old full Work Order suites fail on unchanged baseline too; these failures are not repaired here. Native authenticated hosted acceptance, browser layout/PDF cases and actual printer scans remain unverified.

## Cutover after approvals and verification

1. Confirm main/production still match baseline (or review intervening commits); preserve unrelated work.
2. Pass Windows label/browser/PDF, direct-input permission and loopback save/reopen checks using synthetic data. Review only focused files and keep generated results/hosted captures outside Git.
3. Capture exact current definitions/owners/grants of both target functions privately; check migration guards match; reconfirm administrator recovery and ordinary Save availability.
4. Apply only the approved pending migration atomically. Check unchanged ACL/owner and read-only compatibility; do not create test production jobs or overwrite real SKUs for acceptance.
5. Publish only the reviewed application commit with a normal push. Confirm exact SHA Ready/Production in `doorgo-new-app` and normal sign-in.
6. Verify saved/reopened optional SKU and print on controlled approved data; check one physical Zebra label and scan each symbol independently.

## Rollback

Restore prior Vercel application `9b21cb9` first. Prefer retaining the additive metadata function extension: old apps ignore the new key, and upgraded full-save protection preserves SKUs they cannot display. If database rollback is needed, check dependencies and privately captured owners/ACL, then restore the two prior function definitions transactionally with no CASCADE. Existing JSON values remain, but the old full-save contract will not protect slab keys during future old-editor saves. Therefore do not restore the old aggregate function while populated slab SKUs exist without an approved preservation/recovery plan. Reconcile only the exact applied migration-ledger entry after rollback is verified. No operational data deletion or bulk rewrite is part of release/rollback.
