'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState, useTransition } from 'react';
import { archiveDraftJobAction, createDraftJobAction, createTransferredJobAction, updateDraftJobAction } from '@/lib/jobs/job-intake-actions';
import { CONFIRMED_JOB_LINE_MESSAGE, hasValidActiveDoorLine } from '@/lib/jobs/door-line-contract';
import { jobAggregateDirtySnapshot, jobSaveConfirmation, normalizePoNumbers } from '@/lib/jobs/job-intake-contract';
import type { DoorLineInput, JobHeaderInput, JobLifecycleStage, NativeJobAggregate } from '@/lib/jobs/job-intake-types';
import type { LegacyTransferIssue, UnifiedTransferIdentifier } from '@/lib/jobs/legacy-transfer-types';
import { unresolvedTransferBlockers } from '@/lib/jobs/legacy-transfer-import-contract';
import { workOrderOutputDecision, type WorkOrderOutputIntent } from '@/lib/jobs/work-order-preview-contract';
import { HINGE_COLOR_OPTIONS, normalizeHingeColor } from '@/lib/jobs/hinge-contract';
import { DoorLineWorkspace } from './DoorLineWorkspace';
import { JobArchiveControl, jobArchiveTarget } from './JobArchiveControl';
import { WorkOrderSendEntryButton } from './WorkOrderSendEntryButton';
import { LegacyTransferEvidenceSummary } from './LegacyTransferEvidenceSummary';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
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
  const [lifecycleStage, setLifecycleStage] = useState<JobLifecycleStage>(initialJob?.lifecycleStage ?? (initialDraft?.header.lifecycleStage === 'Confirmed Job' ? 'Confirmed Job' : 'Draft'));
  const [pendingPoNumber, setPendingPoNumber] = useState('');
  const [hasUnappliedLineChanges, setHasUnappliedLineChanges] = useState(false);
  const snapshot = (nextValues = values, nextLines = lines, nextStage = lifecycleStage, nextPendingPo = pendingPoNumber) => jobAggregateDirtySnapshot({ values: nextValues, lines: nextLines, lifecycleStage: nextStage, pendingPoNumber: nextPendingPo });
  const [baseline, setBaseline] = useState(() => jobAggregateDirtySnapshot({ values: initialValues(initialJob, defaultSalesperson, initialDraft?.header), lines: initialJob?.lines ?? initialDraft?.lines ?? [], lifecycleStage: initialJob?.lifecycleStage ?? (initialDraft?.header.lifecycleStage === 'Confirmed Job' ? 'Confirmed Job' : 'Draft'), pendingPoNumber: '' }));
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const commandId = useRef<string | null>(null);
  const dirty = snapshot() !== baseline;
  const navigationDirty = dirty || hasUnappliedLineChanges;
  const visibleIdentifier = transferReview?.primaryIdentifier.value || values.bizTrackSalesOrder.trim() || job?.visibleIdentifier || job?.doorGoReference || 'New Draft';
  useUnsavedChanges(navigationDirty);

  const input = useMemo<JobHeaderInput>(() => ({
    ...values,
    lifecycleStage,
    shopHoursSource: values.shopHoursSource || null,
    deliveryDate: values.fulfillmentPlan === 'Delivery' ? values.deliveryDate : null,
    customerPickupDate: values.fulfillmentPlan === 'Customer Pickup' ? values.customerPickupDate : null,
    shopDateSource: values.shopDate.trim() ? 'Manual' : null,
  }), [values, lifecycleStage]);

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
    if (pendingPoNumber.trim()) {
      setFieldErrors((current) => ({ ...current, poNumbers: 'Add the pending PO Number or clear the entry before saving.' }));
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
    setValues(savedValues); setLines(result.job.lines); setLifecycleStage(result.job.lifecycleStage); setPendingPoNumber('');
    setBaseline(jobAggregateDirtySnapshot({ values: savedValues, lines: result.job.lines, lifecycleStage: result.job.lifecycleStage, pendingPoNumber: '' }));
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

  function addPoNumber() {
    if (!canEdit) return;
    const normalized = normalizePoNumbers([...values.poNumbers, pendingPoNumber]);
    if (!pendingPoNumber.trim() || !normalized.ok) {
      setFieldErrors((current) => ({ ...current, poNumbers: normalized.ok ? 'Enter a PO Number before adding it.' : normalized.message }));
      return;
    }
    setValues((current) => ({ ...current, poNumbers: normalized.value }));
    setPendingPoNumber('');
    setFieldErrors((current) => ({ ...current, poNumbers: '' }));
    setMessage(null);
  }

  function removePoNumber(poNumber: string) {
    if (!canEdit) return;
    setValues((current) => ({ ...current, poNumbers: current.poNumbers.filter((value) => value !== poNumber) }));
    setFieldErrors((current) => ({ ...current, poNumbers: '' }));
    setMessage(null);
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

  const contextStatus = canEdit ? lifecycleStage : `${lifecycleStage} · Read only`;
  return (
    <>
    {inAppShell ? <ContextTopBar
      backHref="/jobs"
      backLabel="Jobs"
      title={visibleIdentifier}
      secondary={values.siteAddress.trim() || undefined}
      status={<span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">{contextStatus}{job ? ` · Rev ${job.revision}` : ''}</span>}
      controls={<div className="app-job-context-fields">
        <label className="app-job-context-field" htmlFor="customer"><span>Customer</span><input aria-invalid={fieldErrors.customer ? true : undefined} disabled={!canEdit} id="customer" onChange={(event) => update('customer', event.target.value)} placeholder="Not entered" title={fieldErrors.customer || undefined} value={values.customer}/></label>
        <label className="app-job-context-field" htmlFor="siteAddress"><span>Site / Address</span><input aria-invalid={fieldErrors.siteAddress ? true : undefined} disabled={!canEdit} id="siteAddress" onChange={(event) => update('siteAddress', event.target.value)} placeholder="Not entered" title={fieldErrors.siteAddress || undefined} value={values.siteAddress}/></label>
        <label className="app-job-context-field" htmlFor="salesperson"><span>Salesperson</span><input disabled={!canEdit} id="salesperson" onChange={(event) => update('salesperson', event.target.value)} placeholder="Not assigned" value={values.salesperson}/></label>
        <label className="app-job-context-field" htmlFor="bizTrackSalesOrder"><span>BizTrack Sales Order</span><input aria-invalid={fieldErrors.bizTrackSalesOrder ? true : undefined} disabled={!canEdit || Boolean(transferReview)} id="bizTrackSalesOrder" onChange={(event) => update('bizTrackSalesOrder', event.target.value)} placeholder="Optional" title={fieldErrors.bizTrackSalesOrder || undefined} value={values.bizTrackSalesOrder}/></label>
        <label className="app-job-context-field" htmlFor="phone"><span>Phone</span><input autoComplete="tel" disabled={!canEdit} id="phone" onChange={(event) => update('phone', event.target.value)} placeholder="Not entered" type="tel" value={values.phone}/></label>
        <label className="app-job-context-field" htmlFor="email"><span>Email</span><input aria-invalid={fieldErrors.email ? true : undefined} autoComplete="email" disabled={!canEdit} id="email" onChange={(event) => update('email', event.target.value)} placeholder="Not entered" title={fieldErrors.email || undefined} type="email" value={values.email}/></label>
      </div>}
      actions={<div className="app-job-lifecycle" aria-label="Job lifecycle"><button aria-pressed={lifecycleStage === 'Draft'} disabled={!canEdit} onClick={() => setLifecycleStage('Draft')} type="button">Draft</button><button aria-pressed={lifecycleStage === 'Confirmed Job'} disabled={!canEdit || !hasValidActiveDoorLine(lines)} onClick={() => setLifecycleStage('Confirmed Job')} type="button">Confirmed</button></div>}
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
      <p className="job-confirmation-note mt-1.5 flex min-h-7 items-center rounded bg-slate-100 px-2 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-200"><span aria-hidden="true" className="mr-1.5 font-bold text-sky-700">i</span>Confirmation requires at least one valid active door line. Saving or confirming does not schedule production or create fulfillment or Calendar records.</p>

      {!hasValidActiveDoorLine(lines) ? <p className="mt-1 text-[11px] text-slate-500">Add a valid active line before confirming.</p> : null}

      <div className="mt-3 grid gap-2.5">
        <section aria-label="Job header validation">
          {fieldErrors.bizTrackSalesOrder ? <p className="text-sm text-rose-700" role="alert">BizTrack Sales Order: {fieldErrors.bizTrackSalesOrder}</p> : null}
          {fieldErrors.email ? <p className="text-sm text-rose-700" role="alert">Email: {fieldErrors.email}</p> : null}
          {inAppShell && fieldErrors.customer ? <p className="mt-2 text-sm text-rose-700" role="alert">Customer: {fieldErrors.customer}</p> : null}
          {inAppShell && fieldErrors.siteAddress ? <p className="mt-2 text-sm text-rose-700" role="alert">Site / Address: {fieldErrors.siteAddress}</p> : null}
        </section>

        <section className="job-production-strip rounded-md border border-slate-200 p-1.5 dark:border-slate-700" aria-label="Production Setup">
          <div className="grid gap-1.5 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Hinge Color" name="hingeColor"><select className={inputClass} disabled={!canEdit} id="hingeColor" onChange={(e) => update('hingeColor', e.target.value)} value={values.hingeColor}>{!normalizeHingeColor(values.hingeColor).ok ? <option disabled value={values.hingeColor}>Invalid saved value — choose a valid finish</option> : null}{HINGE_COLOR_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></Field>
            <Field error={fieldErrors.shopHours} label="Shop Hours" name="shopHours"><input className={inputClass} disabled={!canEdit} id="shopHours" min="0" onChange={(e) => update('shopHours', e.target.value)} step="0.25" type="number" value={values.shopHours}/></Field>
            <Field label="Fulfillment Plan" name="fulfillmentPlan"><select className={inputClass} disabled={!canEdit} id="fulfillmentPlan" onChange={(e) => update('fulfillmentPlan', e.target.value)} value={values.fulfillmentPlan}><option value="">Not selected</option><option value="Delivery">Delivery</option><option value="Customer Pickup">Customer Pickup</option></select></Field>
            {values.fulfillmentPlan === 'Delivery' ? <Field label="Delivery Date" name="deliveryDate"><input className={inputClass} disabled={!canEdit} id="deliveryDate" onChange={(e) => update('deliveryDate', e.target.value)} type="date" value={values.deliveryDate}/></Field> : null}
            {values.fulfillmentPlan === 'Customer Pickup' ? <Field label="Customer Pickup Date" name="customerPickupDate"><input className={inputClass} disabled={!canEdit} id="customerPickupDate" onChange={(e) => update('customerPickupDate', e.target.value)} type="date" value={values.customerPickupDate}/></Field> : null}
            <Field label="Shop Date" name="shopDate"><input className={inputClass} disabled={!canEdit} id="shopDate" onChange={(e) => update('shopDate', e.target.value)} type="date" value={values.shopDate}/></Field>
          </div>
          <div className="mt-1" aria-labelledby="po-numbers-label">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" id="po-numbers-label">PO Numbers</p>
            {values.poNumbers.length ? <ul className="mt-2 flex flex-wrap gap-2">{values.poNumbers.map((poNumber) => <li className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-slate-900 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100" key={poNumber}><span>{poNumber}</span>{canEdit ? <button aria-label={`Remove PO ${poNumber}`} className="min-h-10 rounded-lg px-3 font-semibold text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950" onClick={() => removePoNumber(poNumber)} type="button">Remove</button> : null}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No PO Numbers saved.</p>}
            {canEdit ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-describedby={fieldErrors.poNumbers ? 'poNumbers-error' : undefined} aria-label="PO Number" className={`${inputClass} rounded-xl border border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-950`} inputMode="numeric" onChange={(event) => { setPendingPoNumber(event.target.value); setFieldErrors((current) => ({ ...current, poNumbers: '' })); }} placeholder="Digits only" value={pendingPoNumber}/><button className="min-h-12 rounded-xl bg-sky-700 px-5 font-semibold text-white" onClick={addPoNumber} type="button">Add PO</button></div> : null}
            {fieldErrors.poNumbers ? <p className="mt-2 text-sm text-rose-700 dark:text-rose-300" id="poNumbers-error">{fieldErrors.poNumbers}</p> : null}
          </div>
        </section>

        <Field label="Job Notes" name="notes"><textarea className={`${inputClass} job-notes-compact resize-y`} disabled={!canEdit} id="notes" onChange={(e) => update('notes', e.target.value)} placeholder="Job notes" rows={values.notes ? 2 : 1} value={values.notes}/></Field>
      </div>

      <div className="mt-3"><DoorLineWorkspace canEdit={canEdit} lifecycleStage={lifecycleStage} lines={lines} onChange={setLines} onUnappliedChange={setHasUnappliedLineChanges}/></div>

      {message ? <p className={`mt-5 rounded-xl p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100'}`} role="status">{message.text}</p> : null}

      <div className="job-editor-actions sticky bottom-0 z-10 mt-2 flex flex-col-reverse gap-1 border-t border-slate-200 bg-white/95 py-1.5 backdrop-blur sm:flex-row sm:flex-wrap dark:border-slate-700 dark:bg-slate-900/95">
        <button className="rounded-md border border-slate-300 px-3 text-xs font-semibold dark:border-slate-600" onClick={leave} type="button">Exit</button>
        {job ? <details className="job-work-order-menu relative"><summary className="app-button app-button-secondary cursor-pointer list-none">Documents ▾</summary><div className="absolute bottom-full left-0 z-20 mb-1 grid min-w-44 gap-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900"><span className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Work Order</span><button className="app-button app-button-secondary justify-start" disabled={isPending} onClick={() => openWorkOrder('preview')} type="button">Preview</button><button className="app-button app-button-secondary justify-start" disabled={isPending} onClick={() => openWorkOrder('download')} type="button">Download</button><button className="app-button app-button-secondary justify-start" disabled={isPending} onClick={() => openWorkOrder('print')} type="button">Print</button><WorkOrderSendEntryButton dirty={dirty} disabled={isPending} hasSavedJob={Boolean(job)} hasUnappliedLineChanges={hasUnappliedLineChanges} onBlocked={(text) => setMessage({ kind: 'error', text })} onOpen={() => router.push(outputPath(job.internalJobId, 'send'))}/></div></details> : null}
        {canEdit ? <>
          <button className="min-h-12 rounded-xl bg-sky-700 px-5 font-semibold text-white disabled:opacity-60" disabled={isPending || Boolean(transferReview && unresolvedTransferBlockers(transferReview.blockers).length)} onClick={() => save(false)} type="button">{isPending ? 'Saving…' : transferReview ? 'Save as Native Job' : 'Save'}</button>
          {!transferReview ? <button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900" disabled={isPending} onClick={() => save(true)} type="button">Save and Exit</button> : null}
        </> : null}
      </div>

      <JobArchiveControl
        onArchive={archiveDraftJobAction}
        onNavigate={(path) => router.push(path)}
        target={jobArchiveTarget(job, canEdit)}
      />
    </section>
    </div>
    </>
  );
}
