# Native Job Intake J3C Send contract

## Status and scope

J3C Send is implemented locally for automated and mocked validation, and human visual acceptance passed using the headed Playwright component harness. Hosted recipient-directory acceptance also passed through the local DoorGo application using read-only access to Supabase project `lwhrhnfnuutpisfpkadb` for the single existing active `jobs=use` manager account. J3C controlled local real-email acceptance is complete: the repaired reacceptance passed delivery, byte identity, punctuation rendering, screen continuity and no-mutation acceptance. No production send workflow is active, and all push/Preview/merge/hosted-configuration/Production boundaries remain pending.

J3C sends only the existing generated work-order PDF from the current order. Glass measure sheets, picking tickets, other document types and sending from the main Jobs list remain future work.

## Access and saved-source boundary

- `jobs=view` and `jobs=use` may preview, download, print and send the work-order PDF.
- `jobs=none` has no work-order output access. Manager status provides no fallback, and J3C introduces no separate `documents` permission.
- Unsaved changes block Send; Send never saves automatically.
- The server reloads the saved aggregate by immutable job ID, verifies the expected revision, regenerates the J3A document model and renders the PDF through the single authoritative J3B renderer.
- Existing PDF blockers block Send. Existing non-blocking warnings require acknowledgement.
- Missing recipients, invalid recipients, stale revision, PDF failure or insufficient access blocks Send.
- The browser cannot provide an authoritative aggregate, document model, PDF, filename, subject, body or email address.

## Recipient directory

The user may select one or more active DoorGo users with logins. Arbitrary, manually entered, customer and external recipients are prohibited.

The browser submits stable recipient user IDs only. A dedicated narrowly scoped server-only module first authenticates the requester through DoorGo's normal server path and requires at least `jobs=view`. Only then may it use the existing server-only Supabase service-role/Auth Admin capability to combine active `dg_user_profiles` state with authoritative Auth login email. It returns only the recipient fields needed by the UI.

Immediately before delivery, the server independently re-resolves every selected ID. Missing, unknown, inactive, duplicate and email-less users are rejected. Client-supplied email addresses are never authoritative. The service-role credential, Auth Admin client and unrestricted directory never reach browser code. J3C adds no recipient table, schema migration or RLS change.

## Provider and message

Delivery uses the official Resend Node.js package through a small replaceable server-only provider adapter. Provider calls never originate in browser code.

Required server-only configuration for a future controlled acceptance and enablement pass:

- `RESEND_API_KEY`
- `DOORGO_EMAIL_FROM`

The visible sender name is `DoorGo`. DoorGo email identity must remain independent from Central Builders: do not use or require an `@centralbuilders.ca` sender, Central Builders DNS changes or an Outlook mailbox connection. The first controlled real-delivery test should use a provider-controlled test sender when available and eligible. A permanent DoorGo-owned sending domain or subdomain and optional customer-branded sender domains are future work. J3C requires no reply-to value. Missing or invalid provider configuration produces a controlled failure and never false success.

### Local provider pre-send security checkpoint

Provider credentials are configured locally only in `.env.local`, which remains ignored and untracked. `.env.example` contains blank placeholders only. Secret-safety inspection confirmed that credentials and the configured sender are absent from tracked files and relevant Git history. The originally exposed key was deleted in the Resend dashboard; its replacement exists only in ignored local configuration.

The first controlled real-email delivery was received and the repaired controlled reacceptance passed. Preview and Production environment configuration remain unconfigured, and Production Send remains disabled. Central Builders email, Outlook, mailbox and DNS infrastructure remain completely separate and are not authorized for DoorGo sending.

### Controlled delivery diagnosis and PDF repair checkpoint

The first controlled delivery succeeded and caused no job, line, document, production, fulfillment, scheduling, Calendar, paperwork, operational or hosted-data mutation. Initial byte acceptance failed because J3B Download and J3C Send separately used current-clock generation timestamps for PDF `/CreationDate` and `/ModDate`; the otherwise identical PDFs therefore had different hashes. The saved U+2013 en dash also rendered and extracted as `?` because the PDF sanitizer replaced characters outside its narrow range before font encoding.

Commit `e06f2fcc6658a8d643ae4c73bda3a43574079d5f` repaired both issues. The shared saved-work-order path now derives its authoritative generation timestamp and visible generated date from the saved aggregate revision's persisted `updatedAt`. Preview, Download, Print and Send therefore render the same stable bytes for that saved revision. PDF text normalization preserves printable characters supported by the active font, including the required WinAnsi punctuation, and uses an explicit `?` fallback only for unsupported characters. Automated byte, metadata and extracted-text coverage records this repair.

### Final controlled real-email reacceptance

Exactly one repaired reacceptance email was sent to the sole controlled DoorGo account using Resend's provider-controlled test sender. DoorGo displayed `Sent to 1 recipient.` and remained on DG-000006's work-order screen. No warnings or blockers were present. The accepted message was:

- sender: `DoorGo <onboarding@resend.dev>`
- subject: `DoorGo Work Order – DG-000006`
- body: `Please find document attached.`
- attachment: `Work_Order_DG-000006.pdf`

The fresh authoritative J3B Download, local revision-pinned J3C attachment and received email attachment were each 4,413 bytes and each had SHA-256 `EEE945F6FFE482023003441E249B32CBB549FDBAE6A6E24A11721FBB47777520`. The received attachment is byte-for-byte identical to the authoritative J3B Download and local J3C attachment. The saved note `NON-PRODUCTION TEST – DO NOT BUILD OR SCHEDULE` rendered visibly with U+2013 EN DASH. DG-000006 remained revision 5, and no job, line, production, fulfillment, scheduling, Calendar, document, paperwork or hosted operational data changed.

The originally exposed Resend API key was deleted. Its replacement remains only in ignored, untracked `.env.local`, while `.env.example` contains blank placeholders. The acceptance used no Central Builders email address, mailbox, Outlook connection or DNS change. Preview and Production provider configuration remain absent, Production Send remains disabled, and nothing was pushed, merged, deployed, migrated or enabled in Production. This controlled single-recipient acceptance does not establish general multi-user provider acceptance or any deployment acceptance.

Subject: `DoorGo Work Order – <Sales Order or DoorGo Reference>`

Body: `Please find document attached.`

The body is fixed and not editable. The attachment is the exact PDF produced by the authoritative J3B renderer, with `Work_Order_<SalesOrder>.pdf` precedence and `Work_Order_<DoorGoReference>.pdf` fallback.

## Confirmation, delivery and feedback

Before sending, show selected recipient names, the fixed subject, attachment filename and existing warnings. The action label is `Send Email`.

Send one separate email per independently validated recipient so recipients never see one another's email addresses. Attempt every validated recipient. All success uses the normal small success toast; no success uses the normal error toast; partial success uses concise wording such as `Sent to 2 of 3 recipients. 1 failed.` The user remains on the current order for every outcome. Deliberate resends, including failed-recipient retries, are permitted.

Sending does not modify or navigate away from the job or document. It does not change revision, lifecycle, identities, production bookings, fulfillment, scheduling, Calendar data or paperwork-complete state.

No user-facing send history, audit UI or substantial send-audit database subsystem is required. Minimal server/provider error logging and provider message identifiers may support troubleshooting. Logs must exclude PDF contents, credentials and service-role values.

## Automated acceptance

The local suite now executes authenticated orchestration, recipient validation and Auth pagination, safe action-result conversion, injected provider success/failure/throw behavior, and the repository-saved aggregate through the authoritative J3A document and J3B PDF path. A production-isolated Playwright React component harness mounts the real work-order preview, toast and dirty-state Send entry with typed in-memory delivery behavior. Its desktop, narrow-layout, keyboard, permission, warning, error, loading and result scenarios pass both headlessly and in headed Chromium. Provider and hosted clients remain mocked or replaced by instrumented dependencies; this automated/component acceptance is not hosted or real-delivery acceptance.

Tests must cover:

- `jobs=view` and `jobs=use` allowed; `jobs=none` and manager-only denied;
- active-login recipient filtering, independent ID re-resolution and rejection of client-supplied addresses;
- one and multiple recipients, one separate email per recipient and no cross-recipient address disclosure;
- dirty, stale, blocked, invalid-recipient and PDF-failure rejection;
- warning acknowledgement;
- exact subject, body, filename and J3B renderer reuse;
- missing/invalid provider configuration;
- complete success, complete failure and partial success;
- deliberate resend;
- no job, document, revision, lifecycle, booking, scheduling, fulfillment, Calendar or paperwork mutation;
- existing J3A and J3B regression suites continue to pass.

## Human visual acceptance

Human visual acceptance passed on 2026-07-27 using the headed Playwright component harness. The accepted scope covered desktop and narrow/mobile layouts; Preview, Download PDF, Print and Send controls; the compact Send panel; one and multiple recipients with clear names and login emails; subject and attachment confirmation; dirty-state blocking without silent save; blocker and warning behavior; success, complete-failure, partial-success, loading and retry behavior; clear toast notifications; remaining on the current work order; and no clipped controls or horizontal overflow.

Two minor polish items are deferred and non-blocking: simplify the user-facing saved-revision wording, and consider a small mobile toast-position adjustment to reduce overlap.

Production-isolation verification passed, and all Playwright artifacts are directed outside the repository. Hosted recipient-directory acceptance is complete for the current single-account directory. The first controlled delivery exposed deterministic-byte and punctuation defects; commit `e06f2fcc6658a8d643ae4c73bda3a43574079d5f` repaired them, and final controlled real-email reacceptance passed. A permanent DoorGo-owned sender-domain decision and hosted/production enablement remain pending.

## Hosted recipient-directory acceptance

Hosted recipient-directory acceptance passed using the local DoorGo application connected read-only to Supabase project `lwhrhnfnuutpisfpkadb`. The single existing controlled account authenticated normally, had an active profile and explicit `jobs=use` permission, and also had manager status; `jobs=use`, not manager status, authorized access. Preview, Download, Print and Send were available. Real hosted recipient resolution returned exactly the one expected active DoorGo login with the correct display name and authoritative login email. No unexpected recipient or manual email-address entry appeared, and no service-role key, unrestricted Auth Admin data or environment secret appeared in browser-visible output.

The acceptance performed no hosted application-data write, provider request or email delivery. The synthetic ignored local fixture was corrected to include `NON-PRODUCTION TEST – DO NOT BUILD OR SCHEDULE` and is not repository content.

Because the hosted directory contains only that account, `jobs=view`, `jobs=none`, manager-only, inactive requester, inactive recipient, email-less recipient, multiple-recipient and hosted pagination-beyond-current-count cases were not reproducible. Existing automated runtime and Playwright coverage remains their acceptance evidence.

A permanent DoorGo-owned sender-domain decision, optional customer-branded sender domains, push, Preview, merge, hosted configuration and Production enablement remain pending. Completion of controlled local real-email acceptance authorizes none of those later boundaries.
