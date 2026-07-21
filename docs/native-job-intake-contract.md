# DoorGo native Job Intake contract (Phase J0)

Status: contract capture for review; no native write design is approved by this document.

## 1. Authority and boundaries

### A. Current deployed Apps Script behavior

The authoritative deployed references are `.local-reference/current-deployed-intake/doorgo_intake_reference/Code.gs` and `Index.html`. The current application stores jobs in the `Jobs` sheet and lines in `Door Intake`. `Code.gs` identifiers `JOB_HEADERS`, `DOOR_HEADERS`, `DGData.jobs`, `DGData.jobLines`, `saveJobToSheets_`, and `saveDoorLinesWithoutDeleting_` define the persisted Sheets contract. `Index.html` identifiers `currentJob`, `newJob`, `readJob`, `payload`, `buildLine`, `validateJob`, `saveCurrentJob`, and `openJob` define the active browser contract.

### B. Current hosted Supabase structure

Supplied hosted facts, not independently queried in J0:

- `public.dg_jobs`: primary key `job_id`.
- `public.dg_job_lines`: primary key `line_id`; `job_id` references `dg_jobs(job_id) ON DELETE CASCADE`; unique constraint `(job_id, line_index)`.
- RLS is enabled but not forced on both tables. Neither table currently has an RLS policy.
- The deployed mirror mapping is defined by `dgNormalizeJobForSupabase_` and `dgNormalizeJobLineForSupabase_`.
- Native hosted writes remain disabled. The Next.js service-role trusted-read client must never be used for intake writes.

### C. Required native Next.js behavior

The native workflow must reproduce the reviewed active behavior deliberately, preserve saved representations needed by work orders, enforce `jobs` permissions on the server and database boundary, and keep J1-J4 persistence local/disposable. Native line identity must be stable and independent of order. A complete job-plus-lines save must eventually be atomic.

#### Approved native identity invariant: pre-BizTrack drafts

- DoorGo jobs will commonly be created before a BizTrack Sales Order exists, and must be saveable without one.
- On first save, DoorGo assigns a permanent, hidden, immutable internal job identity. That relational identity is never a visible business number and is never a fake, placeholder, or temporary Sales Order number.
- Before a BizTrack Sales Order exists, DoorGo also assigns a temporary human-readable DoorGo reference. It is the primary visible job identifier only while the Sales Order field is empty.
- Temporary DoorGo references are permanent audit/traceability attributes even after they stop being normally displayed, and they must never be reused.
- The later BizTrack Sales Order number is a separate nullable, editable business identifier. Adding or correcting it must not change the internal job identity.
- Any active user with `jobs = use` may add or correct the BizTrack Sales Order number.
- Once present, the BizTrack Sales Order becomes the primary visible identifier in job lists, Job Intake, search results, work orders, production-readiness displays, and later scheduling displays. The temporary DoorGo reference then disappears from normal UI and printed documents but remains stored for audit, traceability, recovery, and historical-reference resolution.
- Every door line has its own permanent identity and remains related to the permanent internal job identity, independent of line order and independent of any Sales Order change.
- Neither the temporary DoorGo reference nor the BizTrack Sales Order is the native relational primary key.
- Mere existence of a draft without a Sales Order must not make it Production Board eligible and must not create production, fulfillment, or Calendar records.
- Hosted `dg_jobs.job_id` is currently both the primary key and the deployed Sales Order / Job ID. It therefore does not properly represent the approved native identity model. Designing the internal-job-ID key and separate nullable Sales Order column is a required J5 migration decision; no migration is designed or approved in J0.

#### Approved confirmation and readiness invariant

- A DoorGo job may become `Confirmed Job` before a BizTrack Sales Order exists. Confirmation records the business/customer commitment; it does not mean that downstream BizTrack entry is complete.
- BizTrack entry is a separate downstream milestone. The question “Does confirmation require a Sales Order?” is resolved: **No**.
- Confirmation and production readiness are separate states. Neither saving nor confirming a job automatically creates production, fulfillment, or Calendar records.
- Production readiness criteria remain subject to later approval and may require a BizTrack Sales Order, salesperson, valid authoritative Shop Hours, complete required intake information, and approved fulfillment requirements.
- Adding BizTrack information later never changes the permanent DoorGo internal job identity or the identities/ownership of its door lines.
- DoorGo must remain compatible with a future BizTrack API integration without making BizTrack the primary identity. A future integration may attach a Sales Order number, durable external BizTrack identifier, synchronization state, and last-synchronized timestamp. J0 does not design or create those hosted columns.

#### Approved Draft and Confirmed Job minimum

- A `Draft` may be saved with zero door lines.
- Changing a job to `Confirmed Job` requires at least one valid door line.
- For this gate, a valid door line is one that passes the deployed door-line validation contract: mode, configuration, width, height and quantity are present/valid; custom slab dimensions pass when applicable; a RIP jamb has a completed target size; and required RO/glass validation passes when applicable. The detailed authority is `validateDoor_`, `validateCustomSlabLine_`, `validateLineForCommit`, `calculationIsBlocking`, and the rules in §§3, 4 and 7.
- Confirmation still does **not** require a BizTrack Sales Order, salesperson, Shop Hours, fulfillment date, production booking, or Calendar record. Those are separate production-readiness concerns, not confirmation prerequisites.
- This intentionally differs from deployed `validatePayload_`/`validateJob`, which require at least one line for every save and whose browser additionally requires Salesperson for a confirmed job. Native code must preserve the deployed **line validity** rules while applying the approved native lifecycle gate at Draft-to-Confirmed transition.

#### Approved J2 door-line and transition permissions

- `jobs = view` may open jobs and inspect every active and archived door line. It may not add, edit, duplicate, merge, reorder, archive, restore or remove lines, and it may not change lifecycle state.
- `jobs = use` may add and edit door lines; duplicate lines; merge equivalent lines where the deployed contract permits; reorder lines; reversibly archive/remove lines; and restore archived lines.
- `jobs = use` may change `Draft` to `Confirmed Job` when at least one valid **active** door line exists, and may return `Confirmed Job` to `Draft` for corrections. Returning to Draft preserves the permanent job identity and every line identity.
- Manager status grants no fallback for either door-line operations or lifecycle transitions. The explicit `jobs` permission remains authoritative.
- J2 removal is reversible/archive-style. The J2 user interface must not permanently delete a door-line record.
- Archived lines never satisfy the confirmation minimum. A Confirmed Job may remain confirmed only while at least one valid active line exists.
- If archiving/removing a line would leave a Confirmed Job with no valid active door lines, J2 must block that action. If editing the final valid active line would make it invalid, J2 must block the save. The app must not automatically return the job to Draft; it must clearly explain that the user must first return the job to Draft or add another valid active door line. The blocked operation preserves every job and line identity.
- No door-line operation or Draft/Confirmed transition creates a production booking, fulfillment record, Calendar record or scheduling mutation.

#### Approved salesperson behavior

- A new job defaults Salesperson from the signed-in user's configured sales identity.
- Any active user with `jobs = use` may edit or reassign Salesperson; this is not restricted to managers or to the initially defaulted user.
- The saved Salesperson is a job-level historical snapshot. Later changes to user/profile sales identity do not rewrite existing jobs.
- Missing Salesperson is allowed for both Draft and Confirmed Job. It blocks production readiness but not saving or confirmation.
- The configured sales-identity source and administration model still require a later contract/schema decision; authentication identity alone must not be silently treated as Salesperson.

### D. Open decisions

The pre-BizTrack identity, confirmation-without-Sales-Order, confirmed-job minimum-line, salesperson behavior, J2 door-line permission model, Draft/Confirmed transition permissions, last-valid-active-line behavior, and J2 local aggregate identity/order/atomicity/concurrency/retention choices are resolved by the invariants above. Remaining decisions include later draft abandonment/purge policy, production-readiness gate, sales-identity configuration, hosted internal-ID and line-ID representation, hosted reorder mechanics, Phone/Email storage, job-level archive permissions, database grants/RPCs, and hosted activation (§12). This document records alternatives; it does not silently decide them.

## 2. Job-header contract

The `Jobs` sheet order is fixed by `JOB_HEADERS`. `saveJobToSheets_` trims strings, preserves `Created At` on update, writes `Updated At` on every save, and calculates derived values before writing. In the deployed workflow, `validatePayload_` requires Customer or Site/Address and at least one valid door line, while browser `validateJob` additionally requires Salesperson for a `Confirmed Job`. The approved native workflow changes only the lifecycle gates: Draft may save with no lines; Confirmed requires one deployed-valid line; Salesperson is optional until production readiness.

| UI label | Payload/property | Sheet header | Hosted destination | Type/default | Requirement, validation, normalization | Visibility/editability and work-order use | Gap |
|---|---|---|---|---|---|---|---|
| Sales Order / Job ID | `jobId`; `originalJobId` | `Job ID` | currently `dg_jobs.job_id` | text; blank until save | **Deployed:** trimmed; blank generates `JOB-####`; duplicate target rejected; original ID permits update/rename. **Native approved:** separate nullable/editable BizTrack Sales Order; `jobs=use` may add/correct it; never a relational key. | Primary visible identifier in lists, intake, search, work order, readiness and future scheduling once present. | Hosted schema lacks separation from internal identity and temporary DoorGo reference. Required J5 migration decision. |
| Temporary DoorGo reference | deployed generated `jobId` partly resembles this role but is not separate | no separate header | no suitable separate column in supplied schema | human-readable, assigned before/with first save; immutable and never reused | Visible only while BizTrack Sales Order is blank; hidden from normal UI/print afterward but retained for audit, traceability, recovery and historical lookups. Exact format/allocation is a J1 implementation detail. | **Required J5 schema design.** Must be distinct from relational key and Sales Order. |
| Internal Job ID | no deployed separate property/header | none | no suitable separate native key in the supplied schema | permanent opaque identity assigned on first native save | Hidden and immutable; never derived from or changed by either visible identifier. All native job/line relationships use it. | Persistence/route identity only; not a normal visible or printed identifier. | **Required J5 schema design.** Current `dg_jobs.job_id` conflates identity with a visible number. |
| Customer | `customer` | `Customer` | `dg_jobs.customer` | text; `''` | Trimmed; Customer **or** Site required. | `customerInput`; Saved Jobs and work-order header. | None known. |
| Site / Address | `siteAddress` | `Site/Address` | `dg_jobs.site_address` | text; `''` | Trimmed; Customer **or** Site required. | `siteInput`; ledger and work-order header. | None known. |
| Phone | `phone` | `Phone` | no dedicated column; `raw_job.phone` | text; `''` | Trimmed; no format validation. | `phoneInput`; ledger contact and work-order Contact line. | **Missing hosted column.** |
| Email | `email` | `Email` | no dedicated column; `raw_job.email` | text; `''` | Trimmed; no email-format validation. | `customerEmailInput`; ledger contact and work-order Contact line. This is customer contact, not worker recipient. | **Missing hosted column.** |
| Salesperson | `salesperson` | `Salesperson` | `dg_jobs.salesperson` | text; `''` | **Deployed:** trimmed; browser requires it for confirmed jobs, server does not independently enforce. **Native approved:** default from signed-in user's configured sales identity; optional for Draft/Confirmed; any `jobs=use` user may edit/reassign. | `salespersonInput`; readiness/ledger and work-order Sales line. Saved value is a historical job snapshot and is not rewritten by later profile changes. Missing value blocks production readiness only. | Configured sales-identity source/admin model requires later design. |
| Job Stage | `jobStage` | `Job Stage` | `dg_jobs.job_stage` | enum-like text; deployed default `Confirmed Job` | `normalizeJobStage_` maps only exact `Quote / Not Confirmed` to quote; everything else becomes `Confirmed Job`. Native Confirmed means business/customer commitment, requires at least one deployed-valid line, but does not require Sales Order, Salesperson, Shop Hours, fulfillment, booking or Calendar record. | `jobStageInput`; quote suppresses deployed production readiness/capacity. Native confirmation alone must not create downstream records or imply readiness. | Native Draft representation, exact database constraint and separate readiness representation remain to design. |
| Status | `status` | `Status` | `dg_jobs.status` | text; `''` | `Completed`/`Closed` normalize to `Archived`; `Open` normalizes blank. Archive=`Archived`, delete=`Deleted`, restore=blank. | Lifecycle-managed, not a normal intake field; affects ledgers and readiness. | Native lifecycle values need approval. |
| Active | `active` | `Active` | `dg_jobs.active` | text; new default `Yes` | Archive=`No`, restore=`Yes`, delete=`Deleted`. Existing archived state is preserved during ordinary update in specified cases. | Lifecycle-managed; not printed. | Text rather than boolean; native compatibility rule needed. |
| Job Notes | `jobNotes` in payload; `notes` when loaded | `Notes` | `dg_jobs.notes` | text; `''` | Trimmed; no length rule in deployed code. | `jobNotesInput`; printed in header. | Native length limit undecided. |
| Job Hinge Color | `hingeColor`; loaded as `hingeColor` | `Hinge Color` | `dg_jobs.hinge_color` | text; `''` | Trimmed. Work-order normalizer strips legacy `NRP`; choices include L1, C15, C4, 10B, C26, 26D, SS. | `hingeColorInput`; used with each line's hinge choice. | None known. |
| Shop Hours | `shopHours` | `Shop Hours` | `dg_jobs.shop_hours` | numeric text in Sheets; nullable number in mirror | Manual typed value wins; otherwise derived and rounded to quarter-hour. Unknown estimate clears it. | `shopHoursInput`; editable; header, readiness and scheduling gate. | Native numeric scale/range needs confirmation. |
| Shop Hours Source | `shopHoursSource` | `Shop Hours Source` | `dg_jobs.shop_hours_source` | `Estimated`, `Estimate incomplete`, `Manual`, or blank | Manual value sets `Manual`; calculated complete sets `Estimated`; unknown rule sets `Estimate incomplete`. | Support text from `refreshShopHoursEstimate`; not printed. | Exact database constraint unknown. |
| Delivery Date | `deliveryDate` | `Delivery Date` | `dg_jobs.delivery_date` | date-only text; `''` | Mutually exclusive in active UI with pickup. | Selected through `fulfillmentControl`/date picker; printed when active. | None known. |
| Customer Pickup Date | `customerPickupDate` | `Customer Pickup Date` | `dg_jobs.customer_pickup_date` | date-only text; `''` | Mutually exclusive in active UI with delivery. | Selected through the same progressive control; printed when active. | None known. |
| Fulfillment Plan | `fulfillmentPlan` | `Fulfillment Plan` | `dg_jobs.fulfillment_plan` | `Delivery`, `Customer Pickup`, or blank | Derived from active selection and date; blank without a chosen dated plan. | `fulfillmentControl`; controls active fulfillment date and auto Shop Date. | Exact enum/constraint unknown. |
| Scheduling Status | `schedulingStatus` | `Scheduling Status` | `dg_jobs.scheduling_status` | text; usually blank | On read/save, blank Shop Hours forces `Production scheduling blocked - Shop Hours required`; otherwise payload text is retained. | Readiness/status UI; not printed. | Native scheduling remains out of J1-J4. |
| Shop Date | `shopDate` | `Shop Date` | `dg_jobs.shop_date` | date-only text; `''` | Manual date cannot be later than fulfillment in `shopDateIsAllowed`. Automatic is four eligible shop days before fulfillment. | `shopDateButton`; printed in manual box. | Automatic calculation currently reads Calendar closures. J1-J4 must not write Calendar. |
| Shop Date Source | `shopDateSource` | `Shop Date Source` | `dg_jobs.shop_date_source` | `Automatic`, `Manual`, `Calendar Sync`, or blank | Entered Calendar Sync is preserved server-side; entered non-Automatic becomes Manual; otherwise recalculated Automatic. | Readiness labels manual dates. | Native source ownership needs approval. |
| PO Numbers | `poNumbers` | `PO Numbers JSON` | `dg_jobs.po_numbers` | JSON array of digit strings; zero or more; native default `[]` | Native local header persistence trims each value, requires digits only, drops blanks, and de-duplicates exact normalized values while preserving first-entered order. Values remain stored uncompressed. Existing J1/J2 local records with no field load as `[]` without a write or revision change and persist it on their next explicit successful save. | Production Setup provides one entry control plus Add/Remove actions. `jobs=view` may inspect all saved values; only `jobs=use` may mutate, with no manager fallback. J3A independently sorts by length then lexical order and compresses later same-prefix values for work-order display. | None known for local/disposable persistence; hosted activation remains J5/J6 work. |
| Created At | `createdAt` in saved/loaded job | `Created At` | `dg_jobs.created_at` | timestamp | Set on creation and preserved from existing row on update. | Not directly editable or printed. | Native actor/audit fields undecided. |
| Updated At | `updatedAt` | `Updated At` | `dg_jobs.updated_at` | timestamp | Set on every header save and lifecycle action. | Used to sort newest-first; not editable/printed. | Candidate concurrency token, decision open. |
| Door Type summary | `doorTypeSummary` (derived) | `Door Type` | `dg_jobs.door_type` | text; blank, one type, or `Mixed` | Unique nonblank line door types: none=`''`, one=value, multiple=`Mixed`. | Saved Jobs secondary summary. | Derived, not a header input. |

Traceability: `JOB_HEADERS`, `jobSummaryFromRow_`, `saveJobToSheets_`, `normalizeJobStatus_`, `normalizeJobStage_`, `resolveShopDateForSave_`, `nextJobId_`, `validatePayload_`; UI `currentJob`, `newJob`, `readJob`, `writeJob`, `validateJob`, `payload`, `jobReadinessInfo`, `updateFulfillmentSummary`, `shopDateIsAllowed`, `renderPoNumberFields`.

## 3. Door-line contract

The saved line is constructed by `buildLine`, validated in `validateLineForCommit` and again by server `validateDoor_`, then written in `DOOR_HEADERS` order. `jobLineFromRow_` reconstructs active lines. Values are primarily trimmed strings because the deployed store is Sheets.

| Field | Active UI / payload | Sheet header | `dg_job_lines` destination | Type/default and validation | Conditional/calculation/work-order behavior | Saved representation |
|---|---|---|---|---|---|---|
| Interior / Exterior | `modeExterior`, `modeInterior`; `mode` | `Mode` | `mode` | text; new default `Exterior`; required server-side | Selects configs, sizes, material, jamb/sill/weatherstrip/hinge/swing rules and hours table. | `Interior` or `Exterior`. |
| Door Type | `doorTypeInput`; `doorType` | `Door Type` | `door_type` | trimmed text; default blank; no required rule | Preview, Saved Jobs summary, work-order column. | text/null mirror. |
| Configuration | `configInput`; `config` | `Config` | `config` | required; default `D`; `DBL` normalized to `DD` server work-order side | Governs all geometry, controls, hours and details (§4). | deployed code such as `D`, `T/SDDS`, `PKT`. |
| Width | `widthInput`; `width` | `Width` | `width` | required; mode-specific option; default exterior `3'0"`, interior `2'6"` | Nominal slab geometry unless custom wood slab. | display text. |
| Height | `heightInput`; `height` | `Height` | `height` | required; `6'8"`, `7'0"`, `8'0"`; default sticky/`6'8"` | Exterior 8-foot defaults prep to MULTI; geometry and tall-door details. | display text. |
| Custom slab mode | `customSlabInput`; `customSlab` | `Custom Slab` | `custom_slab` | `No`, `RO`, `WoodCustom`; legacy `Yes` accepted | WoodCustom available only for wood; RO means custom opening/cut-down, not custom slab dimensions. | text. |
| Custom slab width/height | `customSlabWidthInput`, `customSlabHeightInput` | `Custom Slab Width`, `Custom Slab Height` | `custom_slab_width`, `custom_slab_height` | positive parseable inches required only for actual custom slab (`Yes`/`WoodCustom`) | Actual work-order size and geometry; hidden otherwise. | dimension strings. |
| Hand / Swing | `handInput`; `hand` | `Hand` | `hand` | exterior LH/RH/LHOUT/RHOUT; interior D LH/RH; DD optional; PKT/B.P. blank | OUT selects outswing geometry and stainless hinge display. Hidden/cleared where no swing. | text/null. |
| Prep | `prepInput`; `prep` | `Prep` | `prep` | config/mode-specific; defaults in §4 | MULTI adds hours; labels normalized for work order. | codes or PKT names. |
| Glass | legacy `glass:''` | `Glass` | `glass` | currently blank in `buildLine` | Active glass terms live in calculated units, not this field. | blank unless legacy row. |
| Jamb Width | `jambInput`/`ripInput`; `jambWidth` | `Jamb Width` | `jamb_width` | defaults exterior `6-9/16"`, interior `4-9/16"`; literal `RIP` is blocked | Hidden/blank for interior PKT/B.P.; work-order jamb display. | chosen width or entered RIP target. |
| Jamb Type | `jambTypeInput`; `jambType` | `Jamb Type` | `jamb_type` | default Primed; interior Primed/Fir; exterior also composite choices | Hidden/blank without jamb; combined with width for work order. | text. |
| Sill | `sillInput`; `sill` | `Sill` | `sill` | exterior default STD; Dark Anodized option | Hidden and saved blank for Interior; work-order column. | text/null. |
| Weatherstrip | `wsInput`; `weatherstrip` | `Weatherstrip` | `weatherstrip` | exterior default WHT; BRN/BLK/blank | Hidden and saved blank for Interior; work-order W/S column. | text/null. |
| Hinge Type | `hingeInput`; `hingeType` | `Hinge Type` | `hinge_type` | exterior BB/BOM/REG/NRP; interior BB/REG; defaults BB/REG | Hidden/blank for interior PKT/B.P.; work order combines with job color and outswing rules. | code text. |
| Notes | `lineNotesInput`; `notes` | `Notes` | `notes` | trimmed; no deployed length limit | Work-order cleans legacy Pocket/Override and redundant Cutdown prefixes. | text/null. |
| Quantity | `qtyInput`; `qty` | `Qty` | `qty` | number, minimum/default 1; server rejects falsy | Multiplies shop minutes and glass/panel labels; identical lines can merge by summing quantity. | numeric. |
| Line Status | not normal editor input | `Line Status` | `line_status` | Sheets write `Active`; extra old rows become `Archived` | `listForJob` excludes Archived; work order includes active only. | mirror defaults `Active`; browser-built lines omit it, so raw fallback may omit. |
| Last Saved At | generated | `Last Saved At` | `last_saved_at` | timestamp | Set on every Sheets line write/archive. | Mirror currently receives browser lines and may get null because generated sheet metadata is not added to payload. |
| RO Width | `roWInput`; `roWidth` | `RO Width` | `ro_width` | dimension string | Required for glass configurations; blank for PKT/B.P.; strict blockers in §6. | text/null. |
| RO Height | `roHInput`; `roHeight` | `RO Height` | `ro_height` | dimension string | Required for transom. Optional for ordinary/custom cut-down. B.P. stores only a genuinely cutting Finished Opening height. | text/null. |
| Material | `materialInput`; `material` | `Material` | `material` | exterior fiberglass/wood, default fiberglass; interior forced wood | Controls actual slab lookup and panel options. | text. |
| Door Thickness | `thicknessInput`; `doorThickness` | `Door Thickness` | `door_thickness` | blank/Auto, 1-3/8, 1-3/4 | Work order defaults interior 1-3/8 and exterior 1-3/4. | override text/null. |
| RIP Jamb | derived; `ripJamb` | `RIP Jamb` | `rip_jamb` | `Yes` or blank | RIP selection requires a target; adds 15 minutes. | text/null. |
| Glass Calc Status | `lastCalc.status`; `glassCalcStatus` | `Glass Calc Status` | `glass_calc_status` | Ready/Complete/Warning/Blocked/Needs RO/Needs Glass Calc | Blocking states and blockers prevent add/save for glass configurations. | text/null. |
| Glass Workorder Detail | `glassWorkorderDetail` | `Glass Workorder Detail` | `glass_workorder_detail` | generated multiline text | Preserved for edit/preview; work order recalculates much geometry but uses status/units/warnings. | text/null. |
| Glass Warnings | `glassWarnings` | `Glass Warnings` | `glass_warnings` | newline-delimited text | Nonblocking review output; cut-down base warning is suppressed from printed warning list. | text/null. |
| Glass Blockers | `glassBlockers` | `Glass Blockers` | `glass_blockers` | newline-delimited text | Any blocker prevents line commit and server save. | text/null. |
| Glass Override | `glassOverride` | `Glass Override` | `glass_override` | active `buildLine` always saves `No` | No active override control was found; do not infer approval behavior from the field name. | text. |
| Glass Units JSON | `glassUnits` | `Glass Units JSON` | `glass_units` | JSON array, default `[]` | Feeds printed GLASS rows and vendor copy. | JSON array. |
| Glass Calc JSON | `glassCalc` | `Glass Calc JSON` | `glass_calc` | JSON object or null | Saves RO/config/swing/slab/header/jamb/final sizes/panel/transom calculations; reload derives panel state from it. | JSON object/null. |
| Vendor Copy Text | `vendorCopyText` | `Vendor Copy Text` | `vendor_copy_text` | generated text | Shown in progressive details; sealed-unit text uses glass-term templates, sidelights substitute 4mm shorthand. | text/null. |
| Panel sidelight details | `sidelightType`, `panelSidelightWidth`, `panelSidelights` | embedded in `Glass Calc JSON` | no dedicated columns | defaults type glass; panel width required when panel selected | Panel height matches slab; used in work-order PANELS section and header geometry. | `glass_calc.sidelightType`, `panelWidth`, `panelSidelights`; also `raw_line`. |
| Raw line | whole browser line | none | `raw_line` | JSON | Compatibility/debug fallback including panel fields. | complete object passed to mirror. |

Traceability: `DOOR_HEADERS`, `jobLineFromRow_`, `saveDoorLinesWithoutDeleting_`, `validateDoor_`; UI `buildLine`, `validateLineForCommit`, `renderLine`, `editLine`, `saveLine`, `renderDoorList`, `activeLineKey`, `mergeIdenticalDoors`.

## 4. Configuration rules

### Mode and option sets

- `EXTERIOR_CONFIGS`: D, DD, SD, DS, SDS, SDDS, T/D, T/DD, T/SD, T/DS, T/SDS, T/SDDS.
- `INTERIOR_CONFIGS`: D, DD, PKT, B.P.
- Interior hides Material, Sill and Weatherstrip and forces wood/blank exterior hardware values. Exterior exposes those controls.
- PKT and B.P. use no jamb, hinge or swing (`isNoJambHingeConfig`, `updateModeSpecificFields`).
- Interior jamb types exclude composites; interior hinges exclude BOM and NRP (`populateJambTypeOptions`, `populateHingeOptions`).

### Configurations

| Config | Deployed rule summary | Traceability |
|---|---|---|
| D | Single door. Exterior header/slab rule; interior header is slab + 7/32. Custom RO non-transom adds 30 minutes. | `isStandardDoorConfig_`, `frameCalcForWorkorder_`, `calculateGlass`, `shopHoursRuleForLine_`. |
| DD | Double door; `DBL` legacy alias. DD core is two actual slabs + 13/16 meeting allowance + 1/4. Custom RO adds 45 minutes. | `normalizeConfig_`, `ddCoreHeaderCut`, `ddCoreHeaderCutForWorkorder_`. |
| SD / DS | One sidelight positioned by code; one glass or panel assembly. | `sideCount`, `hasSidelight`, `calculateGlass`. |
| SDS | Single door plus two sidelights. | `sideCount` returns 2; `isDouble` false. |
| SDDS | Double-door DD core plus two sidelights. Glass version can derive header from RO; panel version adds two panel assemblies around unchanged DD core. | `isSddsConfig`, `panelUnitHeaderCut`, `calculateGlass`. |
| T/* | Same core configuration with transom. RO height required. Transom absorbs remaining height; selected slab height is retained. | `hasTransom`, `calculateGlass`, `updateLineRoGuidance`. |
| PKT | Interior only; no jamb/hinge/swing and no RO. Prep choices Round Weiser, Reg Emtek, LRG Emtek. | `INTERIOR_CONFIGS`, `populatePrepOptions`, `isPocketNoRoConfig`, `buildLine`. |
| B.P. | Interior bypass; no jamb/hinge/swing. Optional F.O. Height is stored only when `FO - 2.75` cuts below slab height; work order prints F.O. and cut. Prep None or Half drill. | `isBypassConfig`, `buildLine`, `generatedDetailBlock_`. |

### Custom slab, custom RO and restrictions

- `WoodCustom` is available only for wood and requires positive parseable actual width/height. `customSlabValidation` and server `validateCustomSlabLine_` enforce dimensions, though their user messages differ.
- `RO` means Custom RO / Cut Down. For non-transom D/DD it adds labor; geometry never enlarges a selected slab, and large cut-downs warn.
- Panel sidelights require a panel width: fiberglass choices 11-3/4 or 13-3/4; wood accepts entered width. Panel height equals slab height. The divider is 1.5; glass divider is 2.25.
- Glass sidelights require RO width and computed positive dimensions. SD/DS have one; SDS/SDDS have two.
- Exterior outswing derives from `LHOUT`/`RHOUT`, uses a 2-inch vertical deduction instead of 2.25, and changes work-order hinge display to stainless except BOM retains selected color.
- Exterior MULTI prep adds 45 minutes for single cores and 90 for double cores (`isDouble` includes DD, T/DD, SDDS, T/SDDS).
- Exterior prep options are Double drilled/STD, Multipoint/MULTI, Single drilled/SINGLE. Interior D: YES or NO; DD: NO or BOTH; PKT as above; B.P.: NO or HALF.
- Material choices are exterior fiberglass/wood; interior is forced wood. Custom wood slab is suppressed when material changes away from wood.
- PKT/B.P. exclude jamb/hinge/swing. Interior excludes composite jambs and BOM/NRP hinges. Exterior includes composite jamb types and BOM/NRP.

Uncertainty rule: no behavior beyond these active identifiers is approved. Comments describing geometry are supporting context only where the active functions implement the same rule. CSS phase comments are not behavioral authority when later CSS or `setupDesktopJobWorkspace` overrides them.

## 5. Shop Hours contract

`shopHoursRuleForLine_` in Code.gs and `shopHoursRuleForLine` in Index.html contain the same table:

| Mode/config | Base minutes per unit |
|---|---:|
| Exterior D | 60 |
| Exterior DD | 90 |
| Exterior T/D | 90 |
| Exterior T/DD | 120 |
| Exterior SD or DS | 180 |
| Exterior SDS | 240 |
| Exterior T/SD or T/DS | 240 |
| Exterior T/SDS | 300 |
| Interior D | 15 |
| Interior DD | 30 |
| Interior PKT | 15 |
| Interior B.P. | 15 |

There are deliberately no base rules for SDDS or T/SDDS. Those configurations therefore make the estimate unknown even though geometry supports them.

- Multiply each known line's minutes by `max(1, qty)`.
- MULTI adds 45 minutes, or 90 where `isDouble` is true, before quantity multiplication.
- Non-transom `customSlab === 'RO'`: D +30, DD +45, before quantity multiplication.
- `ripJamb` equal to Yes (case-insensitive) adds 15 minutes before quantity multiplication.
- An unknown mode/config adds no minutes and records `Line N: reason`; any unknown clears Shop Hours and sets source `Estimate incomplete`.
- A complete estimate is rounded to the nearest 15 minutes then divided by 60 (`Math.round(minutes / 15) / 4`). Zero displays blank.
- Typing a value sets source `Manual`; manual is not replaced by later line estimates. Clearing it re-enters estimation.
- Blank hours force Scheduling Status `Production scheduling blocked - Shop Hours required`; readiness is `Needs Shop Hours` and new-job capacity checking is hidden.

Traceability: Code.gs `shopHoursRuleForLine_`, `calculateShopHours_`, `shopHoursText_`, `saveJobToSheets_`; Index.html `shopHoursRuleForLine`, `shopHoursEstimate`, `refreshShopHoursEstimate`, `shopHoursChanged`, `updateFulfillmentSummary`, `jobReadinessInfo`.

## 6. Save, load and lifecycle

### Sheets behavior

1. `saveCurrentJob` commits an open line edit, merges identical lines, runs browser validation, then calls `saveJob(payload())`.
2. `saveJobToSheets_` repeats aggregate/line validation, calculates derived header values, allocates an ID if blank, and rejects a duplicate target ID.
3. New jobs append a Jobs row; updates overwrite the located header row and preserve Created At.
4. `saveDoorLinesWithoutDeleting_` matches existing Door Intake rows only by old Job ID and position. It overwrites matching positions, appends additional positions, and marks surplus old positions `Archived`; it never physically deletes Sheets line rows.
5. `loadJob` loads the job and active non-Archived lines. `openJob` rebuilds browser state and supports edit/reopen.
6. Archive sets Status `Archived`, Active `No`; restore clears Status and sets Active `Yes`; delete is soft-delete, setting both to `Deleted`. These operations do not change Door Intake rows.
7. PO input removes non-digits on input; browser/server normalize digit-only strings and de-duplicate first occurrence.

### Current Supabase mirror

`saveJobToSheets_` calls `dgMirrorSavedJobToSupabase_` only after Sheets saving. Mirror writes are disabled unless an explicit `SUPABASE_WRITES_ENABLED`/`supabaseWritesEnabled` or equivalent approved flag resolves enabled. If enabled:

- Job is upserted on `job_id`.
- `dgMirrorJobLinesToSupabase_` first deletes every `dg_job_lines` row for the Job ID, then upserts the current array.
- `dgSupabaseMirrorLineId_` derives `line_id` as `JobID:001`, `JobID:002`, etc. `line_index` is array position + 1.
- Header `raw_job` and line `raw_line` retain the passed objects.
- The two mirror calls are not one transaction in the deployed Apps Script.
- Mirror failure is logged with `DG_SUPABASE_MIRROR_WARNING` and never blocks or reverses the successful Sheets save. `dgMirrorSavedJobToSupabase_` also catches and returns failure, so the outer caller normally continues.

### Approved J2 lifecycle behavior

1. Drafts may contain zero active lines. Confirmation requires at least one active line that passes the complete deployed door-line validation contract.
2. Archived lines remain inspectable to `jobs = view` and `jobs = use`, but do not count toward confirmation.
3. `jobs = use` owns the reversible line actions and both `Draft` → `Confirmed Job` and `Confirmed Job` → `Draft` transitions. `jobs = view` owns none of those mutations.
4. Removing a line in J2 archives it; restoring makes that same permanent line identity active again. No J2 user-interface action permanently deletes a line.
5. Returning a job to Draft, editing its BizTrack Sales Order, reordering lines, archiving lines and restoring lines never replace the job identity or any line identity.
6. A Confirmed Job must retain at least one valid active line. Archiving/removing its final valid active line is blocked, as is saving an edit that makes that final valid line invalid. J2 never automatically returns the job to Draft; the explanation directs the user to first return it to Draft or add another valid active line. All identities remain unchanged.
7. These lifecycle and line actions are intake-only. They must not create production bookings, fulfillment records, Calendar records or scheduling mutations.

### Approved J2 local aggregate technical contract

- Each door line receives an immutable UUID `lineId` when first created. Duplicate creates a new logical line with a new UUID; edit, reorder, archive/remove and restore preserve the existing `lineId`.
- `lineIndex` is display/order data only. It may change during reordering and must never be used as line identity.
- The local aggregate stores the job header and every active and archived door line together in the same local record.
- Each J2 aggregate save writes the complete job header and line collection in one atomic local-file operation. A partially saved header/line state must not become visible.
- The job `revision` is the optimistic-concurrency token for the whole aggregate: both header and door-line changes advance it, and a save with a stale expected revision is rejected.
- J2 exposes no permanent deletion for either jobs or door lines. Door-line removal is archive-style, and abandoned Draft jobs remain retained in local disposable storage for now.
- These are J2 local/disposable implementation choices only. They do not define or activate the later hosted schema, transaction/RPC or reorder mechanism.

### Approved J2/J3 shared non-glass frame and cut calculator

- The choice between persisting duplicated derived non-glass work-order output and using one shared calculator is resolved in favor of a **pure shared jobs/domain calculator**. Do not persist duplicate non-glass frame/cut results merely to support J3 work-order generation; avoiding that duplication prevents stale calculated state in the saved aggregate.
- The calculator accepts only persisted saved line inputs and returns deterministic structured results for every applicable Interior D, Interior DD, Exterior D and Exterior DD unit, including jamb legs, headers, sills, any applicable non-glass T-bar/divider, slab or frame cut-down, B.P. finished-opening detail and other deployed non-glass frame/cut detail required by a work order.
- J2 intake preview/validation where applicable and J3A work-order document generation must call the same calculator. Authoritative formulas must not be copied, reinterpreted or independently approximated in React components, the work-order document mapper, the print renderer or pagination code.
- Missing required inputs return a structured incomplete result. Invalid or impossible inputs return structured blockers. The calculator never invents dimensions and never substitutes standard dimensions after invalid custom input.
- Calculated shop dimensions use the approved canonical inches-only 1/16-inch formatting. Nominal door-size labels remain in standard feet/inches notation.
- Calculation is pure: identical saved inputs produce deeply equal output, and invocation changes no aggregate or line field, identity, revision, lifecycle state or timestamp.
- Existing persisted authoritative J2 glass geometry remains the source for glass work-order details. J3A uses that persisted structured glass output where available and calls this shared calculator only for approved non-glass derived output.
- The calculator belongs in the shared jobs/domain layer and must be directly usable by J2, J3A and tests; output-specific and UI modules are consumers, never formula authorities.
- Required prerequisite coverage includes every supported non-glass configuration; deterministic output; jamb-leg, header/sill, cut-down and B.P. finished-opening behavior; incomplete and blocked results; inches-only formatting; non-mutation and unchanged revision; and equality when invoked through J2 and J3 paths.

### Required native contrast (recommendation, not finalized)

- Assign the approved permanent hidden internal job identity on first save, including when the BizTrack Sales Order is null. Assign a separate, non-reused human-readable DoorGo reference for pre-BizTrack display. Store Sales Order separately and allow corrections without re-keying the job or its lines. The DoorGo reference is not a fake or temporary Sales Order.
- Resolve the primary visible identifier as `BizTrack Sales Order ?? temporary DoorGo reference`. Once Sales Order exists, suppress the DoorGo reference from normal UI/print while preserving it in storage and historical lookup paths.
- Give each logical line a stable `line_id` when it is first created; never derive identity from Job ID plus position.
- Treat `line_index` only as order/display data.
- Save header and the complete line diff in one database transaction/RPC with authorization, validation, idempotency and concurrency checks.
- Do not emulate delete-all/reinsert, because it destroys identity and interacts badly with downstream references/audit.
- Reordering under immediate `UNIQUE(job_id, line_index)` needs an approved deferrable constraint, two-phase temporary renumber, or sparse-order design.
- Prohibit Production Board inclusion and creation of production, fulfillment, or Calendar records merely because a job exists or is confirmed. Eligibility must pass the separately approved production-readiness gate.

### Future BizTrack integration boundary

The native aggregate is DoorGo-owned. Its permanent internal job identity and permanent line identities remain authoritative for DoorGo relationships before, during, and after BizTrack synchronization.

A future BizTrack API integration may attach the following optional integration data without re-keying the DoorGo job:

- nullable/editable BizTrack Sales Order number;
- durable external BizTrack identifier, distinct from the human-facing Sales Order;
- synchronization state;
- last synchronized timestamp.

Those fields, their constraints, conflict policy, API directionality, retry/idempotency behavior, and audit history are future J5 design decisions. No hosted columns are designed in J0. BizTrack must not become the primary identity of a DoorGo job, and a BizTrack correction must not cascade into new DoorGo job or line identities.

Traceability: `nextJobId_`, `findJobRowById_`, `saveJobToSheets_`, `saveDoorLinesWithoutDeleting_`, `archiveJobInSheets_`, `restoreJobInSheets_`, `markJobDeletedInSheets_`, `dgSupabaseMirrorWritesEnabled_`, `dgSupabaseMirrorLineId_`, `dgMirrorJobLinesToSupabase_`, `dgMirrorSavedJobToSupabase_`.

## 7. Glass workflow

- `renderLine` reveals `roPanel` for B.P., Custom RO, any glass config, or existing RO input. Its title becomes Finished Opening, Glass Measure, or Custom RO / Cut Down.
- Glass configs are SD, DS, SDS, SDDS, T/D, T/DD, T/SD, T/DS, T/SDS, T/SDDS. PKT/B.P. bypass glass calculation.
- RO width is required for every glass config. RO height is required for transoms; otherwise it is optional and used only for short/custom openings.
- Sidelight type appears only for sidelight configs. Choosing panel progressively shows panel width and hides sidelight glass; transom glass remains visible for a transom.
- Blocking conditions include missing required RO, invalid slab/panel dimensions, RO narrower than strict glass/DD/T-D/panel minimums, zero/negative sidelight or transom dimensions, nonpositive header/jamb, and too-short transom RO.
- Warnings include taller-than-standard RO, cut-down, large cut-down, and non-glass D/DD RO below recommendation. Warnings permit save; blockers and Needs states do not.
- `markGlassNeeded` creates Needs Glass Calc, but deployed `validateDoor_` treats that as unresolved and blocks job save. It is useful for print guidance only if a legacy/saved state bypasses current validation; do not interpret it as an approved save override.
- Saved values: status, detail, newline warnings/blockers, override (`No`), units array, calc object, vendor copy, and panel state inside calc/raw line.
- Work order generates frame/detail rows, PANELS, GLASS and WARNINGS; blocker/review text is strongly marked and says not to order.
- `buildVendorCopy` applies term templates; sidelights change seeded 3mm shorthand to 4mm. Terms come from `door_glass_terms`/`getGlassTerms`.
- `lineGlassCanvas` draws the calculated unit. `beforeprint` redraws with print colors; `afterprint` restores the terminal theme. Phone and desktop use the same calculation, with phone CSS enlarging controls and changing output layout; standalone Quick Glass is separate and does not save to jobs.

Traceability: `#roPanel`, `#roWInput`, `#roHInput`, `#sidelightTypeInput`, `#panelSidelightWidthField`, `#sidelightGlassField`, `#transomGlassField`, `#glassOutputGrid`, `#lineGlassCanvas`; functions `renderLine`, `updateSidelightControls`, `calculateGlass`, `calculationIsBlocking`, `runGlassCalc`, `markGlassNeeded`, `buildVendorCopy`, `drawLineGlassCanvas`, `validateLineForCommit`.

## 8. Work order, printing and email

`getGeneratedWorkOrderHtml` produces letter landscape (`@page size: letter landscape`, 0.28-inch margin), black-on-white output independent of terminal theme. The deployed output uses `job.jobId`; native output must instead use the approved primary visible identifier: BizTrack Sales Order when present, otherwise the temporary DoorGo reference. Once a Sales Order is assigned, the temporary reference must not appear on normal printed documents.

- First-page header: customer, site, Phone and Email Contact line, salesperson, Shop Hours, active fulfillment type/date, Notes, Sales Order/Job ID, printed date, Shop Date and compressed PO display.
- Columns: Qty, Config, Size, Thick, Door Type, Drill, Hinge, Swing, Jamb, Sill, W/S, Notes / Glass.
- Generated detail rows contain jamb legs/header/sill/T-bar, door cut, panel lines, glass units, warnings, B.P. F.O. details, or blocking guidance.
- Page weighting uses 22 units on page one and 26 later; continuation headers and `Page N of total` footers are generated.
- PO display sorts by length/lexical order and abbreviates subsequent same-length numbers sharing the first number's prefix except its last two digits.
- **Deployed behavior:** `printWorkOrder` opens a placeholder popup, saves the current aggregate first, loads generated HTML, and invokes print after load. **Approved native J3 behavior differs:** Print Work Order never saves automatically; preview and print use only the last successfully saved aggregate under the saved-source contract below.
- `emailWorkOrder` selects an active worker by exact name from `Workers`, converts generated HTML to a PDF named `WorkOrder_<jobId>.pdf`, and sends it through `MailApp` as an attachment. The customer Email field is not the recipient selector.
- `sendWorkOrderEmail` also saves before sending.

### Approved J3 work-order preview and print permission

- `jobs = view` may open a saved job, preview its saved work order and print its saved work order. Printing is a read-only use of the saved aggregate.
- `jobs = use` may also preview and print, and retains its existing J1/J2 authority to edit and explicitly save the job.
- `jobs = none` has no Job Intake, work-order preview or work-order print access. Manager status provides no fallback; the explicit `jobs` access level is authoritative.
- Enforce this permission at every boundary: route/page authorization, server-side work-order generation, every print-preparation action/service and the UI controls. Hiding a Print button is not authorization.
- Preview and print must be generated wholly from the last successfully saved aggregate revision. They must never combine saved header data with unsaved line data, or any other mixture of saved and unsaved state.
- Calling the approved shared non-glass frame/cut calculator with lines loaded from that repository-saved aggregate complies with this saved-source rule. The aggregate remains the authoritative business source; the pure calculator derives display-ready structured output solely from those persisted inputs and performs no save or mutation.
- J3A must consume persisted authoritative J2 structured glass output where available and the shared jobs/domain calculator for approved non-glass derived output. It must not duplicate formula logic inside its document mapper or pagination model.

#### J3A shared-calculator prerequisite

Before the J3A document model is considered complete, the shared jobs/domain calculator must exist and its tests must prove every supported non-glass configuration, deterministic structured output, jamb/header/sill/cut and B.P. behavior, incomplete/blocker classification, canonical inches-only formatting, non-mutation, unchanged revision, and identical results through J2 and J3 consumers. This prerequisite adds no persistence path, migration or hosted activation.
- If the current job has unsaved changes, printing is blocked and the UI shows exactly: **“Save the job before printing the work order.”** Print Work Order must not trigger an automatic save.
- After a successful explicit save, preview and print may use the newly saved revision. A stale-revision rejection or any failed save leaves printing blocked.
- Previewing or printing must not change Draft/Confirmed state, advance the aggregate revision, create an audit/delivery record, create production/fulfillment/scheduling/Calendar data or write to hosted Supabase.
- `jobs = view` may not email a work order. `jobs = use` may send the last successfully saved work order only through the controlled J3 test-email adapter. `jobs = none` has no access, and manager status provides no fallback.

### Approved J3 controlled test-email permission and safety boundary

- Email recipients come only from a controlled internal allowlist. A `jobs = use` user may select an approved recipient but may not add, edit, remove or administer allowlist entries during J3. Recipient administration remains outside J3 unless separately approved.
- The customer Email field is contact data only. It must never be automatically selected, treated as an approved work-order recipient or copied into the adapter destination without an explicit future policy change. The adapter must never silently fall back to it.
- Email output follows the same saved-source rule as print: generate wholly from the last successfully saved aggregate revision, never mix saved and unsaved data, and never automatically save when Email Work Order is selected. Unsaved changes, a stale-revision rejection or any failed save keep email blocked until an explicit save succeeds.
- J3 uses a test adapter only. Real customer and production outbound email remain disabled. The adapter must provide clear success and failure feedback, and printing and test-emailing remain distinct permissions and actions.
- Test-emailing must not change Draft/Confirmed state, aggregate revision, job identity or line identities; create production/fulfillment/scheduling/Calendar data; or write hosted Supabase data.
- Enforce permission and recipient safety at every applicable boundary: route/page authorization, server action, email service/adapter, recipient-selection service and UI controls. Hiding the Email button is not authorization.
- The controlled allowlist source is a server-only local environment setting in ignored `.env.local`, using a name such as `DOORGO_WORK_ORDER_TEST_RECIPIENTS_JSON`. It must not use a `NEXT_PUBLIC_` name, expose its raw value to the browser or be committed.
- Each configured recipient contains a stable recipient ID, display name, internal email address and, when useful, an optional active flag. The app operator initially defines and maintains these entries outside DoorGo; J3 provides no add/edit/remove/activate/deactivate administration UI. A later controlled directory is outside J3 unless separately approved.
- Parse and validate the setting only on the server. Return to the UI only approved selectable fields: stable ID, display name and email address when needed for clear selection. Never return unrelated environment configuration and never accept an arbitrary browser-supplied address as authoritative. On send, resolve the selected stable ID against the server-side allowlist again.
- Fail closed when the setting is missing, malformed, empty, contains duplicate recipient IDs, contains an invalid email address or is otherwise unsafe: expose no selectable recipients; disable or withhold Email Work Order; reject server-side send attempts; show a clear configuration-unavailable message; and never fall back to customer Email or a hard-coded destination.
- This source is local/test-only. J3 adds no hosted schema, migration, RLS policy, permission table or recipient-directory change, and no secret or real credential may be committed.
- The PDF filename follows the approved visible-identifier and sanitization contract below.

### Approved J3 local test outbox and captured-work-order review

- The test-email adapter performs no network delivery. It must not use SMTP, an email API, customer delivery or any hidden network fallback, and stores no SMTP/API credential.
- Each test send creates exactly one local capture in an ignored location such as `.local-data/work-order-test-outbox/`. Each capture contains a unique test-message ID; selected allowlisted recipient ID, display name and email address; subject; message body; generated work-order PDF; visible job identifier; immutable internal job ID; saved aggregate revision; requesting user; and captured timestamp.
- Resolve the selected recipient ID again against the server-only allowlist immediately before capture. Never use customer Email and never accept an arbitrary browser-supplied destination.
- After successful capture, show exactly **“Test email captured.”** and clearly state that no real email was delivered. Never show “Email sent.”
- The generated work order must be visibly reviewable without searching the file system. After capture, provide a clear action such as **Open Captured Work Order** or **View PDF** that opens the exact PDF stored in that capture. The pre-capture work-order preview may remain available.
- The captured PDF, body and metadata must all come from the same last successfully saved aggregate revision, and that revision is recorded in the capture metadata.
- Write the complete capture atomically. On failure, leave no partial metadata, body or PDF; show a readable error; and never claim success. Capture failure must not change the job aggregate, aggregate revision, Draft/Confirmed state, job/line identities or any production/fulfillment/scheduling/Calendar data.
- Captures may be reviewed locally and manually removed outside DoorGo. J3 requires no outbox administration or deletion interface. The outbox remains ignored and must never be committed.

### Approved J3 work-order PDF filename

- Use the same visible-identifier precedence as normal DoorGo UI and work-order content. When a BizTrack Sales Order exists, the filename is `Work_Order_<SalesOrder>.pdf` (for example, `Work_Order_1234567.pdf`). Otherwise it is `Work_Order_<DoorGoReference>.pdf` (for example, `Work_Order_DG-000123.pdf`).
- Once a BizTrack Sales Order exists, do not include or expose the temporary DoorGo reference alongside it in the filename. Never include the immutable internal job UUID, aggregate revision, customer/site names, email addresses or other contact information.
- Sanitize the chosen visible identifier by replacing unsafe filename characters with `_`; prevent path separators, traversal sequences, control characters and invalid platform characters; and collapse repeated replacement characters where practical. Preserve the exact `Work_Order_` prefix and `.pdf` extension. Fail safely if sanitization cannot produce a valid visible identifier.
- Use the same generated filename for preview/download when a filename is needed, browser printing/PDF saving where controllable, the PDF stored in the local test outbox and captured-message metadata.
- The user-facing filename omits aggregate revision, but outbox metadata retains the immutable internal job ID, visible identifier, saved aggregate revision, unique test-message ID and capture timestamp. The stored/shown PDF must correspond exactly to that recorded saved revision.

Traceability: `getGeneratedWorkOrderHtml`, `generatedDetailBlock_`, `notesForWorkorder_`, `glassLinesForWorkorder_`, `panelLinesForWorkorder_`, `formatPoNumbersForWorkorder_`, `buildGeneratedWorkorderPdfBlob_`, `emailWorkOrder`; UI `#emailCard`, `#workerSelect`, `printWorkOrder`, `openGeneratedWorkOrderPrint`, `sendWorkOrderEmail`.

## 9. User-interface contract

### Active rendered behavior

- Home exposes Create Job, Saved Jobs, Glass Calculator, Production Review and Archived Jobs. Intake uses `#job`.
- Current Job is divided into identity/contact/production/scheduling/notes sections. Later Phase 1.46/1.48 CSS is active; earlier phase comments/rules are historical when overridden.
- On non-phone layouts, `setupDesktopJobWorkspace` actively moves the Door Line editor and Job Lines card into `#desktopJobWorkspace`, creates a compact Current Job treatment, and moves the persistent Job Actions row into `#desktopJobActionBar` above the editor. This runtime DOM transformation is more authoritative than the original markup order.
- Compact labels remain within field containers through `.field > label`, `.mini-label`, and later Current Job hierarchy rules.
- Door editor uses quick buttons backed by hidden/native selects, width buttons/wheel, progressive More Options and progressive glass panel. Job Lines provides quantity, Edit and Remove actions plus Merge Identical.
- Saved Jobs is a ledger with filters, salesperson selection (including unassigned), sorting, readiness, Open and lifecycle actions (`renderPrevious`). Phone contact text is enlarged.
- Phone detection is `detectTruePhone`: phone user-agent, or coarse pointer plus screen/visual viewport <=620. `isMobileEntry` also treats <=1100 as mobile entry behavior. Phone CSS enlarges controls/touch targets and changes grids.
- Theme is terminal-local: `doorgo-terminal-theme` in `localStorage`, default Light. `applyTerminalTheme` toggles body classes. Printing redraws diagrams in print mode and generated work orders are light-only.
- `exitCurrentJob` confirms before abandoning open edit/editor/header changes. The separate `#unsavedEntryModal` offers Add Door + Continue, Continue Without Adding, or Cancel for flows that call `warnUnsavedEntryIfNeeded`; `prepareJobForSaveAction` currently commits an open edit but does not invoke that modal for a fresh unadded editor line.
- Actions are Back to Home, Save, Save + Home; saved jobs additionally show Email Work Order, Print Work Order and Delete Job.
- Loading/feedback uses the transient `#status` toast (`toast`, two seconds), temporary print popup, async success/failure handlers, readiness badges, and capacity/booking status areas.

Retired/no-op behavior must not be copied: `setMobileStep`, `nextMobileStep`, and `prevMobileStep` are empty; old CSS phase blocks and comments do not override later active CSS or runtime DOM movement.

Traceability: `#currentJobCard`, `#desktopJobWorkspace`, `#desktopJobActionBar`, `.quick-intake-card`, `#doorList`, `#previousJobs`, `#unsavedEntryModal`, `#status`; `setupDesktopJobWorkspace`, `setupCompactCurrentJob`, `renderPrevious`, `detectTruePhone`, `applyDeviceMode`, `applyTerminalTheme`, `exitCurrentJob`, `saveCurrentJob`, `toast`.

## 10. Supabase field mapping

This is the exact deployed mirror projection. `raw_job` or `raw_line` means the whole source object is also stored there when mirror writes are enabled.

| Deployed field / header | Code property | `dg_jobs` | `dg_job_lines` | Raw fallback | Missing hosted column / notes |
|---|---|---|---|---|---|
| Deployed Sales Order / Job ID | `jobId` | currently `job_id` | currently `job_id` relationship | both | Deployed key conflates visible number and identity. Native model requires separate internal key, DoorGo reference, and nullable BizTrack Sales Order; exact J5 columns are undecided. |
| Native temporary DoorGo reference | no separate deployed property | no suitable column yet | — | none | Permanent/non-reused stored reference; visible only before Sales Order; required J5 schema design. |
| Native BizTrack Sales Order | deployed `jobId` role | no separate column yet | — | deployed raw fallback only | Nullable/editable visible business identifier; `jobs=use` may add/correct; required J5 schema design. |
| Native internal Job ID | no deployed separate property | no suitable separate key yet | future relationship target | none | Approved hidden permanent relational identity on first save. Neither visible identifier may be its primary key. |
| Customer | `customer` | `customer` | `customer` | both | Line browser objects normally omit copied customer although Sheets rows contain it. |
| Site/Address | `siteAddress` | `site_address` | `site_address` | both | Same caveat as Customer. |
| Phone | `phone` | — | — | `raw_job.phone` | **Dedicated hosted column missing.** |
| Email | `email` | — | — | `raw_job.email` | **Dedicated hosted column missing.** |
| Status / Active | `status`, `active` | `status`, `active` | — | `raw_job` | Lifecycle. |
| Created / Updated | `createdAt`, `updatedAt` | `created_at`, `updated_at` | — | `raw_job` | Mirror adds `mirrored_at`. |
| Door Type summary | `doorTypeSummary` | `door_type` | — | `raw_job` | Derived header. |
| Notes / Hinge Color | `notes`, `hingeColor` | `notes`, `hinge_color` | — | `raw_job` | Header fields. |
| Shop Hours / source | `shopHours`, `shopHoursSource` | `shop_hours`, `shop_hours_source` | — | `raw_job` | Number normalization or null. |
| Fulfillment | `deliveryDate`, `customerPickupDate`, `fulfillmentPlan` | `delivery_date`, `customer_pickup_date`, `fulfillment_plan` | — | `raw_job` | Date-only text in mirror. |
| Scheduling / Shop Date | `schedulingStatus`, `shopDate`, `shopDateSource` | `scheduling_status`, `shop_date`, `shop_date_source` | — | `raw_job` | Scheduling activation out of scope. |
| Salesperson / stage | `salesperson`, `jobStage` | `salesperson`, `job_stage` | — | `raw_job` | Header. |
| PO numbers | `poNumbers` | `po_numbers` | — | `raw_job` | JSON array. |
| Line identity/order | derived index | — | `line_id`, `line_index` | `raw_line` | Current line ID is positional and unstable. |
| Mode / Door Type / Config | `mode`, `doorType`, `config` | — | `mode`, `door_type`, `config` | `raw_line` | Direct. |
| Width / Height | `width`, `height` | — | `width`, `height` | `raw_line` | Direct text. |
| Custom slab | `customSlab`, `customSlabWidth`, `customSlabHeight` | — | `custom_slab`, `custom_slab_width`, `custom_slab_height` | `raw_line` | Direct. |
| Hand / Prep / legacy Glass | `hand`, `prep`, `glass` | — | `hand`, `prep`, `glass` | `raw_line` | `glass` active payload blank. |
| Jamb / Sill / W/S / Hinge | corresponding camelCase | — | `jamb_width`, `jamb_type`, `sill`, `weatherstrip`, `hinge_type`, `rip_jamb` | `raw_line` | Direct. |
| Line Notes / Qty / status | `notes`, `qty`, `lineStatus` | — | `notes`, `qty`, `line_status` | `raw_line` | Mirror defaults qty 1/status Active. |
| Timestamp / Last Saved | `timestamp`, `lastSavedAt` | — | `timestamp`, `last_saved_at` | `raw_line` | Often absent from browser mirror input. |
| RO / material / thickness | corresponding camelCase | — | `ro_width`, `ro_height`, `material`, `door_thickness` | `raw_line` | Direct. |
| Glass state/detail | corresponding camelCase | — | `glass_calc_status`, `glass_workorder_detail`, `glass_warnings`, `glass_blockers`, `glass_override` | `raw_line` | Direct. |
| Glass units/calc | `glassUnits`, `glassCalc` | — | `glass_units`, `glass_calc` | `raw_line` | JSON. |
| Vendor copy | `vendorCopyText` | — | `vendor_copy_text` | `raw_line` | Direct. |
| Panel sidelight state | `sidelightType`, `panelSidelightWidth`, `panelSidelights` | — | only inside `glass_calc` | `raw_line` | No dedicated columns in mirror projection. |

## 11. Required native security behavior

- Browser controls are not authorization. Every read/write service must resolve authenticated access server-side.
- `jobs:none` has no Job Intake access.
- `jobs:view` may list/open jobs and inspect active and archived door lines. It may not mutate lines or lifecycle state.
- `jobs:view` may generate a preview from the last saved aggregate and print that saved work order. These operations are read-only and must be enforced at the route/page, server generation, print preparation and UI boundaries.
- `jobs:use` may create/edit jobs; add, edit, duplicate, permitted-merge and reorder lines; reversibly archive/remove and restore lines; confirm a Draft with at least one valid active line; and return a Confirmed Job to Draft.
- `jobs:use` also has the same saved-work-order preview/print access. Unsaved changes, stale-revision failures and failed saves block print until an explicit save succeeds; print never saves automatically.
- `jobs:view` may not email work orders. `jobs:use` may send only the last successfully saved work order through the controlled J3 test adapter to a selected allowlisted internal recipient. Customer Email is never an approved fallback.
- Test-email permission and recipient checks must be repeated in any applicable route/page authorization, server action, email service/adapter, recipient-selection service and UI controls. J3 exposes no allowlist administration.
- The recipient-selection service must read and validate the server-only local allowlist, disclose only approved choice fields, and fail closed. The send service must re-resolve the selected stable recipient ID server-side and reject arbitrary browser-supplied email authority.
- Manager status provides no implicit permission fallback. Server enforcement must use the explicit `jobs` access level for every line action and lifecycle transition.
- J2 exposes no permanent door-line delete. Archive/remove and restore operate on the same stable line identity.
- J1-J4 must have no Supabase intake mutation path: no browser table writes, authenticated server writes, service-role writes, mutation RPC, RLS policy, or grant.
- Eventually, use a narrow authenticated database RPC/transaction with RLS/grant review. Never use `createTrustedReadOnlySupabaseClient` for intake writes.
- `ON DELETE CASCADE` is a database integrity property, not permission to expose hard deletion.

## 12. Open decisions requiring approval

| Decision | Recommended starting point | Alternatives / approval question |
|---|---|---|
| **Resolved: pre-BizTrack draft identity** | A job is saveable without a Sales Order; first save assigns a permanent immutable internal job identity; Sales Order remains separate, nullable and editable; lines stay attached to internal identity; no draft Production Board/production/fulfillment/Calendar effects. | **Approved.** Do not use fake or temporary Sales Order primary keys. J5 must design the hosted schema representation. |
| **Resolved: visible pre-BizTrack identifier** | Assign a unique, never-reused human-readable DoorGo reference. Show it only while Sales Order is blank; once Sales Order exists, use Sales Order throughout normal UI/print and retain the DoorGo reference only for audit, recovery and historical traceability. | **Approved.** Exact temporary-reference format and allocation mechanism are J1 implementation details unless later evidence requires approval. Neither visible value is a relational key. |
| Remaining draft lifecycle | Explicit Draft state separate from deployed active/archived/deleted semantics. | Abandoned Drafts remain retained in J2 local disposable storage. Later purge/retention policy remains open. Transition authority and last-valid-active-line behavior are resolved: `jobs=use` may confirm with one valid active line and may return Confirmed Job to Draft; an edit/archive that would leave a Confirmed Job without a valid active line is blocked until the user first returns it to Draft or adds another valid active line. |
| **Resolved: confirmation requires Sales Order?** | No. `Confirmed Job` represents business/customer commitment; BizTrack entry is a separate downstream milestone. Confirmation must not itself create production, fulfillment, or Calendar records. | **Approved.** Do not couple confirmation to BizTrack identity or production readiness. |
| **Resolved: confirmed-job minimum lines** | Draft may save with zero lines. Transition to `Confirmed Job` requires at least one line passing the complete deployed line-validation contract. | **Approved.** Sales Order, Salesperson, Shop Hours, fulfillment, booking and Calendar are not confirmation prerequisites. |
| **Resolved: J2 door-line permissions** | `jobs=view` may inspect active/archived lines but perform no line mutation. `jobs=use` may add, edit, duplicate, permitted-merge, reorder, archive/remove and restore lines. | **Approved.** Removal is reversible/archive-style; J2 UI exposes no permanent line deletion. Manager provides no fallback. |
| **Resolved: Draft/Confirmed transition permissions and last-valid-active-line behavior** | `jobs=use` may confirm when one valid active line exists and may return Confirmed Job to Draft while preserving all identities. `jobs=view` may not transition lifecycle. | **Approved.** Archived lines do not count. Removing/invalidating the final valid active line of a Confirmed Job is blocked with instructions to first return to Draft or add another valid active line; no automatic transition occurs. No transition or line action creates production, fulfillment, Calendar or scheduling records. |
| **Resolved: salesperson behavior** | Default new jobs from the signed-in user's configured sales identity; allow any `jobs=use` user to edit/reassign; save a historical snapshot; allow missing through confirmation but block readiness. | **Approved.** Profile changes do not rewrite jobs. The source/admin model for configured sales identity remains open. |
| Production-readiness gate | Use an explicit state/decision separate from confirmation and evaluate all approved prerequisites before downstream eligibility. | Approve whether it requires Sales Order, salesperson, authoritative Shop Hours, complete intake, fulfillment information, and any override workflow. |
| Internal job-ID format | Use a permanent opaque generated identifier that is not a Sales Order. | UUID or ULID remains to be approved; its immutability and first-save allocation are already decided. |
| **Resolved: J2 local line identity/order** | Generate immutable UUID `lineId` at first line creation; treat `lineIndex` as mutable display/order data and preserve `lineId` through reorder/archive/restore. | **Approved for J2 local storage.** Hosted representation, import handling and hosted reorder mechanics remain J5 decisions. |
| **Resolved: J2 local aggregate save** | Store header plus all active/archived lines together and write the complete aggregate in one atomic local-file operation. | **Approved for J2.** Later hosted implementation still requires one authenticated database transaction/RPC. |
| **Resolved: J2 aggregate concurrency** | One job `revision` covers header and line changes; every aggregate change advances it and stale expected revisions are rejected. | **Approved for J2.** Hosted token representation remains a J5 decision. |
| **Resolved: J3A non-glass frame/cut detail source** | Use one pure shared jobs/domain calculator over repository-saved line inputs; J2 and J3A consume the same deterministic structured result. Do not persist duplicated derived output solely for work orders. | **Approved.** J3A may call this calculator without violating saved-source rules. Existing persisted J2 glass geometry remains authoritative for glass. No formula duplication is permitted in React, document mapping, printing or pagination. |
| Phone/Email | Add dedicated nullable normalized columns after separate migration review; retain raw JSON during transition. | Keep only raw JSON (not recommended); decide validation and search/index needs. |
| **Resolved: line archive/restore permission** | `jobs=use` may archive/remove and restore door lines; `jobs=view` may inspect both states. | **Approved for J2.** These operations preserve line identity. Job-level archive permission remains separate and open. |
| Line deletion | Do not expose permanent line deletion through J2 UI. | **Resolved for J2.** Any future administrative purge requires separate approval, dependency review and audit design. |
| **Resolved: J2 job deletion/abandoned Drafts** | Expose no permanent job deletion and retain abandoned Drafts in local disposable storage for now. | **Approved for J2.** Later retention, archive and purge policy remains open. |
| Cascade delete | Never expose through ordinary UI initially. | Controlled administrator purge with dependency preview/audit only. |
| **Resolved: J2 permission semantics** | none=no access; view=read jobs and active/archived lines; use=J2 job/line edits and approved lifecycle transitions. | **Approved for J2.** J3 preview/print and controlled test-email permissions are resolved separately below. |
| **Resolved: J3 saved work-order preview and print permission** | `jobs=view` and `jobs=use` may preview and print only the last successfully saved aggregate; `jobs=none` has no access; manager provides no fallback. | **Approved.** Print is read-only, never auto-saves or advances revision, and is blocked by unsaved changes or an unsuccessful/stale save with the exact message “Save the job before printing the work order.” Enforce at page/route, server generation, print preparation and UI boundaries. No audit/delivery, hosted, production, fulfillment, scheduling or Calendar side effect. |
| **Resolved: J3 controlled test-email permission** | `jobs=use` may send the last successfully saved work order through the controlled J3 test adapter to a selected internal allowlisted recipient; `jobs=view` may preview/print but may not email; `jobs=none` has no access; manager provides no fallback. | **Approved.** No automatic save, mixed revision, customer-Email fallback, real/production outbound delivery, identity/revision/lifecycle change, hosted write or operational side effect. Enforce at route/page where applicable, server action, adapter/service, recipient-selection service and UI. J3 users cannot administer the allowlist. |
| **Resolved: J3 controlled-recipient source and initial owner** | Store JSON recipient entries in a server-only `.env.local` setting such as `DOORGO_WORK_ORDER_TEST_RECIPIENTS_JSON`; the app operator defines/maintains it outside DoorGo. Resolve stable IDs server-side and expose only approved choice fields. | **Approved.** Never use `NEXT_PUBLIC_`, reveal raw configuration, trust arbitrary browser email, provide J3 administration or fall back. Missing/malformed/empty/duplicate-ID/invalid-email/unsafe configuration fails closed with no recipients and no send. No hosted directory/schema work or committed secret. |
| **Resolved: J3 local test-adapter destination and capture behavior** | Perform no network delivery; atomically capture one complete message/PDF package per test send under ignored `.local-data/work-order-test-outbox/`, then expose the exact captured PDF through the UI. | **Approved.** Capture recipient identity, subject/body/PDF, visible/internal job IDs, saved revision, requesting user and timestamp. Show “Test email captured.” and no-real-delivery wording, never “Email sent.” Failures leave no partial capture or business/operational mutation. Local review/manual removal is outside DoorGo; no J3 outbox administration UI. |
| **Resolved: J3 PDF filename** | `Work_Order_<SalesOrder>.pdf` when BizTrack Sales Order exists; otherwise `Work_Order_<DoorGoReference>.pdf`, using the same sanitized filename across preview/download, controllable browser PDF save, outbox PDF and capture metadata. | **Approved.** Sales Order suppresses DoorGo reference. Never include internal UUID, revision, customer/site/contact data. Replace unsafe/path/control/platform characters, collapse replacements where practical and fail safely without a valid visible identifier. Revision and identity remain in capture metadata, not the filename. |
| **Resolved: manager fallback** | No implicit fallback, consistent with the current auth contract. | **Approved.** Explicit `jobs` access is authoritative. |
| Future BizTrack synchronization | Preserve DoorGo internal identity; attach nullable Sales Order, durable external ID, sync state, and last-sync time only after J5 design. | Approve API ownership/direction, conflict rules, retries, idempotency and audit. No columns are designed in J0. |
| Hosted activation | Only J6, after J1-J4 acceptance and J5 schema/RLS/RPC review, dry run and explicit go-live approval. | No earlier activation. |

## 13. Proposed implementation sequence

1. **J1 — local/disposable header workflow:** pure contracts and validation; create/save/reopen/edit a pre-BizTrack Draft with hidden permanent internal identity, non-reused temporary DoorGo reference, and nullable/editable Sales Order; implement visible-identifier precedence; allow zero-line Draft saves; default/reassign snapshot Salesperson under `jobs=use`; test that identifier edits preserve job/line identity and that Draft/confirmation alone confers no production eligibility; no Supabase mutation. The exact DoorGo-reference format/allocation mechanism is a J1 implementation detail.
2. **J2 — local/disposable door-line intake:** port active mode/config/geometry/glass rules; stable IDs; enforce at least one deployed-valid line at Draft-to-Confirmed transition; atomic aggregate save; rollback, reorder, retry and concurrency tests.
3. **J3 — work order, print and email:** first add the approved pure shared non-glass frame/cut calculator in the jobs/domain layer and verify J2/J3 callers receive identical deterministic structured output from persisted inputs. Reproduce generated content, pagination and light-only landscape output using repository-saved aggregate data, persisted J2 glass results and that shared calculator; never place formula logic in the document mapper or renderer. `jobs=view` and `jobs=use` may preview/print only the last successfully saved aggregate; unsaved or unsuccessfully saved state blocks print, and Print Work Order never auto-saves. Only `jobs=use` may test-email that saved output, only through a fail-closed local capture adapter to an internal recipient re-resolved by stable ID from the server-only `.env.local` allowlist maintained by the app operator. The adapter atomically writes a complete ignored outbox capture, visibly exposes its exact PDF and performs no network/customer/production delivery. PDF filenames use sanitized visible-identifier precedence consistently across preview, print/save and capture.
4. **J4 — complete local verification:** parity fixtures from deployed behavior, responsive/accessibility/browser tests, disposable PostgreSQL integration, failure injection and workflow acceptance. No scheduling writes.
5. **J5 — hosted schema/security preparation:** read-only schema confirmation; required immutable internal-job-ID key, permanent unique/non-reused DoorGo-reference storage, and separate nullable/editable Sales Order design; line foreign-key transition; optional future BizTrack external ID/sync state/last-sync design; Phone/Email and version migration design; RLS, grants, RPC, rollback and activation plan. Do not apply during planning.
6. **J6 — controlled hosted activation:** explicitly approved migration application and gated authenticated writes, followed by controlled verification and rollback readiness.

J1-J4 must perform no scheduling or hosted intake writes. Production booking and Calendar behavior are outside the native intake implementation contract.

## 14. Sufficiency and traceability conclusion

The deployed files and approved pre-BizTrack identity, confirmation, minimum-line, and salesperson invariants are sufficient to begin **J1 contract implementation after review** for local/disposable header behavior. The remaining draft-lifecycle details, production-readiness criteria, sales-identity configuration source, and identifier formats must be resolved or represented behind replaceable interfaces. The sources are also detailed enough to build J2 parity tests, but the supplied hosted facts are not sufficient to activate hosted writes: the current primary-key model does not represent the approved identity separation, future BizTrack synchronization fields are intentionally undesigned, and exact column types/defaults/nullability, all constraints, grants, RLS posture at activation time, and migration history must be re-inspected read-only in J5.

Major identifier index:

- Code.gs storage/lifecycle: `JOB_HEADERS`, `DOOR_HEADERS`, `DGData.jobs`, `DGData.jobLines`, `saveJobToSheets_`, `saveDoorLinesWithoutDeleting_`, `archiveJobInSheets_`, `restoreJobInSheets_`, `markJobDeletedInSheets_`.
- Code.gs mirror: `dgSupabaseMirrorWritesEnabled_`, `dgSupabaseMirrorLineId_`, `dgNormalizeJobForSupabase_`, `dgNormalizeJobLineForSupabase_`, `dgMirrorJobLinesToSupabase_`, `dgMirrorSavedJobToSupabase_`.
- Code.gs output: `getGeneratedWorkOrderHtml`, `generatedDetailBlock_`, `buildGeneratedWorkorderPdfBlob_`, `emailWorkOrder`.
- Index.html header/lifecycle: `newJob`, `readJob`, `writeJob`, `validateJob`, `payload`, `saveCurrentJob`, `openJob`, `renderPrevious`, `exitCurrentJob`.
- Index.html lines/glass: `renderLine`, `buildLine`, `validateLineForCommit`, `calculateGlass`, `runGlassCalc`, `editLine`, `saveLine`, `renderDoorList`.
- Index.html active UI: `#currentJobCard`, `#desktopJobWorkspace`, `#desktopJobActionBar`, `#doorList`, `#previousJobs`, `#roPanel`, `#unsavedEntryModal`, `#status`; `setupDesktopJobWorkspace`, `detectTruePhone`, `applyTerminalTheme`.

## 15. J2B deployed glass and geometry contract

Status: deployed behavior extracted for native J2B design. This section is authoritative for parity where the browser and backend agree. Items in the open-decisions table are not approved implementation choices and must not be guessed.

### A. Configuration topology and availability

All deployed glass configurations are **Exterior only**. `INTERIOR_CONFIGS` contains only D, DD, PKT and B.P.; `EXTERIOR_CONFIGS` additionally contains every configuration below. “Left” and “right” describe the deployed diagram viewed from the same orientation as the displayed unit. Mirrored single-sidelight configurations are distinct.

| Config | Doors | Sidelights | Transom | Required entry | Calculated/stored output and work-order meaning |
|---|---:|---|---|---|---|
| SD | 1 | one on the left | no | RO width; sidelight type; panel width when panel, otherwise sidelight glass | Header/sill, jamb legs, one sidelight glass unit or one panel. Diagram is sidelight-divider-door. |
| DS | 1 | one on the right | no | Same as SD | Same math as SD, but diagram is door-divider-sidelight and the mirrored configuration remains distinct. |
| SDS | 1 | left and right | no | RO width; one shared sidelight type; one shared panel width or glass type | Two equal sidelights/panels surrounding one door; glass output is `2 @`. |
| SDDS | 2 | left and right | no | Same shared sidelight inputs as SDS plus RO width | Two equal sidelights around the unchanged DD core. Glass-side width is derived from RO; panel-side header is derived from selected panel width. Native provisional Shop Hours base: 270 minutes. |
| T/D | 1 | none | yes | RO width, RO height, transom glass | Single door with transom; header width is door slab plus 1/4 inch; transom width is header less 1/8 inch. |
| T/DD | 2 | none | yes | RO width, RO height, transom glass | Double-door core with transom; transom width is DD header less 1/8 inch. |
| T/SD | 1 | one left | yes | RO width/height; sidelight type; panel width or sidelight glass; transom glass | SD lower assembly with transom across the calculated unit. |
| T/DS | 1 | one right | yes | Same as T/SD | Mirrored DS lower assembly; not silently normalized to T/SD. |
| T/SDS | 1 | left and right | yes | RO width/height; one shared sidelight type/width or glass; transom glass | SDS lower assembly with transom. |
| T/SDDS | 2 | left and right | yes | RO width/height; shared sidelight type/width or glass; transom glass | SDDS lower assembly with transom. Native provisional Shop Hours base: 330 minutes. |

Every active glass line requires the ordinary J2A identity and door fields: mode, config, nominal width/height, positive quantity, completed RIP size when selected, valid custom wood slab dimensions when selected, and the applicable jamb/swing/material/prep values. Required glass measurements may remain incomplete only under the approved `Glass Detail Needed` workflow below. There are no user-entered unit-width, unit-height, individual left/right glass-width, transom-height or mull/post fields. Those values are calculated.

### B. Progressive glass workflow and state clearing

1. Selecting an Exterior glass configuration makes the `#roPanel` Glass Measure card visible. Plain D/DD show it only for Custom RO or existing RO values; PKT clears RO; B.P. uses the same card as Finished Opening.
2. RO width appears for every glass configuration and is mandatory. RO height appears and is mandatory for transom configurations. For non-transom glass configurations it is optional and normally hidden until already populated; guidance shows the standard height and asks for it only for a short/custom opening.
3. A sidelight configuration reveals one Sidelight Type selector. `glass` reveals one shared Sidelight Glass selector. `panel` hides sidelight glass and reveals one shared panel-width control. Fiberglass widths are 11-3/4 or 13-3/4 inches; Wood accepts a measurement. Two-sided configs use the same type and width on both sides.
4. A transom configuration reveals a separate Transom Glass selector. With panel sidelights the label becomes “Transom Glass Type”; a panel-only non-transom quick calculation hides the general glass selector.
5. Calculate Glass / Cut validates and calculates, then reveals compact result text, vendor copy when glass units exist, and the diagram when `calc` exists. The approved native “Leave Detail Needed” action instead saves the active line with status `Glass Detail Needed`, preserving its stable identity, configuration, quantity, ordinary door details, unit-level sidelight type, and every measurement/selection already entered. Reopen/edit must restore those partial values so work can continue. The deployed browser constructs a Needs Glass Calc result but its browser/backend validators then reject save; that contradiction is a deployed defect and must not be reproduced.
6. Every native free-entry geometry control must visibly require explicit shop units and show examples containing `'` and `"`. Structured selectors and separately labelled Feet and Inches controls remain unambiguous and do not require typed unit symbols. Validation occurs without substituting a selected standard dimension for invalid custom input.

Configuration change sets `lastCalc` to null and hides prior result/vendor output. It preserves hand, prep, jamb width/type and hinge only if still valid. PKT clears RO width and height unless Custom RO is active. Mode change resets the glass selectors to shared glass, fiberglass panel width 11-3/4, blank wood panel width, default glass terms, clears `lastCalc`, and selects D. The deployed browser does not explicitly clear every hidden glass input on compatible config changes; it excludes inapplicable values when `buildLine` constructs the saved line. Native J2B must correct that ambiguity using the approved retention rules below. Validation must accept only unit-level `Glass` or `Panel` and reject legacy or malformed mixed-type state.

#### Approved configuration-change field retention

- Preserve a value only when it still describes the same physical component with the same meaning. Clear it when it no longer applies or its physical meaning changes; matching field names alone do not establish compatibility.
- Switching between SD and DS must not transfer a sidelight measurement from one physical side to the other. Clear the side-specific measurement that no longer represents the same component. Preserve common RO dimensions, unit height, glass type, unit-level sidelight type and compatible frame selections when they retain the same meaning.
- Switching the unit-level sidelight type from Glass to Panel preserves shared sidelight widths that retain the same physical meaning, clears glass-only dimensions, and clears completed glass calculation output, warnings, blockers, vendor copy and any geometry override that no longer applies. Panel to Glass follows the same rule and requires entry of every newly applicable glass-only measurement.
- Changing from a glass, sidelight or transom configuration to a non-glass configuration clears glass measurements; sidelight/transom calculation output; glass calculation status, warnings and blockers; vendor-copy text; glass work-order calculation detail; all manual-override values, reason, applying user and timestamp; and panel-sidelight state that no longer applies.
- Any change to configuration or another field used by geometry clears the completed calculation and manual geometry override and requires recalculation before production readiness. Unrelated nongeometry edits preserve a valid calculation and override.
- Compatible configuration changes may preserve measurements only under the physical-component rule above. The UI must not display stale hidden state from a prior configuration, and cleared state must remain cleared through edit, save and reopen. These transitions never change the stable job or line identity.

### C. Field inventory and native mapping

| Deployed UI/property | Meaning, units/default | Native J2B representation |
|---|---|---|
| `sidelightGlassInput`, `transomGlassInput` | Glass term code; defaults from `DEFAULT_TERMS`/deployed settings. Defaults are Clear (`CLR_SB60_K4SG`) and Satin Etch (`SAT_SB60_K4SG`). | `glassUnits[].termCode/glassType`; `glass` remains a legacy blank field. |
| `roWInput` / `roWidth` | Rough-opening width, measurement text; mandatory for glass. | `roWidth`; free-entry text requires explicit feet/inches notation and normalizes to inches at 1/16-inch precision. |
| `roHInput` / `roHeight` | RO height; mandatory for transom, optional non-transom cut-down reference. | `roHeight`; the same explicit-unit rule applies to free entry. |
| nominal width/height and custom slab fields | Select slab; fiberglass actual slab deductions apply, Wood/Interior use full nominal dimensions, custom Wood uses entered actual dimensions. | Existing width, height, material, custom-slab fields. Both Custom Slab dimensions require explicit units; normalized inches are retained in `glassCalc.slab`. Invalid custom values never fall back to the selected standard size. |
| `sidelightType` | One authoritative unit-level enum: `Glass` or `Panel`. It applies to every sidelight in the unit, including a single sidelight. Mixed types are invalid; side-specific position/dimensions may still differ. | Persist one authoritative unit-level sidelight type in the local aggregate and retain it in `glassCalc.sidelightType`. Do not create independent left/right type fields and do not rely only on current hosted columns. |
| `panelSidelightWidth` / `panelWidth` | One shared actual panel width; fiberglass enum above, Wood free measurement. Panel height equals slab height. | Structured panel-sidelight state and `glassCalc.panelWidth/panelHeight`. |
| `panelSidelights` | Calculated array with position, material, formatted width/height and qty. | Preserve in panel-sidelight state and/or `glassCalc.panelSidelights`; do not lose it on reopen. |
| calculated sidelights/transom | Position, formatted width/height, term/shop text and qty. | `glassUnits`; numeric/formatted dependencies in `glassCalc`. |
| status/detail/messages | Complete, Warning, Blocked or Needs states; work-order detail and newline-separated messages. | `glassCalcStatus`, `glassWorkorderDetail`, `glassWarnings`, `glassBlockers`. |
| `glassOverride` | Deployed builder always writes `No`; native approved model is a structured manual-geometry approval containing calculated values, accepted manual values, reason, applying user and applied timestamp. | `glassOverride`; preserve complete audit state locally without designing hosted columns. |
| vendor output | Generated from calculated units and deployed glass-term templates. | `vendorCopyText`. |

There are no independent left/right sidelight measurements, explicit unit-size inputs, explicit transom-height input, or mull/post inputs. Dividers are fixed calculation constants: 2-1/4 inches for glass-side assemblies and 1-1/2 inches for panel-side assemblies. Each side assembly also includes 1/8 inch operating allowance. Sill, threshold/weatherstrip and jamb selection are ordinary exterior fields but do not vary the deployed glass formulas; swing affects vertical deductions.

The native aggregate must persist only fields applicable to the selected configuration and type. Configuration switching applies the approved physical-meaning retention rules before validation and persistence, so hidden stale values cannot survive merely because an earlier configuration used the same storage property. Save/reopen must reproduce the cleared or retained state exactly.

### D. Panel-sidelight model

Panel sidelights are available for SD, DS, SDS, SDDS, T/SD, T/DS, T/SDS and T/SDDS. SD/T-SD places the side assembly left; DS/T-DS places it right; SDS/SDDS transom variants place assemblies on both sides. Sidelight type is selected once for the entire door unit and every sidelight in that unit must use the same type: `Glass` or `Panel`. Mixed Glass/Panel units are prohibited. This unit-level rule applies equally to one-sidelight configurations and to future configurations with additional sidelights, including DSSS. Side-specific position and dimensions may still be stored independently where geometry requires them, but type may not differ by side.

Panel selection changes the divider from 2-1/4 to 1-1/2 inches, replaces calculated glass-side width with selected actual panel width, sets panel height to actual slab height, changes diagram fill/label from glass to door-panel, emits a PANELS work-order section, and omits sidelight vendor glass. A transom remains glass and still emits vendor copy. Panel state affects minimum RO and header formulas.

The browser constructs top-level `sidelightType`, `panelSidelightWidth` and `panelSidelights`, and nests `sidelightType`, panel dimensions and `panelSidelights` in `glassCalc`. However, deployed `DOOR_HEADERS`/`saveDoorLinesWithoutDeleting_` do not persist the three top-level panel properties. After reopen, `editLine` looks for those missing top-level properties instead of restoring them from `glassCalc`, and work-order panel fallback also depends on them. This is a deployed persistence defect that native J2B must correct, not reproduce. Native persistence must preserve one authoritative unit-level sidelight type plus the required side-specific geometry and calculated panels as part of the local aggregate, while retaining the complete `glassCalc` for traceability. Save, reopen, edit and duplicate must preserve that unit-level selection. A hosted-column design is out of scope.

### E. Measurement parsing and formatting

- Every rough-opening, actual-slab, final-door, minimum-RO, jamb-leg, header/sill, sidelight, panel, transom, divider/mull/post, cut-down, glass, manual-override and other shop-geometry dimension uses **inches-only** notation. This applies to inputs, calculated display, diagram labels, work orders and vendor copy.
- Free-entry controls permanently display an attached `"` suffix while users enter only the numeric portion. Accepted input includes `54`, `54 1/2`, `54-1/2` and `54.5`; feet-and-inch notation is rejected in these shop-geometry controls.
- Accepted values normalize to inches at 1/16-inch precision and display/print canonically as `54"`, `54 1/2"`, `82"` or `79 1/8"`. Blank, malformed, zero, negative, unsupported-fraction and unsupported-precision inputs are invalid and never fall back to a standard size.
- Existing persisted feet/inch shop-geometry values are a read-compatibility case: load converts them losslessly to equivalent inches. New user entry does not accept that legacy notation.
- When Custom Slab is selected, width and height are required and follow the same inches-only contract. Validation explains accepted numeric-inch formats while the permanent UI suffix supplies the unit.
- Nominal door-size selectors and descriptions are the explicit exception. Standard sizes such as `2'6"`, `3'0"`, `6'8"`, `8'0"` and `3'0" × 6'8"` retain conventional feet/inches notation; they are not free-entry shop geometry.
- The deployed parser's ambiguous behavior and contradictory custom-slab message are defects native J2B must not reproduce.

### F. Authoritative calculation order and formulas

All dimensions below are inches. Calculations operate on numeric values and format outputs only at the end to 1/16 inch.

1. **Actual slab:** Fiberglass width is nominal minus 1/4, except 36→35-3/4 and 42→41-3/4; fiberglass height is 80→79, 96→95, otherwise nominal minus 1. Wood uses nominal full size. Custom Wood uses entered actual width/height.
2. **DD core header:** `2 × slab width + 13/16 + 1/4`. SDDS/T-SDDS retain this exact core.
3. **Glass divider:** 2-1/4 per sidelight. **Panel divider:** 1-1/2 per sidelight. Each sidelight/panel assembly also uses 1/8 operating allowance.
4. **Header width:** panel unit = selected panel side assemblies plus either single slab + final 1/4 or unchanged DD core; glass SDDS/T-SDDS = `RO width − 2`; DD/T-DD = DD core; D/T-D = `slab width + 1/4`; other glass-side units = `RO width − 2`.
5. **Minimum RO width:** `header width + 2`. Too narrow is blocking for glass double/T-D and for panel assemblies. SDDS glass width is derived from the RO and becomes blocking if nonpositive.
6. **Glass sidelight width:** SD/DS/SDS family = `(RO width − 2 − divider × side count − slab width − 1/4 − 1/8 × side count) ÷ side count`. SDDS/T-SDDS = `(header width − DD core − 2 × divider − 2 × 1/8) ÷ 2`.
7. **Non-transom vertical:** swing deduction is 2 for outswing or 2-1/4 for inswing. Standard jamb leg = slab height + deduction; standard RO height = jamb leg + 1/2. If RO height is entered, jamb leg = RO height − 1/2; requested door height = jamb leg − deduction; final door height is the lesser of slab and requested height; cut-down is slab minus final. Glass sidelight height = final door height + 1/8.
8. **Transom vertical:** jamb leg = RO height − 1/2 and selected slab height is not cut down. T/D transom height = `RO height − slab height − 4-3/8` inswing or `− 4-1/8` outswing. Other transom configs use `− 5-1/8` inswing or `− 4-7/8` outswing. Panel-sidelight transoms add 3/4 back to that result.
9. **Transom width:** panel assemblies, T/DD and T/D use `header width − 1/8`; remaining transom configs use `RO width − 2-1/8`.
10. **Panel output:** selected panel width × slab height, qty equal to side count. There is no glass unit for a panel sidelight.

Blockers are evaluated before units are emitted. A blocked calculation stores no glass/panel units and no valid diagram calculation for early missing-input returns. A complete/warning calculation stores formatted RO, config, swing, slab, header, jamb leg, final door height, sidelight/panel/transom dimensions, divider, required panel RO, standard RO height, optional-height flag and cut-down in `glassCalc`.

### G. Status, saving, warnings and blockers

| State | Deployed meaning and save behavior |
|---|---|
| `Complete` | No blockers or warnings; active line may save. |
| `Warning` | Geometry is calculable but has a reviewable warning/mismatch. It may save for intake. A `jobs=use` user may apply a reasoned Manual Override only when every required measurement exists and the condition is not a hard blocker. Production readiness follows the warning classification unless a valid override accepts it. |
| `Blocked` | Impossible/invalid geometry or invalid custom slab; browser blocks Add/Update and backend rejects. |
| `Needs RO` | Required RO width or transom height missing; blocks browser and backend save. |
| `Glass Detail Needed` | Approved native incomplete-intake state. The active line may save with all partial values and identity preserved. It is not a complete calculation, requires no override/reason, appears in Needs Attention, and blocks production readiness/scheduling until completed. A valid recalculation clears it. |
| deployed `Needs Glass Calc` | Deployed “Leave Detail Needed” state that browser/backend validation incorrectly rejects. Treat as a legacy/import alias for native `Glass Detail Needed`, preserving partial data; do not reproduce the rejection. |
| `Ready` / `Not Needed` | Non-glass/no-RO line state; no glass detail required. |
| `Manual Override` | Approved native state for a fully measured, reviewable warning/mismatch accepted by `jobs=use` with reason and audit metadata. It is visibly badged and auditable but is not actionable Needs Attention; it may become production-ready when no other blocker remains. |
| unsupported | Not a valid deployed Exterior config; there is no glass calculation contract for it. |

Exact deployed warnings are: RO taller than the standard full-height unit (verify jamb/extensions); door will be cut down by the calculated amount; cut-down greater than 2-1/2 inches (confirm before cutting); and, for non-glass D/DD custom RO only, RO below recommendation (verify fit). The ordinary cut-down line is retained in `glassWarnings` but intentionally filtered from visible/work-order warning sections because the detail already prints the final cut height. Native classification must distinguish a reviewable warning/mismatch from a hard blocker before offering override.

Exact blocker groups are:

- missing/invalid custom Wood slab width or height;
- missing RO width for any glass config;
- missing RO height for transom;
- RO narrower than the calculated minimum for applicable double/T-D or panel assemblies;
- invalid/nonpositive panel width;
- zero/negative sidelight width or height;
- zero/negative transom width;
- transom height zero/negative because the RO is too short;
- zero/negative header length or jamb-leg length.

Hard blockers may never be overridden. They include missing required measurements, impossible geometry, nonpositive calculated dimensions, unsupported configurations, invalid measurements and every other state explicitly classified as blocking. Missing required glass measurements use `Glass Detail Needed`, not Manual Override. Custom Slab width and height are both required when selected; blank, unitless, malformed, zero, negative, unsupported-fraction or unsupported-precision values are blocking editor errors. The message must explain the accepted explicit-unit formats with `'` and `"` examples. Action calculation blockers are also displayed in the result area and toast.

No deployed warning exists specifically for unusually small/large glass beyond nonpositive geometry. No deployed dimension-mismatch tolerance or override workflow exists; the native rules below supply the approved behavior independently of the resolved strict parser and field-retention contracts. Native `Glass Detail Needed` is neither a warning acknowledgement nor a blocker against saving the intake line: it is a persistent Needs Attention condition. It blocks production readiness and scheduling, not Draft/Confirmed intake persistence. Archiving the line removes its Needs Attention contribution; restoring it restores the same incomplete status and partial data. A properly approved Manual Override retains a visible audit indication but is not actionable Needs Attention.

#### Manual geometry override permission and audit contract

- Override is offered only when all required measurements are present and calculation produces a reviewable warning or mismatch. It cannot bypass `Glass Detail Needed` or any hard blocker.
- `jobs=use` may apply or remove an override. `jobs=view` may inspect it but cannot change it. Manager status provides no fallback.
- Applying an override requires a nonblank reason and stores the calculator's values, accepted manual values, reason, applying authenticated user and applied timestamp. Applying/removing it preserves the stable line identity and advances the aggregate revision.
- A later change to configuration or any measurement/dependency used by geometry automatically clears the completed calculation and effective override. The line must be recalculated and, if acceptance is still needed, receive a new reasoned approval. Unrelated nongeometry edits clear neither a valid calculation nor its override.
- The UI shows a Manual Override badge and presents calculated versus accepted values, reason, actor and time clearly. The override remains auditable after it ceases to be actionable.

### H. Diagram, work-order detail and vendor copy

The canvas is a derived visual and never participates in calculation. It draws the RO envelope, transom, fixed divider gaps, left/right glass or panels, single or paired doors, and a visible DD meeting gap. Labels show entered RO, door nominal/final height, calculated glass dimensions, and panel material/dimensions. SD and DS orientation is distinct. Blockers replace the assembly with a blocked frame/message; missing RO shows an entry prompt.

Dark mode uses dark surfaces and light labels; Light uses a white canvas and dark labels with equivalent information. Responsive CSS reduces canvas height and stacks results on phone. Quick Glass print redraws with `theme='print'`, a white background and light print stylesheet. Generated work orders are likewise light-only. Obsolete earlier CSS phases are not contract authority.

`glassWorkorderDetail` is stored browser result text, but generated work orders recalculate authoritative frame cuts from the saved line and then append PANELS, GLASS and filtered WARNINGS sections. The main row prints entered RO, a compact Glass marker, or a review/detail-needed marker. A native `Glass Detail Needed` line must remain visibly marked as incomplete and must never be presented as order-ready glass. A Manual Override line/detail and work order must show the badge/indicator, calculated and accepted values, and override reason; actor/timestamp remain available in audit detail. `glassUnits` supplies position, qty, dimensions, shop glass text and term code. `panelSidelights` supplies analogous panel lines when preserved.

`vendorCopyText` is generated at calculation/save time from `glassUnits`. Each unit prints its position and optional qty, then substitutes width/height into the deployed term template and optional second line. Sidelights change vendor tokens `3mcltmp→4mcltmp` and `3msatmp→4msatmp`; transoms retain the base template. Panels generate no vendor glass line. Vendor copy is stored, while generated work-order detail may be regenerated from structured saved fields.

### I. Shop Hours and line operations

| Exterior config | Base minutes |
|---|---:|
| SD, DS | 180 |
| SDS | 240 |
| SDDS | **270 (4.5 hours; approved provisional native rule)** |
| T/D | 90 |
| T/DD | 120 |
| T/SD, T/DS | 240 |
| T/SDS | 300 |
| T/SDDS | **330 (5.5 hours; approved provisional native rule)** |

The SDDS 270-minute and T/SDDS 330-minute bases are authoritative for native J2B for now even though the deployed source omitted them. The base is multiplied by line quantity. MULTI adds 45 minutes per single unit or 90 per double unit before quantity multiplication. Custom RO adds 30 for D or 45 for DD only when non-transom; the deployed table therefore adds no custom-cut minutes to glass configurations. RIP adds 15 minutes per unit. There is no separate glass addition beyond each configuration's base. SDDS and T/SDDS no longer produce `Estimate incomplete` solely because the deployed base was missing. Manual Shop Hours remain authoritative. These provisional bases may be revisited later if real shop timing demonstrates a better estimate.

All J2B fields are part of line validity, duplication, editing, aggregate revision and save/reopen persistence. An active `Glass Detail Needed` line is save-valid for intake and satisfies the confirmed-job active-line minimum when its ordinary door fields are valid, because confirmation is separate from production readiness. It is never production-ready. Merge equivalence must include the deployed `activeLineKey` fields plus exact `glassUnits`, `glassCalc`, unit-level sidelight type, every partial measurement/selection, calculation status, calculated values, accepted manual values and reason-relevant business state. A complete line and a `Glass Detail Needed` line must not merge; incomplete lines may merge only when every persisted business field and status is equivalent. Overridden lines may merge only when all of those fields match exactly. Duplicate receives a new identity and copies only business/calculation/accepted values and partial data that remain applicable under the same physical-meaning rules; it must not represent the original actor/timestamp as a new approval. If an effective override is needed on the duplicate, it requires a new application by the acting user with a new timestamp. Edit and configuration switching apply retention and clearing before save; save/reopen must preserve the resulting state, including cleared values. Save/reopen and edit otherwise preserve valid override audit state. Reorder preserves identity and state. Archive/restore preserves an override unless a geometry-relevant field changed; such a change clears it under the normal invalidation rule. Archived and hidden Merged lines do not contribute to active counts, Shop Hours or Needs Attention. Restoring an incomplete archived line restores its Needs Attention contribution. Configuration or geometry-input edits invalidate prior calculation and clear the override; unrelated edits do neither. The UI must not reveal hidden values from an earlier configuration. No retention or invalidation action changes the job or line identity. Validation must reject any imported, legacy or malformed aggregate that assigns different sidelight types within one unit rather than silently choosing one.

### J. Security and side-effect boundary

J2B retains J2A permissions: `jobs=view` may inspect all glass/panel and override detail but cannot mutate; `jobs=use` may perform approved line/lifecycle mutations and apply/remove reasoned manual geometry overrides; manager status grants no fallback. Persistence remains local/disposable. A job containing `Glass Detail Needed` may remain Draft or Confirmed Job, but the condition must block production readiness and production scheduling until every required glass detail is completed and a valid calculation clears the status. A properly approved Manual Override may satisfy the geometry portion of production readiness and allow scheduling only when no other readiness blocker remains. Saving, confirming or overriding the job creates no production or scheduling record. J2B adds no browser or trusted-client Supabase write, migration, booking, fulfillment record, scheduling mutation or Calendar mutation, and does not make native intake operational.

### K. J2B open decisions

| Configuration/field | Deployed UI | Deployed backend/persistence | Ambiguity and safest native options | Stop? |
|---|---|---|---|---|
| **Resolved: SDDS and T/SDDS Shop Hours** | Configs are selectable and calculable. | Deployed `shopHoursRuleForLine` omits both. | **Approved provisional native rule:** SDDS = 270 minutes (4.5 hours); T/SDDS = 330 minutes (5.5 hours). Quantity and every existing applicable addition still apply. Revisit only if real shop timing supports a better estimate. | **No. Resolved for native J2B.** |
| Panel sidelight persistence | Builds shared panel type/width and calculated panel output; edit expects top-level state. | Sheet writer omits top-level `sidelightType`, `panelSidelightWidth`, `panelSidelights`; only nested `glassCalc` survives, and reopen does not reconstruct from it. | Native should preserve a structured shared panel state plus full calc. Approval is needed only if left/right independence or a hosted shape is desired. | **No for local fidelity using the deployed shared model; yes before changing it or hosted design.** |
| **Resolved: unit-level sidelight type / no independent panel sides** | One selector controls the unit. | Deployed calculation applies one sidelight type to every side, although top-level persistence is defective. | **Approved:** persist exactly one authoritative unit-level `Glass` or `Panel` type for all current and future sidelights, including DSSS. Side geometry may differ, but type may not. Reject mixed legacy/malformed state and correct rather than reproduce the deployed persistence defect. | **No. Resolved for native J2B.** |
| **Resolved: “Leave Detail Needed” / incomplete glass intake** | Button creates Needs Glass Calc output. | Deployed `calculationIsBlocking` and `validateDoor_` reject save, contradicting the displayed control. | **Approved native behavior:** save as active `Glass Detail Needed`, retain identity and all partial data, show in Needs Attention, allow Draft/Confirmed lifecycle, and block only production readiness/scheduling until valid recalculation clears it. No override or reason is required. The deployed rejection is a defect not to reproduce. | **No. Resolved for native J2B.** |
| **Resolved: manual geometry override** | Badge recognizes Manual Override, but no active deployed workflow produces it. | Builder always writes `glassOverride='No'`; deployed persistence has no reason, actor, timestamp or invalidation logic. | **Approved native behavior:** `jobs=use` may apply/remove only for fully measured reviewable warnings/mismatches, with calculated/accepted values, required reason, actor and timestamp. Hard blockers and missing measurements cannot be overridden. Geometry changes clear it; unrelated edits do not. Valid override can satisfy geometry readiness, remains auditable, and follows the duplicate/merge/archive rules above. | **No. Resolved for native J2B.** |
| **Resolved: configuration-change field retention** | Deployed UI clears `lastCalc` but may retain hidden inputs while changing configurations. | Builder excludes some inapplicable values but does not provide a complete persisted clearing contract. | **Approved native behavior:** retain values only when they describe the same physical component with unchanged meaning. Clear inapplicable or meaning-changed state, prevent SD/DS side transfer, clear all glass/panel/calculation/override output when leaving that domain, invalidate calculation and override for every geometry dependency change, and preserve unrelated valid state. Apply identically across switching, edit, duplicate, save and reopen. | **No. Resolved for native J2B.** |
| **Resolved: inches-only shop geometry and Custom Slab parser** | Deployed browser accepts ambiguous bare values and several explicit formats. | Backend parser is more permissive for malformed tokens, while its Custom Slab message contradicts actual acceptance. | **Approved native behavior:** free-entry shop geometry accepts numeric inches with a permanent `"` UI suffix, normalizes to 1/16 inch and displays/prints in inches only. Legacy persisted feet/inch geometry converts safely on load. Custom Slab requires valid width and height and never falls back. Nominal door selectors retain conventional feet/inches notation. | **No. Resolved for native J2B.** |

No other unresolved configuration formula was found: the deployed geometry explicitly covers all ten listed configurations, including distinct mirrored layout and the DD core rules.
