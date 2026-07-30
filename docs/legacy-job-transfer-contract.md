# Legacy Job Transfer Contract

## Status and authority

This document defines the one-way contract for transferring one explicitly selected job from the legacy DoorGo application into an unsaved native DoorGo editor. The forward persistence/RPC amendment is prepared but unapplied; export and import UI, hosted application, deployment, synchronization, and deletion remain unimplemented and unauthorized.

The accepted workflow is deliberately manual and one-way:

1. A user opens one selected saved job in legacy DoorGo.
2. The legacy application explicitly exports a versioned data payload.
3. The user explicitly imports that payload into a new, unsaved native editor.
4. The user reviews warnings, resolves blockers, and completes missing required fields.
5. The user explicitly saves through the native create boundary.
6. The user reopens the native aggregate and verifies its work order.
7. Only then may the user separately delete or archive the legacy source manually.

There is no synchronization, background discovery, automatic legacy read, automatic save, reverse transfer, or automatic deletion. Native and transferred-native jobs remain invisible and unreadable in legacy DoorGo. Temporary coexistence during review is administrative only: staff must not actively edit the same job in both applications.

## Inspected sources

The deployed legacy snapshot is the ignored, read-only reference at `.local-reference/current-deployed-intake/doorgo_intake_reference/Code.gs` and `Index.html`. `JOB_HEADERS`, `DOOR_HEADERS`, `DGData.jobs`, `DGData.jobLines`, `jobSummaryFromRow_`, `jobLineFromRow_`, `saveJobToSheets_`, `saveDoorLinesWithoutDeleting_`, browser `currentJob`, `buildLine`, `payload`, `validateJob`, `saveCurrentJob`, and `openJob` define its data contract.

The native destination is defined by `lib/jobs/job-intake-types.ts`, `job-intake-contract.ts`, `door-line-contract.ts`, `JobIntakeRepository`, the hosted adapter, and `public.dg_create_native_job(uuid,text,text,text,jsonb,jsonb)` in the accepted persistence contract and migration.

No legacy or hosted runtime data was read during this inspection.

## Legacy source findings

### Storage and authority

The `Jobs` sheet stores the header columns `Job ID`, customer/site/contact fields, status/active markers, created/updated timestamps, derived door-type summary, notes, hinge color, shop-hours value/source, fulfillment dates/plan, scheduling status, salesperson, PO JSON, shop date/source, and job stage. The `Door Intake` sheet stores ordered rows keyed by `Job ID`, including mode, door inputs, dimensions, configuration, handing, prep, glass/jamb/sill/weatherstrip/hinge inputs, quantity, line status, RO inputs, material/thickness, glass status/output JSON, custom-slab inputs, and RIP-jamb state.

Authoritative transfer inputs are the saved user-entered header values, saved line inputs, line order, explicit quantities, and source identity/timestamps. Door-type summary, scheduling status, calculated shop hours, glass calculation status/detail/warnings/blockers, vendor copy, calculated glass units/geometry, timestamps generated only for line saving, and all production/output artifacts are derived or operational and must not be trusted as native authority.

Legacy lines have no durable independent line identifier or individual archive workflow. Their stable source identity is only the selected job plus sheet row/order at export time. The export must therefore include active source lines only, generate a UUID `transfer_line_id` for every payload line, and preserve `source_line_index`; that UUID is stable within the payload and its canonical fingerprint, but is not a claim that the legacy row had a durable UUID.

`saveDoorLinesWithoutDeleting_` may retain superseded sheet rows internally, but the legacy user workflow does not archive individual lines and normal `DGData.jobLines.listForJob` returns active source lines only. The transfer contract neither exports nor invents archived line history.

### Identifiers

The single legacy `Job ID` field is polymorphic. It can contain a BizTrack Sales Order, a preserved `DG-*` reference, a manually entered value, or an automatically generated `JOB-####`. `nextJobId_` scans existing IDs for `JOB-(\d+)`, increments the maximum, and pads to at least four digits. No existing export mechanism classifies these values reliably.

The current work-order HTML/PDF/email paths are output mechanisms, not safe structured transfer mechanisms. Browser `payload()` is an internal save payload, contains derived and operational fields, and invokes Apps Script persistence when used by `saveCurrentJob`; it must not be reused as the transfer contract.

The safest legacy UI location for **Export to New DoorGo** is the saved-current-job action area beside other explicit job-level actions, separated from Save, Archive/Delete, Print, and Email. It must appear only for an opened saved job, require confirmation that current unsaved legacy edits will not be included unless saved first, call a read-only exporter for that exact `Job ID`, and download one JSON file without invoking `saveJob`, mirroring, work-order generation, email, production, or Calendar code.

### Fields that must never be exported as commands

Do not export production booking/action/package rows; Calendar IDs, names, event IDs or sync state; capacity settings or overrides; scheduling queue state; document-move requests or file IDs; fulfillment execution state; email recipients, worker addresses, provider data or send instructions; authentication/session values; spreadsheet IDs; Apps Script configuration; Supabase configuration; executable HTML; scripts; formulas; or function names. Descriptive fulfillment intent and dates may be transferred only as inert editor values.

## Native destination findings

The native editor accepts a header plus ordered `DoorLineInput[]`. A Draft requires customer or site/address but may contain no lines. A Confirmed Job requires at least one valid active line. Lines are normalized through the native dimension, configuration, prep, hinge, non-glass, and glass contracts before persistence. Work orders require a saved aggregate and use BizTrack Sales Order first, otherwise DoorGo reference.

`JobIntakeRepository.create` currently always maps application creates to `p_origin='native'`, null legacy provenance, and native DG allocation. It has no transfer command. The database RPC already recognizes `legacy_transfer`, duplicate Sales Orders, duplicate DoorGo references, and duplicate legacy provenance, but the adapter cannot invoke that path.

For a transferred Sales Order, that Sales Order remains authoritative and visible. For a transferred legacy `DG-######`, that reference remains authoritative and visible. Neither receives a replacement DG reference. A native internal UUID remains separate. A brand-new native job continues to receive a permanent allocated `DG-######`.

The prepared forward migration closes the persistence-contract gap for legacy `JOB-####` IDs with immutable `legacy_job_id` provenance. It never treats that identifier as a Sales Order or allocates a replacement DG reference. Sales Orders, transferred DG references, and legacy job IDs share one unified primary-identifier presentation with precedence Sales Order, DG, then legacy job ID. Unknown identifier formats remain blocked until explicitly classified.

## Mapping matrix

Status meanings: **Supported** maps safely after validation; **Review** requires explicit user confirmation or native recomputation; **Unsupported** blocks save or is deliberately excluded.

| Legacy source | Native destination | Conversion / normalization | Requirement | Authority | Status and blocker behavior |
|---|---|---|---|---|---|
| `Job ID` classified as Sales Order | `bizTrackSalesOrder`, visible identifier; immutable provenance | Trim; preserve exact business value; case-insensitive normalized duplicate check | Required for this identifier kind | Authoritative | Supported after explicit classification; duplicate blocks import/save. |
| `Job ID` matching accepted legacy `DG-######` | `doorGoReference`, visible identifier; immutable provenance | Preserve unchanged; do not allocate | Required for this identifier kind | Authoritative | Supported; malformed or duplicate DG blocks. |
| Generated `JOB-####` | immutable `legacyJobId` and unified primary identifier | Never infer Sales Order or DG; never allocate replacement DG | Provenance required | Authoritative provenance | Prepared persistence/RPC contract supports it after separately authorized migration application; no extra editor input is added. |

## Prepared persistence boundary

The unapplied amendment adds `public.dg_create_transferred_native_job(uuid,jsonb,jsonb,jsonb)`. It accepts only a command UUID, normalized provenance, normalized header, and normalized active lines. It requires an authenticated active profile with explicit `jobs=use`, has no manager fallback, is `SECURITY DEFINER` with an empty fixed search path, creates the job, ordered stable-UUID lines, and one idempotency receipt atomically, and returns Revision 1. The accepted native create RPC remains unchanged and is the only path that consumes `dg_native_job_reference_seq`.

Immutable transfer provenance stores only source system, schema/version, identifier kind/value, source saved timestamp, export timestamp, and the canonical lowercase SHA-256 source fingerprint. The fingerprint and normalized source identity are unique. The RPC rejects archived/deleted or reverse/native source provenance, unknown keys, operational instructions, malformed or mismatched identifiers, duplicate fingerprints, Sales Orders, DG references, and legacy job IDs. It never writes legacy mirrors, Production, Calendar, capacity, fulfillment, document, or email objects.

The legacy source may be archived or deleted only as a separate manual action after native save, reopen, and work-order verification. The transfer never archives or deletes it automatically. Export UI and native import/review UI are still unimplemented.
| Unknown identifier shape | None until explicit classification | Never guess | Classification required | Unresolved source evidence | Blocks native Save. |
| Native internal UUID | Allocated by create RPC | Never supplied from legacy | Server required at save | Native authority | No payload mapping. |
| `Customer` | `customer` | Trim Unicode text | Customer or site required | Authoritative | Supported. |
| `Site/Address` | `siteAddress` | Trim Unicode text | Customer or site required | Authoritative | Supported. |
| `Phone` | `phone` | Trim; no dialing action | Optional | Authoritative | Supported; malformed values warn for review. |
| `Email` | `email` | Trim/lowercase under native validation | Optional | Authoritative | Supported; invalid email blocks save, never sends. |
| `Salesperson` | `salesperson` | Trim; do not map Calendar name | Optional for Draft | Authoritative | Supported; unknown staff name warns. |
| `PO Numbers JSON` | `poNumbers[]` | Parse array, trim, deduplicate, digits only | Optional | Authoritative | Supported; malformed JSON/non-digits block field import. |
| `Notes` | `notes` | Preserve plain text and line breaks; strip control characters | Optional | Authoritative | Supported; HTML/script or otherwise unsafe content is rejected. |
| `Hinge Color` | `hingeColor` | Native hinge-finish normalization | Optional | Authoritative | Review; unknown finish blocks save until selected. |
| `Job Stage` | `lifecycleStage` | `Quote / Not Confirmed` -> `Draft`; `Confirmed Job` -> `Confirmed Job` | Required | Authoritative intent | Review; Confirmed blocks until one valid active line exists. |
| `Status` / `Active` | Import eligibility and review warning | Never silently create an archived native job | Required review | Authoritative lifecycle evidence | Archived/deleted source blocks normal transfer; user must explicitly resolve source state. |
| `Created At`, `Updated At` | Payload source provenance only | ISO-8601; `Updated At` is source revision marker | Required provenance | Authoritative audit | Missing/invalid updated timestamp blocks export/import. Native timestamps remain server-owned. |
| `Delivery Date`, `Customer Pickup Date`, `Fulfillment Plan` | Corresponding inert header fields | ISO date; exactly one active plan/date pair | Optional | Authoritative intent, not execution | Review on inconsistency; creates no fulfillment record. |
| `Shop Date`, `Shop Date Source` | Corresponding inert header fields | ISO date; preserve Manual/Automatic source label | Optional | Mixed | Review: date is transferable planning input; native save must not schedule or book. |
| `Shop Hours`, `Shop Hours Source` | `shopHours`, `shopHoursSource` | Non-negative quarter-hour numeric | Optional | Manual value authoritative; estimate derived | Manual may transfer; estimated/incomplete values are recomputed and flagged. |
| `Scheduling Status`, `Door Type` summary | None | Recompute from native aggregate if needed | Not applicable | Derived | Excluded. |
| Door row order | `lineIndex` at save | Preserve array order; native assigns 1-based index | Required | Authoritative ordering | Supported. |
| Export-generated line UUID + source ordinal | temporary transfer identity; later `lineId` | Validate UUID; retain ordinal; create may use UUID after review | Required | Transfer audit | Duplicate/missing UUID or ordinal blocks. |
| Source line state | `lineStatus='Active'` | Exact active-only contract | Required | Authoritative | Any archived/deleted/merged line state rejects the payload. |
| `Qty` | `qty` | Positive whole integer | Required | Authoritative | Supported; invalid blocks line. |
| `Mode` | `mode` | Exact `Interior`/`Exterior` | Required | Authoritative | Unsupported value blocks line. |
| `Config` including D/DD/SD/DS/SDS/SDDS/transoms | `config` | Native canonical configuration parser | Required | Authoritative | Supported canonical/legacy aliases; unparseable config blocks. |
| `Config` PKT | `config='PKT'` | Preserve pocket-door semantics | Required for line | Authoritative | Supported; incompatible jamb/RO values become not applicable. |
| `Config` B.P. | `config='B.P.'` | Preserve bypass semantics; legacy finished-opening height maps to `roHeight` only when cut-down is needed | Required for line | Authoritative | Supported after native validation; ambiguous dimensions warn/block. |
| `Width`, `Height` | `width`, `height` | Native stored shop-dimension vocabulary | Required | Authoritative | Only deployed supported sizes import directly; others require manual selection. |
| `Custom Slab`, width, height | corresponding fields | `Yes` -> `WoodCustom`; preserve RO/WoodCustom rules | Conditional | Authoritative inputs | Supported when material/dimensions validate; otherwise blocks. |
| `Door Type` | `doorType` | Trim plain text | Optional | Authoritative description | Supported. |
| `Hand` / swing | `hand` | Exact native LH/RH/LHOUT/RHOUT rules; null for no-jamb configurations | Conditional | Authoritative | Unsupported handing blocks line. |
| `Prep` / drill | `prep` | Native prep aliases (`Round` -> `Round Weiser`) and mode/config choices | Required when applicable | Authoritative | Invalid option blocks line. |
| `Hinge Type` | `hingeType` | Native hinge normalization | Conditional | Authoritative | Invalid combination blocks line. |
| `Jamb Width`, `Jamb Type`, `RIP Jamb` | corresponding fields | Parse completed RIP size; null for PKT/B.P. | Conditional | Authoritative | Raw `RIP` without final size blocks. |
| `Sill`, `Weatherstrip` | corresponding fields | Exterior only; null for Interior | Conditional | Authoritative | Unknown deployed option requires review. |
| `Material`, `Door Thickness` | corresponding fields | Normalize wood/fiberglass; trim thickness | Conditional | Authoritative | Invalid material blocks; unusual thickness warns. |
| `RO Width`, `RO Height` | corresponding fields | Native dimension parsing and glass/transom requirements | Conditional | Authoritative measurements | Missing required glass/transom RO blocks. |
| Line `Notes` | line `notes` | Preserve inert plain text | Optional | Authoritative | Supported within limits. |
| `Glass`, sidelight/transom selections | `sidelightGlass`, `transomGlass` where explicitly recoverable | Do not use legacy blank `Glass` as authority; use whitelisted saved builder inputs | Conditional | Authoritative only when explicitly saved | Missing selection becomes review warning/blocker according to native builder. |
| `Glass Units JSON` | Native builder inputs/results | Never trust as calculated authority; retain only whitelisted original selections needed for review | Conditional | Mostly derived | Recompute; malformed JSON or mismatch blocks. |
| `Glass Calc JSON` | whitelisted sidelight measurements/type, panel inputs, and builder review evidence | Parse fixed schema; discard computed geometry/output keys | Conditional | Mixed | Recompute native geometry. Unknown override/input shapes block. |
| Repeated sidelights, transoms, panel sidelights | canonical config plus native measurement/panel fields | Rebuild through current builder; preserve repeated positions/order | Conditional | Authoritative selections and measurements | Supported only when current builder can reproduce them; otherwise manual rebuild required. |
| `Glass Override` | `glassOverride` | Never import a legacy flag as native approval | Not transferable | Audit-sensitive | Non-default override blocks until a `jobs=use` user recomputes and explicitly approves under native audit rules. |
| Glass status/detail/warnings/blockers, vendor text | None on initial import | Recompute from authoritative inputs | Not applicable | Derived | Excluded. |
| Production bookings/queue/actions | None | No mapping | Prohibited | Operational | Must cause payload rejection if present as commands/objects. |
| Calendar links/events | None | No mapping | Prohibited | Operational | Reject. |
| Capacity, fulfillment execution, document moves/files, email instructions | None | No mapping | Prohibited | Operational | Reject. |

## Versioned payload contract

The first format is `doorgo.legacy-job-transfer/v1`. Transport is one downloaded UTF-8 JSON file; clipboard transport is not part of this phase. JSON is data-only:

```json
{
  "schema": "doorgo.legacy-job-transfer",
  "version": 1,
  "direction": "legacy-to-native",
  "export_id": "uuid",
  "exported_at": "2026-07-29T00:00:00.000Z",
  "source": {
    "system": "legacy-doorgo",
    "job_state": "active",
    "identifier_kind": "biztrack_sales_order|door_go_reference|legacy_job_id",
    "identifier_value": "source value",
    "saved_at": "ISO-8601",
    "source_fingerprint": "sha256 lowercase hex"
  },
  "job": {
    "customer": { "state": "value", "value": "plain text", "source_value": "plain text" },
    "site_address": { "state": "missing", "source_value": null },
    "fulfillment_plan": { "state": "not_applicable", "source_value": null }
  },
  "lines": [
    {
      "transfer_line_id": "uuid",
      "source_line_index": 1,
      "line_state": "active",
      "fields": {}
    }
  ]
}
```

Every nullable field uses exactly one tagged state: `value` carries a validated scalar/array/object and original `source_value`; `missing` means the source had no value; `not_applicable` means the source field is structurally irrelevant for that mode/configuration. Empty strings are normalized to `missing`, never conflated with `not_applicable`. `source_value` is allowed only for the same whitelisted authoritative field and may not contain extra objects or executable content.

The canonical source fingerprint is SHA-256 over schema/version, normalized legacy ID and classification, source updated timestamp, ordered authoritative header fields, and ordered line fields/ordinals, excluding `export_id` and `exported_at`. It supports duplicate prevention and provenance; it is not synchronization state.

### Validation limits

- Maximum UTF-8 payload: 1 MiB; maximum 250 line entries.
- JSON depth: 12; reject duplicate JSON keys, non-finite numbers, unknown top-level keys, prototypes, functions, and non-JSON values.
- Schema must equal `doorgo.legacy-job-transfer`; version must equal integer `1`.
- `export_id` and every `transfer_line_id` must be RFC 4122 UUIDs; transfer line IDs must be unique and source line indexes must be unique, contiguous, and match array order.
- Identifier: 1–100 Unicode characters after trim; DG must match `^DG-[0-9]{6}$`; legacy JOB must match `^JOB-[0-9]{4,}$`; never infer an unknown value's meaning.
- Source/export timestamps must be valid ISO-8601 instants. Business dates must be strict `YYYY-MM-DD` calendar dates.
- General text maximum 500 characters; customer/site 300; phone/email/identifier 254; notes 10,000 per job and 2,000 per line; enum tokens 64; each PO 50 digits; maximum 25 POs.
- Quantity must be integer 1–999. Dimensions and enums must pass current native contracts, not merely regex checks.
- Arrays for glass units/panels/issues are capped at 50 entries; only documented keys and primitive values are accepted.
- Reject ASCII control characters except tab/newline in notes. Reject HTML/script markup, formulas beginning `=`, executable-looking URLs/instructions, and event/provider commands rather than attempting to preserve them; always render accepted text escaped. Reject any structural key suggesting commands, SQL, HTML, scripts, auth, secrets, tokens, Production, Calendar, document moves, or email sending.
- Unsupported configuration, unsafe content, malformed JSON, invalid checksum, inconsistent identifier classification, missing provenance, or a non-reproducible glass aggregate is a blocking error. Truncation is forbidden.

## Import and persistence behavior

Import is available only to an active user with explicit `jobs=use`; manager status is not fallback authority. The user chooses one downloaded JSON payload and confirms import. Parsing and validation occur before editor mutation. On success the app replaces a new, unsaved editor only after warning about any current unsaved content; it never overlays a saved job.

The review screen groups exact blockers and warnings by source field/line. Blockers prevent native Save but do not prevent reviewing safe mapped fields. Warnings identify normalized aliases, recomputed derived fields, missing optional values, unknown staff/options, and manual review. Original whitelisted source values remain visible for comparison but are never submitted as unrecognized RPC fields.

Import performs no repository call. It generates no native UUID, DG reference, create-command receipt, sequence value, database row, work order, production booking, Calendar link, fulfillment action, document, or email. Cancel/failure clears the transient payload and leaves no hosted residue.

On explicit Save, a dedicated transfer command—not the ordinary native create mapping—must submit `origin=legacy_transfer`, the immutable provenance, validated header, and ordered complete lines through the reviewed service/repository boundary. The create command ID must be derived/stored so an exact retry is idempotent. The native row stores origin, immutable legacy provenance, and source fingerprint/version/timestamp after a separately approved schema/RPC amendment if required.

Before save, the app must query/submit through the authoritative create RPC so normalized native Sales Order, DoorGo reference, and provenance uniqueness are enforced transactionally. A matching source fingerprint/provenance may reopen the existing transferred native job; it must never create a second job. A different payload for already-used provenance is a conflict requiring review, not an update or sync. Browser-only duplicate checks are advisory.

After save, the user must reopen the server-loaded native aggregate and verify identity, lines, calculations, and work order. Legacy deletion/archive remains a distinct user action in the legacy application. The new app never requests or confirms that deletion.

## Unsupported and manual-review policy

- Never silently drop a source field. Every whitelisted field is mapped, warned, or blocked; excluded derived/operational fields are enumerated in the review summary.
- Unknown enums and configurations block the affected line. Do not coerce to a visually similar option.
- Native calculations replace legacy derived calculations. Any disagreement is shown and blocks confirmation until explicitly resolved.
- Legacy glass overrides do not become native approvals. They require fresh native calculation and authorized approval.
- Archived/deleted jobs, malformed source timestamps, unknown identifier shapes, active production linkage, and unsafe payload content block persistence. Valid `JOB-*` payloads map for review but remain blocked from hosted persistence until the approved later schema/RPC amendment exists.
- Descriptive delivery/pickup/shop dates are reviewable inputs only and confer no execution or scheduling state.

## Safety invariants

- The legacy app exports only the job explicitly open and selected by the user.
- Export is read-only and never calls save, mirror, archive/delete, production, Calendar, document, or email functions.
- The new app never browses or reads arbitrary legacy data.
- Import populates only unsaved in-memory editor state.
- Save uses explicit `jobs=use` authority and one atomic create RPC; failure leaves no native job/line/receipt because the transaction rolls back. Sequence use must follow the accepted identifier contract and gaps remain acceptable.
- No transfer operation creates Production, capacity, Calendar, fulfillment execution, document, paperwork, or email side effects.
- Legacy and native identities are never renumbered or synchronized.

## Recommended implementation phases

1. **Pure payload contract:** implemented in `lib/jobs/legacy-transfer-types.ts`, `legacy-transfer-validation.ts`, `legacy-transfer-mapping.ts`, `legacy-transfer-contract.test.ts`, `scripts/verify-legacy-job-transfer-contract.mjs`, and the matching `package.json` verification command. It contains no UI, RPC, or runtime read.
2. **Persistence amendment:** implement the approved distinct `legacy_job_id` identity; design and separately authorize a forward migration, exact RPC signature/body amendment, immutable provenance/fingerprint constraints, duplicate rules, unified visible-identifier behavior, grants, and rolled-back behavioral tests.
3. **Legacy exporter:** in the separately governed legacy source, add one read-only server exporter and one explicit saved-job action with tests; deploy only under separate authorization.
4. **Unsaved native import:** add file/paste input, review presentation, editor mapping, cancel behavior, and browser isolation tests. No repository call during import.
5. **Transfer create adapter:** add a distinct typed service/repository command using the accepted RPC amendment; preserve ordinary native create behavior.
6. **Controlled acceptance:** export one non-production job, import/review/save/reopen/work-order verify, prove no operational mutation, then leave any legacy archive/delete to the user.

## Finalized decisions and remaining later phases

Transfer direction, unified identifier presentation, distinct `JOB-####` meaning, active-only source eligibility, active-only lines, downloaded JSON transport, 1 MiB/250-line limits, provenance content, and the authoritative-input-only glass boundary are approved. The pure payload phase allocates no hosted identity and persists nothing.

Remaining work is implementation rather than product-policy ambiguity: a reviewed forward migration/RPC amendment must store distinct legacy-job provenance plus fingerprint/version/timestamp and enforce duplicate transfer prevention; the legacy exporter and native import/review UI require separate authorization; the transfer create adapter must remain distinct from ordinary native creation; and controlled end-to-end acceptance must precede any manual legacy archive. Exact whitelisted glass inputs are the typed source selections and measurements in the v1 payload; calculated dimensions, units, cut/frame results, overrides, and work-order output are always recomputed or reviewed through the native Leave Glass Detail Needed path.
