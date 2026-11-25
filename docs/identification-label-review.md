# Identification labels - approved for release

Baseline: `26e6d8417423cb7299012630ff5fe6e796369a23`.

The existing generator now emphasizes sales order, customer, site, bold individual Door ID and bold description. Size/swing and configuration/jamb share compact rows. Manufacturing mode/material/sill and field headings are removed; inapplicable/empty rows disappear. Slab Only/MTM, explicit drilling, notes, all barcode encoding/dimensions/quiet zones and complete SKU values remain. Saved data, quantities, copy-ID precedence, selection and print controls are unchanged. No work-order, manufacturing, database or customer-order changes.

Normal labels start with larger typography. Selective fitting of long customer/address/ID text precedes continuation, retaining a 28pt ID and 20pt description floor. Existing 11pt optional notes are never truncated and may create explicit numbered continuation labels. The sample data includes all requested categories; bifold is a description in the existing free-text field, not a new configuration or manufacturing rule.

18 representative cases include prehung interior/exterior, transom, sidelights/transom, double, pocket/bifold, slab/MTM, custom/cutdown, three individual IDs, long names/address/descriptions, extensive notes, demanding long text/ID/notes/dual barcode, omitted notes and missing optional fields. `generate-identification-label-review.mjs` uses the actual generator, checks each normal page count and exact 288 × 432pt PDF dimensions, and exports a combined PDF/index.

Local contract, TypeScript, lint, production build and save-contract/adapter/work-order production-print regressions passed. Lint has the two existing warnings. Windows verification passed all 36 label/PDF browser tests, five editor tests and the synthetic Draft/Confirmed save/reopen check. All 18 actual-generator sample cases passed exact 4 x 6 PDF media-box, overflow, text preservation and page-count checks. The demanding combination fits one label; extensive notes deliberately use two. Browser rectangle dimensions allow 0.02px rounding tolerance; PDF dimensions remain exactly 288 x 432pt. Crowded labels reclaim paragraph/header spacing without changing font floors or barcode dimensions.

On November 25, 2026, the user visually approved the generated samples and authorized committing and releasing the scoped changes. No migrations or operational data changes are included. Physical printer feed and barcode scanning remain manual production checks.
