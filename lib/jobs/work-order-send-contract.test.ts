import assert from 'node:assert/strict';
import { resolveCurrentDoorGoAccess } from '../auth/access';
import {
  buildActiveWorkOrderRecipientDirectory,
  loadPaginatedWorkOrderAuthUsers,
  resolveSelectedWorkOrderRecipients,
  WorkOrderRecipientFailure,
} from './work-order-recipient-contract';
import {
  sendSavedWorkOrder,
  sendAuthenticatedSavedWorkOrder,
  createConfiguredWorkOrderEmailProvider,
  handleWorkOrderSendAction,
  validateWorkOrderProviderConfiguration,
  workOrderEmailSubject,
  workOrderSendEntryDecision,
  WORK_ORDER_EMAIL_BODY,
  WorkOrderSendFailure,
  type WorkOrderEmailMessage,
  type WorkOrderProviderResult,
} from './work-order-send-contract';

const IDS = {
  one: '11111111-1111-4111-8111-111111111111',
  two: '22222222-2222-4222-8222-222222222222',
  inactive: '33333333-3333-4333-8333-333333333333',
  missingEmail: '44444444-4444-4444-8444-444444444444',
  unknown: '55555555-5555-4555-8555-555555555555',
} as const;

function access(level: 'none' | 'view' | 'use', manager = false) {
  return resolveCurrentDoorGoAccess({
    user: { id: IDS.one },
    profile: { user_id: IDS.one, display_name: 'Requester', active: true, is_manager: manager, company_location: null, must_change_password: false },
    permissionRows: [{ permission_key: 'jobs', access_level: level }],
  });
}

const directory = buildActiveWorkOrderRecipientDirectory([
  { userId: IDS.two, displayName: 'Zulu', active: true },
  { userId: IDS.one, displayName: 'Alpha', active: true },
  { userId: IDS.inactive, displayName: 'Inactive', active: false },
  { userId: IDS.missingEmail, displayName: 'Missing Email', active: true },
], [
  { userId: IDS.one, email: 'alpha@example.com' },
  { userId: IDS.two, email: 'zulu@example.com' },
  { userId: IDS.inactive, email: 'inactive@example.com' },
  { userId: IDS.missingEmail, email: null },
]);

function dependencies(provider: (message: WorkOrderEmailMessage) => Promise<WorkOrderProviderResult>, messages: WorkOrderEmailMessage[]) {
  return {
    resolveRecipients: async (userIds: readonly string[]) => resolveSelectedWorkOrderRecipients(userIds, directory),
    generatePdf: async ({ expectedRevision, acknowledged }: { expectedRevision: number; acknowledged: boolean }) => {
      if (expectedRevision !== 7) throw new WorkOrderSendFailure('stale_revision', 'stale');
      if (!acknowledged) throw new Error('Work-order warnings must be acknowledged before generation.');
      return { visibleIdentifier: 'SO-900', pdfFilename: 'Work_Order_SO-900.pdf', bytes: new Uint8Array([1, 2, 3]) };
    },
    sendMessage: async (message: WorkOrderEmailMessage) => {
      messages.push(message);
      return provider(message);
    },
  };
}

async function main() {
  assert.deepEqual(directory.map((recipient) => recipient.userId), [IDS.one, IDS.two], 'only active login users with valid email are exposed');
  assert.throws(() => resolveSelectedWorkOrderRecipients([], directory), WorkOrderRecipientFailure);
  assert.throws(() => resolveSelectedWorkOrderRecipients(['not-a-uuid'], directory), WorkOrderRecipientFailure);
  assert.throws(() => resolveSelectedWorkOrderRecipients([IDS.one, IDS.one], directory), WorkOrderRecipientFailure);
  assert.throws(() => resolveSelectedWorkOrderRecipients([IDS.inactive], directory), WorkOrderRecipientFailure);
  assert.throws(() => resolveSelectedWorkOrderRecipients([IDS.missingEmail], directory), WorkOrderRecipientFailure);
  assert.throws(() => resolveSelectedWorkOrderRecipients([IDS.unknown], directory), WorkOrderRecipientFailure);
  assert.deepEqual(resolveSelectedWorkOrderRecipients([IDS.two], directory), [directory[1]]);

  const loadedPages: number[] = [];
  const pagedUsers = await loadPaginatedWorkOrderAuthUsers(async (page, perPage) => {
    loadedPages.push(page);
    return page === 1
      ? Array.from({ length: perPage }, (_, index) => ({ userId: `page-1-${index}`, email: `p1-${index}@example.com` }))
      : [{ userId: IDS.two, email: 'zulu@example.com' }];
  });
  assert.deepEqual(loadedPages, [1, 2]);
  assert.equal(pagedUsers.length, 1001);
  assert.equal(pagedUsers.at(-1)?.userId, IDS.two, 'later Auth pages are retained before pagination stops');

  assert.deepEqual(workOrderSendEntryDecision({ hasSavedJob: true, dirty: false, hasUnappliedLineChanges: false }), { ok: true });
  assert.equal(workOrderSendEntryDecision({ hasSavedJob: true, dirty: true, hasUnappliedLineChanges: false }).ok, false);
  assert.equal(workOrderSendEntryDecision({ hasSavedJob: true, dirty: false, hasUnappliedLineChanges: true }).ok, false);
  assert.equal(workOrderEmailSubject('DG-000123'), 'DoorGo Work Order – DG-000123');
  assert.equal(WORK_ORDER_EMAIL_BODY, 'Please find document attached.');
  assert.deepEqual(validateWorkOrderProviderConfiguration({ RESEND_API_KEY: ' key ', DOORGO_EMAIL_FROM: 'shop@example.com' }), { apiKey: 'key', fromAddress: 'shop@example.com' });
  assert.throws(() => validateWorkOrderProviderConfiguration({}), WorkOrderSendFailure);
  assert.throws(() => validateWorkOrderProviderConfiguration({ DOORGO_EMAIL_FROM: 'shop@example.com' }), WorkOrderSendFailure);
  assert.throws(() => validateWorkOrderProviderConfiguration({ RESEND_API_KEY: 'key' }), WorkOrderSendFailure);
  assert.throws(() => validateWorkOrderProviderConfiguration({ RESEND_API_KEY: 'key', DOORGO_EMAIL_FROM: 'bad' }), WorkOrderSendFailure);

  const transportInputs: Array<{ from: string; to: string; subject: string; text: string; attachment: { filename: string; bytes: Uint8Array } }> = [];
  let receivedApiKey = '';
  const configuredProvider = createConfiguredWorkOrderEmailProvider({ RESEND_API_KEY: 'secret-test-key', DOORGO_EMAIL_FROM: 'door@example.com' }, (apiKey) => {
    receivedApiKey = apiKey;
    return { send: async (input) => { transportInputs.push(input); return { id: 'provider-id' }; } };
  });
  const providerMessage: WorkOrderEmailMessage = { recipient: directory[0], fromName: 'DoorGo', subject: workOrderEmailSubject('DG-000123'), body: WORK_ORDER_EMAIL_BODY, attachment: { filename: 'Work_Order_DG-000123.pdf', bytes: new Uint8Array([9, 8, 7]) } };
  assert.deepEqual(await configuredProvider.send(providerMessage), { ok: true, messageId: 'provider-id' });
  assert.equal(receivedApiKey, 'secret-test-key');
  assert.equal(transportInputs[0].from, 'DoorGo <door@example.com>');
  assert.equal(transportInputs[0].to, directory[0].email);
  assert.equal(transportInputs[0].subject, providerMessage.subject);
  assert.equal(transportInputs[0].text, WORK_ORDER_EMAIL_BODY);
  assert.deepEqual(transportInputs[0].attachment, providerMessage.attachment);
  const returnedFailure = createConfiguredWorkOrderEmailProvider({ RESEND_API_KEY: 'key', DOORGO_EMAIL_FROM: 'door@example.com' }, () => ({ send: async () => ({ error: new Error('provider detail') }) }));
  assert.deepEqual(await returnedFailure.send(providerMessage), { ok: false });
  const thrownFailure = createConfiguredWorkOrderEmailProvider({ RESEND_API_KEY: 'key', DOORGO_EMAIL_FROM: 'door@example.com' }, () => ({ send: async () => { throw new Error('provider secret'); } }));
  assert.deepEqual(await thrownFailure.send(providerMessage), { ok: false }, 'transport exceptions become controlled failures');

  for (const currentAccess of [access('view'), access('use')]) {
    const order: string[] = [];
    const result = await sendAuthenticatedSavedWorkOrder({ internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one] }, {
      getCurrentAccess: async () => { order.push('auth'); return currentAccess; },
      createSendDependencies: () => { order.push('dependencies'); return dependencies(async () => ({ ok: true, messageId: 'wired' }), []); },
    });
    assert.equal(result.outcome, 'success');
    assert.deepEqual(order, ['auth', 'dependencies']);
  }
  for (const deniedAccess of [resolveCurrentDoorGoAccess({ user: null, profile: null }), access('none'), access('none', true)]) {
    let directoryCalls = 0;
    let providerAccessed = false;
    await assert.rejects(sendAuthenticatedSavedWorkOrder({ internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one] }, {
      getCurrentAccess: async () => deniedAccess,
      createSendDependencies: () => ({ resolveRecipients: async () => { directoryCalls += 1; return directory; }, generatePdf: async () => { throw new Error('never'); }, sendMessage: async () => { providerAccessed = true; return { ok: true, messageId: 'never' }; } }),
    }), WorkOrderSendFailure);
    assert.equal(directoryCalls, 0);
    assert.equal(providerAccessed, false, 'authorization precedes directory and provider access');
  }

  for (const level of ['view', 'use'] as const) {
    const sent: WorkOrderEmailMessage[] = [];
    const result = await sendSavedWorkOrder(access(level), { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one, IDS.two] }, dependencies(async () => ({ ok: true, messageId: 'message' }), sent));
    assert.equal(result.outcome, 'success');
    assert.equal(sent.length, 2, 'one provider call per recipient');
    assert.deepEqual(sent.map((message) => message.recipient.email), ['alpha@example.com', 'zulu@example.com']);
    assert.ok(sent.every((message) => !message.subject.includes('zulu@example.com') && !message.body.includes('@')), 'recipient addresses are not disclosed in content');
    assert.ok(sent.every((message) => message.subject === 'DoorGo Work Order – SO-900'));
    assert.ok(sent.every((message) => message.body === WORK_ORDER_EMAIL_BODY && message.attachment.filename === 'Work_Order_SO-900.pdf'));
  }

  for (const denied of [access('none'), access('none', true)]) {
    let resolved = false;
    await assert.rejects(sendSavedWorkOrder(denied, { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one] }, {
      ...dependencies(async () => ({ ok: true, messageId: 'never' }), []),
      resolveRecipients: async () => { resolved = true; return []; },
    }), WorkOrderSendFailure);
    assert.equal(resolved, false, 'authorization precedes directory access');
  }

  const partialMessages: WorkOrderEmailMessage[] = [];
  const partial = await sendSavedWorkOrder(access('view'), { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one, IDS.two] }, dependencies(async (message) => message.recipient.userId === IDS.one ? { ok: true, messageId: 'one' } : { ok: false }, partialMessages));
  assert.deepEqual(partial, { outcome: 'partial', attempted: 2, succeeded: 1, failed: 1, failedRecipientUserIds: [IDS.two], message: 'Sent to 1 of 2 recipients. 1 failed.' });

  const allFailureCalls: string[] = [];
  const allFailure = await sendSavedWorkOrder(access('view'), { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one, IDS.two] }, dependencies(async (message) => { allFailureCalls.push(message.recipient.userId); if (message.recipient.userId === IDS.one) throw new Error('provider down'); return { ok: false }; }, []));
  assert.deepEqual(allFailure, { outcome: 'failure', attempted: 2, succeeded: 0, failed: 2, failedRecipientUserIds: [IDS.one, IDS.two], message: 'Email failed for all 2 recipients.' });
  assert.deepEqual(allFailureCalls, [IDS.one, IDS.two], 'a thrown provider attempt does not prevent later recipients');

  let mixedProviderCalls = 0;
  await assert.rejects(sendSavedWorkOrder(access('view'), { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one, IDS.unknown] }, dependencies(async () => { mixedProviderCalls += 1; return { ok: true, messageId: 'never' }; }, [])), WorkOrderRecipientFailure);
  assert.equal(mixedProviderCalls, 0, 'all recipients validate before the first delivery');

  const failed = await sendSavedWorkOrder(access('use'), { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one] }, dependencies(async () => ({ ok: false }), []));
  assert.equal(failed.outcome, 'failure');
  const resend = await sendSavedWorkOrder(access('use'), { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: failed.failedRecipientUserIds }, dependencies(async () => ({ ok: true, messageId: 'retry' }), []));
  assert.equal(resend.outcome, 'success', 'deliberate resend is permitted');

  let providerCalls = 0;
  await assert.rejects(sendSavedWorkOrder(access('view'), { internalJobId: 'job', expectedRevision: 8, acknowledged: true, recipientUserIds: [IDS.one] }, dependencies(async () => { providerCalls += 1; return { ok: true, messageId: 'never' }; }, [])), /stale/);
  await assert.rejects(sendSavedWorkOrder(access('view'), { internalJobId: 'job', expectedRevision: 7, acknowledged: false, recipientUserIds: [IDS.one] }, dependencies(async () => { providerCalls += 1; return { ok: true, messageId: 'never' }; }, [])), /acknowledged/);
  assert.equal(providerCalls, 0, 'stale and unacknowledged requests never call the provider');

  const input = { internalJobId: 'job', expectedRevision: 7, acknowledged: true, recipientUserIds: [IDS.one] };
  const before = JSON.stringify(input);
  await sendSavedWorkOrder(access('view'), input, dependencies(async () => ({ ok: true, messageId: 'immutable' }), []));
  assert.equal(JSON.stringify(input), before, 'send does not mutate its request or job source');

  const actionSuccess = await handleWorkOrderSendAction(input, async () => ({ outcome: 'partial', attempted: 2, succeeded: 1, failed: 1, failedRecipientUserIds: [IDS.two], message: 'partial' }));
  assert.deepEqual(actionSuccess, { ok: true, outcome: 'partial', message: 'partial', failedRecipientUserIds: [IDS.two] });
  assert.deepEqual(await handleWorkOrderSendAction(input, async () => { throw new WorkOrderSendFailure('invalid_request', 'Safe request error.'); }), { ok: false, message: 'Safe request error.' });
  const unexpected = await handleWorkOrderSendAction(input, async () => { throw new Error('SECRET stack detail'); });
  assert.deepEqual(unexpected, { ok: false, message: 'The work-order email could not be sent.' });
  assert.equal(unexpected.message.includes('SECRET'), false);
  const malformedAction = await handleWorkOrderSendAction({ ...input, expectedRevision: 0 }, (request) => sendSavedWorkOrder(access('view'), request, dependencies(async () => ({ ok: true, messageId: 'never' }), [])));
  assert.deepEqual(malformedAction, { ok: false, message: 'The work-order send request is invalid.' });
  console.log('Native Job Intake J3C send contract tests passed');
}

void main();
