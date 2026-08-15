'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { archiveDraftJobAction, createDraftJobAction, createTransferredJobAction, updateDraftJobAction } from '@/lib/jobs/job-intake-actions';
import { CONFIRMED_JOB_LINE_MESSAGE, hasValidActiveDoorLine, withEffectiveShopHours } from '@/lib/jobs/door-line-contract';
import { jobAggregateDirtySnapshot, jobSaveConfirmation, normalizePoNumbers } from '@/lib/jobs/job-intake-contract';
import type { DoorLineInput, JobHeaderInput, JobLifecycleStage, NativeJobAggregate } from '@/lib/jobs/job-intake-types';
import type { LegacyTransferIssue, UnifiedTransferIdentifier } from '@/lib/jobs/legacy-transfer-types';
import { unresolvedTransferBlockers } from '@/lib/jobs/legacy-transfer-import-contract';
import { workOrderOutputDecision, type WorkOrderOutputIntent } from '@/lib/jobs/work-order-preview-contract';
import { DoorLineWorkspace } from './DoorLineWorkspace';
import { JobArchiveControl, jobArchiveTarget } from './JobArchiveControl';
import { WorkOrderSendEntryButton } from './WorkOrderSendEntryButton';
import { LegacyTransferEvidenceSummary } from './LegacyTransferEvidenceSummary';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import { ContextBottomBar } from '@/components/app-shell/ContextBottomBar';
import { useGuardedNavigation, useUnsavedChanges } from '@/components/app-shell/UnsavedChangesGuard';

type FormValues = {
  bizTrackSalesOrder: string;
  customer: string;
  siteAddress: string;
  phone: string;
  email: string;
  salesperson: string;
  notes: string;
  hingeColor: string;
  shopHours: string;
  shopHoursSource: string;
  poNumbers: string[];
  fulfillmentPlan: string;
  deliveryDate: string;
  customerPickupDate: string;
  shopDate: string;
};

function initialValues(job: NativeJobAggregate | null, defaultSalesperson: string, draft?: JobHeaderInput): FormValues {
  const source = job ?? draft;
  return {
    bizTrackSalesOrder: typeof source?.bizTrackSalesOrder === 'string' ? source.bizTrackSalesOrder : '',
    customer: typeof source?.customer === 'string' ? source.customer : '', siteAddress: typeof source?.siteAddress === 'string' ? source.siteAddress : '',
    phone: typeof source?.phone === 'string' ? source.phone : '', email: typeof source?.email === 'string' ? source.email : '',
    salesperson: typeof source?.salesperson === 'string' ? source.salesperson : defaultSalesperson,
    notes: typeof source?.notes === 'string' ? source.notes : '', hingeColor: typeof source?.hingeColor === 'string' ? source.hingeColor : '',
    shopHours: source?.shopHours === null || source?.shopHours === undefined ? '' : String(source.shopHours),
    shopHoursSource: typeof source?.shopHoursSource === 'string' ? source.shopHoursSource : '',
    poNumbers: Array.isArray(source?.poNumbers) ? source.poNumbers.filter((value): value is string => typeof value === 'string') : [],
    fulfillmentPlan: typeof source?.fulfillmentPlan === 'string' ? source.fulfillmentPlan : '',
    deliveryDate: typeof source?.deliveryDate === 'string' ? source.deliveryDate : '', customerPickupDate: typeof source?.customerPickupDate === 'string' ? source.customerPickupDate : '',
    shopDate: typeof source?.shopDate === 'string' ? source.shopDate : '',
  };
}

function initialLifecycle(job: NativeJobAggregate | null, draft?: JobHeaderInput): JobLifecycleStage {
  if (job) return job.lifecycleStage;
  if (draft?.lifecycleStage === 'Draft' || draft?.lifecycleStage === 'Confirmed Job') return draft.lifecycleStage;
  return 'Confirmed Job';
}

function poNumberText(values: string[]): string {
  return values.join(', ');
}

function poNumbersFromText(value: string): string[] {
  return value.split(/[\s,]+/).filter(Boolean);
}

export type LegacyTransferReviewContext = {
  rawPayload: string; primaryIdentifier: UnifiedTransferIdentifier; sourceSavedAt: string; exportedAt: string;
  warnings: LegacyTransferIssue[]; blockers: LegacyTransferIssue[]; unsupportedFields: string[];
};

const inputClass = 'min-h-9 w-full border-0 bg-transparent px-2 py-1 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-70';
const fieldClass = 'job-intake-field grid overflow-hidden rounded-md border border-slate-300 bg-white focus-within:border-sky-600 focus-within:ring-1 focus-within:ring-sky-200 dark:border-slate-600 dark:bg-slate-950';

function Field({ label, name, children, error }: { label: string; name: string; children: React.ReactNode; error?: string }) {
  return (
    <div>
      <label className={`${fieldClass} ${error ? 'border-rose-500' : ''}`} htmlFor={name}>
        <span className="px-3 pt-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 sm:pr-0">{label}</span>
        {children}
      </label>
      {error ? <p className="mt-1 text-sm text-rose-700 dark:text-rose-300">{error}</p> : null}
    </div>
  );
}

export function JobHeaderForm({
  initialJob,
  canEdit,
  defaultSalesperson,
  initialDraft,
  transferReview,
  inAppShell = false,
}: {
  initialJob: NativeJobAggregate | null;
  canEdit: boolean;
  defaultSalesperson: string;
  initialDraft?: { header: JobHeaderInput; lines: DoorLineInput[] };
  transferReview?: LegacyTransferReviewContext;
  inAppShell?: boolean;
}) {
  const router = useRouter();
  const requestNavigation = useGuardedNavigation();
  const [job, setJob] = useState(initialJob);
  const [values, setValues] = useState(() => initialValues(initialJob, defaultSalesperson, initialDraft?.header));
  const [lines, setLines] = useState<DoorLineInput[]>(() => initialJob?.lines ?? initialDraft?.lines ?? []);
  const [lifecycleStage, setLifecycleStage] = useState<JobLifecycleStage>(() => initialLifecycle(initialJob, initialDraft?.header));
  const [pendingPoNumber, setPendingPoNumber] = useState(() => poNumberText(initialValues(initialJob, defaultSalesperson, initialDraft?.header).poNumbers));
  const [hasUnappliedLineChanges, setHasUnappliedLineChanges] = useState(false);
  const snapshot = (nextValues = values, nextLines = lines, nextStage = lifecycleStage, nextPendingPo = pendingPoNumber) => jobAggregateDirtySnapshot({ values: nextValues, lines: nextLines, lifecycleStage: nextStage, pendingPoNumber: nextPendingPo });
  const [baseline, setBaseline] = useState(() => { const initial = initialValues(initialJob, defaultSalesperson, initialDraft?.header); return jobAggregateDirtySnapshot({ values: initial, lines: initialJob?.lines ?? initialDraft?.lines ?? [], lifecycleStage: initialLifecycle(initialJob, initialDraft?.header), pendingPoNumber: poNumberText(initial.poNumbers) }); });
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const commandId = useRef<string | null>(null);
  const dirty = snapshot() !== baseline;
  const navigationDirty = dirty || hasUnappliedLineChanges;
  const visibleIdentifier = transferReview?.primaryIdentifier.value || values.bizTrackSalesOrder.trim() || job?.visibleIdentifier || job?.doorGoReference || 'New Job';
  useUnsavedChanges(navigationDirty);

  const input = useMemo<JobHeaderInput>(() => withEffectiveShopHours({
    ...values,
    poNumbers: poNumbersFromText(pendingPoNumber),
    lifecycleStage,
    shopHoursSource: values.shopHoursSource || null,
    deliveryDate: values.fulfillmentPlan === 'Delivery' ? values.deliveryDate : null,
    customerPickupDate: values.fulfillmentPlan === 'Customer Pickup' ? values.customerPickupDate : null,
    shopDateSource: values.shopDate.trim() ? 'Manual' : null,
  }, lines), [values, lifecycleStage, lines, pendingPoNumber]);
  const effectiveShopHours = input.shopHours === null || input.shopHours === undefined ? '' : String(input.shopHours);
  const effectiveShopHoursSource = input.shopHoursSource ?? '';

  function update(name: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [name]: value, ...(name === 'shopHours' ? { shopHoursSource: value.trim() ? 'Manual' : '' } : {}) }));
    setFieldErrors((current) => ({ ...current, [name]: '' }));
    setMessage(null);
  }

  function leave() {
    requestNavigation('/jobs');
  }

  function outputPath(internalJobId: string, intent: WorkOrderOutputIntent) {
    const query = intent === 'preview' ? '' : `?action=${intent}`;
    return `/jobs/${internalJobId}/work-order${query}`;
  }

  function validateAggregateBeforeSave(): boolean {
    const normalizedPoNumbers = normalizePoNumbers(poNumbersFromText(pendingPoNumber));
    if (!normalizedPoNumbers.ok) {
      setFieldErrors((current) => ({ ...current, poNumbers: normalizedPoNumbers.message }));
      setMessage({ kind: 'error', text: 'Review the PO Numbers entry.' });
      return false;
    }
    if (lifecycleStage === 'Confirmed Job' && !hasValidActiveDoorLine(lines)) {
      setMessage({ kind: 'error', text: CONFIRMED_JOB_LINE_MESSAGE });
      return false;
    }
    return true;
  }

  async function persistAggregate() {
    if (!validateAggregateBeforeSave()) return null;
    if (!job && transferReview && unresolvedTransferBlockers(transferReview.blockers).length) {
      setMessage({ kind: 'error', text: 'Resolve all legacy-transfer blockers before saving.' });
      return null;
    }
    setMessage(null); setFieldErrors({}); commandId.current ??= globalThis.crypto.randomUUID();
    const result = job
      ? await updateDraftJobAction({ internalJobId: job.internalJobId, expectedRevision: job.revision, input, lines })
      : transferReview
        ? await createTransferredJobAction({ commandId: commandId.current as string, rawPayload: transferReview.rawPayload, input, lines })
        : await createDraftJobAction({ commandId: commandId.current as string, input, lines });
    if (!result.ok) {
      setMessage({ kind: 'error', text: result.message });
      setFieldErrors(result.fieldErrors ?? {});
      return null;
    }
    setJob(result.job);
    const savedValues = initialValues(result.job, defaultSalesperson);
    const savedPoNumberText = poNumberText(savedValues.poNumbers);
    setValues(savedValues); setLines(result.job.lines); setLifecycleStage(result.job.lifecycleStage); setPendingPoNumber(savedPoNumberText);
    setBaseline(jobAggregateDirtySnapshot({ values: savedValues, lines: result.job.lines, lifecycleStage: result.job.lifecycleStage, pendingPoNumber: savedPoNumberText }));
    return result.job;
  }

  function openWorkOrder(intent: Exclude<WorkOrderOutputIntent, 'send'>) {
    if (isPending) return;
    const decision = workOrderOutputDecision({ hasSavedJob: Boolean(job), dirty, canEdit, hasUnappliedLineChanges });
    if (!decision.ok) {
      setMessage({ kind: 'error', text: decision.message });
      return;
    }
    if (!decision.saveRequired) { router.push(outputPath(job!.internalJobId, intent)); return; }
    startTransition(async () => {
      const saved = await persistAggregate();
      if (saved) router.push(outputPath(saved.internalJobId, intent));
    });
  }

  function save(exitAfterSave: boolean) {
    if (!canEdit || isPending) return;
    startTransition(async () => {
      const saved = await persistAggregate();
      if (!saved) return;
      setMessage({ kind: 'success', text: jobSaveConfirmation(saved) });
      if (exitAfterSave) router.push('/jobs');
      else if (!job) router.replace(`/jobs/${saved.internalJobId}/edit`);
    });
  }

  const bottomStatus = message?.text ?? (navigationDirty ? 'Unsaved changes' : job ? `Saved · Rev ${job.revision}` : 'Not saved yet');
  const archiveTarget = jobArchiveTarget(job, canEdit);
  const bottomActions = <>
    <button className="app-button app-button-secondary" onClick={leave} type="button">Exit</button>
    {job ? <details className="job-work-order-menu relative"><summary className="app-button app-button-secondary cursor-pointer list-none">Documents ▾</summary><div className="absolute bottom-full right-0 z-20 mb-1 grid min-w-44 gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"><span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Work Order</span><button className="app-button app-button-secondary justify-start" disabled={isPending} onClick={() => openWorkOrder('preview')} type="button">Preview</button><button className="app-button app-button-secondary justify-start" disabled={isPending} onClick={() => openWorkOrder('download')} type="button">Download</button><button className="app-button app-button-secondary justify-start" disabled={isPending} onClick={() => openWorkOrder('print')} type="button">Print</button><WorkOrderSendEntryButton dirty={dirty} disabled={isPending} hasSavedJob={Boolean(job)} hasUnappliedLineChanges={hasUnappliedLineChanges} onBlocked={(text) => setMessage({ kind: 'error', text })} onOpen={() => router.push(outputPath(job.internalJobId, 'send'))}/></div></details> : null}
    {archiveTarget ? <details className="job-actions-menu relative"><summary className="app-button app-button-secondary cursor-pointer list-none">Job Actions ▾</summary><div className="absolute right-0 z-20 grid min-w-44 gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"><span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Job Actions</span><JobArchiveControl onArchive={archiveDraftJobAction} onNavigate={(path) => router.push(path)} target={archiveTarget}/></div></details> : null}
    {canEdit ? <><button className="app-button app-button-primary" disabled={isPending || Boolean(transferReview && unresolvedTransferBlockers(transferReview.blockers).length)} onClick={() => save(false)} type="button">{isPending ? 'Saving…' : transferReview ? 'Save as Native Job' : 'Save'}</button>{!transferReview ? <button className="app-button app-button-dark" disabled={isPending} onClick={() => save(true)} type="button">Save and Exit</button> : null}</> : null}
  </>;
  return (
    <>
    {inAppShell ? <ContextTopBar
      title={visibleIdentifier}
      status={<span className="job-shell-identity-status"><select aria-label="Job lifecycle" disabled={!canEdit} onChange={(event) => setLifecycleStage(event.target.value as JobLifecycleStage)} value={lifecycleStage}><option value="Draft">Draft</option><option disabled={lifecycleStage !== 'Confirmed Job' && !hasValidActiveDoorLine(lines)} value="Confirmed Job">Confirmed</option></select><span>{job ? `Rev ${job.revision}` : 'New'}{!canEdit ? ' · Read only' : ''}</span></span>}
      controls={<div className="app-job-context-fields app-job-shell-fields">
        <label className="app-job-context-field job-shell-customer" htmlFor="customer"><span>Customer</span><input aria-invalid={fieldErrors.customer ? true : undefined} disabled={!canEdit} id="customer" onChange={(event) => update('customer', event.target.value)} placeholder="Not entered" title={fieldErrors.customer || undefined} value={values.customer}/></label>
        <label className="app-job-context-field job-shell-site" htmlFor="siteAddress"><span>Site / Address</span><input aria-invalid={fieldErrors.siteAddress ? true : undefined} disabled={!canEdit} id="siteAddress" onChange={(event) => update('siteAddress', event.target.value)} placeholder="Not entered" title={fieldErrors.siteAddress || undefined} value={values.siteAddress}/></label>
        <label className="app-job-context-field job-shell-salesperson" htmlFor="salesperson"><span>Salesperson</span><input disabled={!canEdit} id="salesperson" onChange={(event) => update('salesperson', event.target.value)} placeholder="Not assigned" value={values.salesperson}/></label>
        <label className="app-job-context-field job-shell-sales-order" htmlFor="bizTrackSalesOrder"><span>BizTrack Sales Order</span><input aria-invalid={fieldErrors.bizTrackSalesOrder ? true : undefined} disabled={!canEdit || Boolean(transferReview)} id="bizTrackSalesOrder" onChange={(event) => update('bizTrackSalesOrder', event.target.value)} placeholder="Optional" title={fieldErrors.bizTrackSalesOrder || undefined} value={values.bizTrackSalesOrder}/></label>
        <label className="app-job-context-field job-shell-phone" htmlFor="phone"><span>Phone</span><input autoComplete="tel" disabled={!canEdit} id="phone" onChange={(event) => update('phone', event.target.value)} placeholder="Not entered" type="tel" value={values.phone}/></label>
        <label className="app-job-context-field job-shell-email" htmlFor="email"><span>Email</span><input aria-invalid={fieldErrors.email ? true : undefined} autoComplete="email" disabled={!canEdit} id="email" onChange={(event) => update('email', event.target.value)} placeholder="Not entered" title={fieldErrors.email || undefined} type="email" value={values.email}/></label>
        <label className="app-job-context-field job-shell-hours" htmlFor="shopHours"><span>Shop Hours</span><input aria-invalid={fieldErrors.shopHours ? true : undefined} disabled={!canEdit} id="shopHours" min="0" onChange={(event) => update('shopHours', event.target.value)} step="0.25" type="number" value={effectiveShopHours}/></label>
        <label className="app-job-context-field job-shell-fulfillment" htmlFor="fulfillmentPlan"><span>Fulfillment Plan</span><span className="job-shell-fulfillment-controls"><select disabled={!canEdit} id="fulfillmentPlan" onChange={(event) => update('fulfillmentPlan', event.target.value)} value={values.fulfillmentPlan}><option value="">Not selected</option><option value="Delivery">Delivery</option><option value="Customer Pickup">Customer Pickup</option></select>{values.fulfillmentPlan === 'Delivery' ? <input aria-label="Delivery Date" disabled={!canEdit} onChange={(event) => update('deliveryDate', event.target.value)} type="date" value={values.deliveryDate}/> : null}{values.fulfillmentPlan === 'Customer Pickup' ? <input aria-label="Customer Pickup Date" disabled={!canEdit} onChange={(event) => update('customerPickupDate', event.target.value)} type="date" value={values.customerPickupDate}/> : null}</span></label>
        <label className="app-job-context-field job-shell-shop-date" htmlFor="shopDate"><span>Shop Date</span><input disabled={!canEdit} id="shopDate" onChange={(event) => update('shopDate', event.target.value)} type="date" value={values.shopDate}/></label>
        <label className="app-job-context-field job-shell-po" htmlFor="poNumbers"><span>PO Number(s)</span><input aria-describedby={fieldErrors.poNumbers ? 'poNumbers-error' : undefined} aria-invalid={fieldErrors.poNumbers ? true : undefined} disabled={!canEdit} id="poNumbers" inputMode="numeric" onChange={(event) => { setPendingPoNumber(event.target.value); setFieldErrors((current) => ({ ...current, poNumbers: '' })); setMessage(null); }} placeholder="Optional · comma separated" title={fieldErrors.poNumbers || undefined} value={pendingPoNumber}/></label>
        <label className="app-job-context-field job-shell-notes" htmlFor="notes"><span>Job Notes</span><textarea disabled={!canEdit} id="notes" onChange={(event) => update('notes', event.target.value)} placeholder="Job notes" rows={1} value={values.notes}/></label>
      </div>}
    /> : null}
    <div className={inAppShell ? 'app-workspace app-workspace-fluid job-editor-workspace' : undefined}>
    <section className="job-editor-surface rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      {!inAppShell ? (
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4 dark:border-slate-700">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Current Job</p>
          <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{visibleIdentifier}</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {lifecycleStage} · {job ? `Revision ${job.revision}` : 'Not saved yet'}
          </p>
        </div>
        <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          {canEdit ? lifecycleStage : `${lifecycleStage} · Read only`}
        </span>
      </div>
      ) : null}

      {!canEdit ? <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">You have jobs = view access. This draft is read-only.</p> : null}
      {transferReview ? <section className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-950 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-100" aria-labelledby="legacy-transfer-review-heading">
        <h2 className="font-bold" id="legacy-transfer-review-heading">Imported legacy job — review before saving</h2>
        <p className="mt-2">{transferReview.primaryIdentifier.label}: <strong>{transferReview.primaryIdentifier.value}</strong></p>
        <p>Source saved: {transferReview.sourceSavedAt} · Exported: {transferReview.exportedAt}</p>
        <p className="mt-2">No native job, UUID, revision, or new DoorGo reference exists until you select Save as Native Job.</p>
        <p>The legacy source must be archived manually only after the saved native job is reopened and verified.</p>
        <LegacyTransferEvidenceSummary blockers={transferReview.blockers} unsupportedFields={transferReview.unsupportedFields} warnings={transferReview.warnings}/>
      </section> : null}
      {!inAppShell ? <p className="job-confirmation-note mt-1.5 flex min-h-7 items-center rounded bg-slate-100 px-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"><span aria-hidden="true" className="mr-1.5 font-bold text-sky-700">i</span>Confirmation requires at least one valid active door line. Saving or confirming does not schedule production or create fulfillment or Calendar records.</p> : null}

      {!hasValidActiveDoorLine(lines) ? <p className="mt-1 text-[11px] text-slate-500">Add a valid active line before confirming.</p> : null}

      <div className="job-operational-strip mt-1 grid gap-1.5">
        <section aria-label="Job header validation">
          {fieldErrors.bizTrackSalesOrder ? <p className="text-sm text-rose-700" role="alert">BizTrack Sales Order: {fieldErrors.bizTrackSalesOrder}</p> : null}
          {fieldErrors.email ? <p className="text-sm text-rose-700" role="alert">Email: {fieldErrors.email}</p> : null}
          {inAppShell && fieldErrors.customer ? <p className="mt-2 text-sm text-rose-700" role="alert">Customer: {fieldErrors.customer}</p> : null}
          {inAppShell && fieldErrors.siteAddress ? <p className="mt-2 text-sm text-rose-700" role="alert">Site / Address: {fieldErrors.siteAddress}</p> : null}
        </section>

        {!inAppShell ? <section className="job-production-strip rounded-md border border-slate-200 p-1.5 dark:border-slate-700" aria-label="Production Setup"><div className="job-production-fields grid gap-1.5 md:grid-cols-3 xl:grid-cols-5"><Field error={fieldErrors.shopHours} label={`Shop Hours${effectiveShopHoursSource ? ` · ${effectiveShopHoursSource}` : ''}`} name="shopHours"><input className={inputClass} disabled={!canEdit} id="shopHours" min="0" onChange={(event) => update('shopHours', event.target.value)} step="0.25" type="number" value={effectiveShopHours}/></Field><Field label="Fulfillment Plan" name="fulfillmentPlan"><select className={inputClass} disabled={!canEdit} id="fulfillmentPlan" onChange={(event) => update('fulfillmentPlan', event.target.value)} value={values.fulfillmentPlan}><option value="">Not selected</option><option value="Delivery">Delivery</option><option value="Customer Pickup">Customer Pickup</option></select></Field>{values.fulfillmentPlan === 'Delivery' ? <Field label="Delivery Date" name="deliveryDate"><input className={inputClass} disabled={!canEdit} id="deliveryDate" onChange={(event) => update('deliveryDate', event.target.value)} type="date" value={values.deliveryDate}/></Field> : null}{values.fulfillmentPlan === 'Customer Pickup' ? <Field label="Customer Pickup Date" name="customerPickupDate"><input className={inputClass} disabled={!canEdit} id="customerPickupDate" onChange={(event) => update('customerPickupDate', event.target.value)} type="date" value={values.customerPickupDate}/></Field> : null}<Field label="Shop Date" name="shopDate"><input className={inputClass} disabled={!canEdit} id="shopDate" onChange={(event) => update('shopDate', event.target.value)} type="date" value={values.shopDate}/></Field></div></section> : null}

        {!inAppShell ? <div className="job-details-strip">
          <div className="job-po-numbers"><Field error={fieldErrors.poNumbers} label="PO Number(s)" name="poNumbers"><input aria-describedby={fieldErrors.poNumbers ? 'poNumbers-error' : undefined} className={inputClass} disabled={!canEdit} id="poNumbers" inputMode="numeric" onChange={(event) => { setPendingPoNumber(event.target.value); setFieldErrors((current) => ({ ...current, poNumbers: '' })); setMessage(null); }} placeholder="Optional · separate multiple numbers with commas" value={pendingPoNumber}/></Field></div>
          <Field label="Job Notes" name="notes"><textarea className={`${inputClass} job-notes-compact resize-y`} disabled={!canEdit} id="notes" onChange={(e) => update('notes', e.target.value)} placeholder="Job notes" rows={1} value={values.notes}/></Field>
        </div> : null}
      </div>

      <div className="mt-3"><DoorLineWorkspace canEdit={canEdit} hingeColor={values.hingeColor} lifecycleStage={lifecycleStage} lines={lines} onChange={setLines} onHingeColorChange={(value) => update('hingeColor', value)} onUnappliedChange={setHasUnappliedLineChanges}/></div>

      {!inAppShell && message ? <p className={`mt-5 rounded-xl p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100'}`} role="status">{message.text}</p> : null}
      {!inAppShell ? <div className="job-editor-actions flex flex-wrap gap-1 border-t border-slate-200 py-1.5">{bottomActions}</div> : null}

    </section>
      {!inAppShell ? <JobArchiveControl
        onArchive={archiveDraftJobAction}
        onNavigate={(path) => router.push(path)}
        target={jobArchiveTarget(job, canEdit)}
      /> : null}
    </div>
    {inAppShell ? <ContextBottomBar label="Job actions" status={<span className={message?.kind === 'error' ? 'text-rose-700' : undefined}>{bottomStatus}</span>} context="Confirmation requires one valid active door line · saving does not schedule production" actions={bottomActions}/> : null}
    </>
  );
}
