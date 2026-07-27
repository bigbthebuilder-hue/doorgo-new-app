import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');
const [directory, provider, service, action, preview, form, page, pdfService, contract, envExample, acceptance] = await Promise.all([
  read('lib/jobs/work-order-recipient-directory.ts'),
  read('lib/jobs/work-order-email-provider.ts'),
  read('lib/jobs/work-order-send-service.ts'),
  read('lib/jobs/work-order-send-actions.ts'),
  read('components/jobs/WorkOrderPreview.tsx'),
  read('components/jobs/JobHeaderForm.tsx'),
  read('app/jobs/[internalJobId]/work-order/page.tsx'),
  read('lib/jobs/work-order-pdf-service-contract.ts'),
  read('lib/jobs/work-order-send-contract.ts'),
  read('.env.example'),
  read('docs/native-job-intake-j3c-acceptance.md'),
]);

assert.ok(directory.includes("import 'server-only'"));
assert.ok(provider.includes("import 'server-only'"));
assert.ok(service.includes("import 'server-only'"));
assert.ok(directory.includes("assertWorkOrderRecipientAccess(access)"), 'directory authorization precedes privileged reads');
assert.ok(directory.includes('supabase.auth.admin.listUsers'));
assert.ok(directory.includes(".from('dg_user_profiles')"));
assert.ok(directory.includes(".select('user_id, display_name, active')"));
assert.equal(/createSupabaseWorkOrderRecipientDirectorySource|service.role|auth\.admin|SUPABASE_SERVICE_ROLE_KEY/i.test(preview), false, 'client must not import privileged directory capability');

assert.ok(provider.includes("from 'resend'"));
assert.ok(provider.includes('createConfiguredWorkOrderEmailProvider'));
assert.ok(contract.includes('validateWorkOrderProviderConfiguration'));
assert.ok(provider.includes('Buffer.from(input.attachment.bytes)'));
assert.equal(/resend|RESEND_API_KEY|DOORGO_EMAIL_FROM|process\.env/i.test(preview), false, 'provider and environment remain outside client code');
assert.match(envExample, /^RESEND_API_KEY=$/m);
assert.match(envExample, /^DOORGO_EMAIL_FROM=$/m);

assert.ok(service.includes('generateRevisionPinnedSavedWorkOrderPdfWithAccess'));
assert.ok(service.includes('sendAuthenticatedSavedWorkOrder'));
assert.ok(directory.includes('loadPaginatedWorkOrderAuthUsers'));
assert.ok(pdfService.includes('renderWorkOrderPdf(document)'));
assert.ok(pdfService.includes('sourceAggregateRevision !== expectedRevision'));
assert.equal(/NativeJobAggregate|WorkOrderDocument|pdfBytes|emailAddress/.test(action), false, 'server action accepts IDs, revision and acknowledgement only');
assert.ok(action.includes('recipientUserIds: string[]'));
assert.ok(contract.includes("fromName: 'DoorGo'"));
assert.ok(contract.includes("WORK_ORDER_EMAIL_BODY = 'Please find document attached.'"));
assert.ok(contract.includes('DoorGo Work Order –'));
assert.ok(contract.includes('Promise.all(recipients.map'), 'each validated recipient receives an independent provider attempt');

assert.ok(page.includes("hasAtLeastView(access, 'jobs')"));
assert.ok(page.includes('listWorkOrderRecipientsWithAccess(access'));
assert.ok(preview.includes('Send Email'));
assert.ok(preview.includes('AppConfirmationToast'));
assert.ok(preview.includes('recipientUserIds: selectedRecipientIds'));
assert.ok(preview.includes('selected recipient') || preview.includes('selectedRecipientIds'));
assert.equal(/type=["']email["']/.test(preview), false, 'manual email entry is prohibited');
assert.ok(form.includes('WorkOrderSendEntryButton'));
assert.ok(form.includes("outputPath(job.internalJobId, 'send')"));

const j3cRuntime = [directory, provider, service, action, preview, contract].join('\n');
for (const [label, pattern] of [
  ['job repository mutation', /repository\.(?:create|update)\s*\(/],
  ['hosted table mutation', /\.from\s*\([^)]*\)[\s\S]{0,300}\.(?:insert|update|upsert|delete)\s*\(|\.rpc\s*\(/],
  ['production or fulfillment mutation', /createProductionBooking|createFulfillment|reschedule|paperworkComplete/i],
  ['Calendar mutation', /CalendarApp|createCalendar|updateCalendar|deleteCalendar/],
  ['client-supplied content authority', /request\.(?:subject|body|filename|pdf|email)/],
]) assert.equal(pattern.test(j3cRuntime), false, `J3C must not contain ${label}`);

assert.match(acceptance, /implemented locally/i);
assert.match(acceptance, /real provider credentials.*remain unconfigured/i);
console.log('Native Job Intake J3C architecture and no-side-effect verifier: PASS');
