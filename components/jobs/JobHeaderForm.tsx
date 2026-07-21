'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createDraftJobAction, updateDraftJobAction } from '@/lib/jobs/job-intake-actions';
import { CONFIRMED_JOB_LINE_MESSAGE, hasValidActiveDoorLine } from '@/lib/jobs/door-line-contract';
import type { DoorLineInput, JobHeaderInput, JobLifecycleStage, NativeJobAggregate } from '@/lib/jobs/job-intake-types';
import { DoorLineWorkspace } from './DoorLineWorkspace';

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
  fulfillmentPlan: string;
  deliveryDate: string;
  customerPickupDate: string;
  shopDate: string;
};

function initialValues(job: NativeJobAggregate | null, defaultSalesperson: string): FormValues {
  return {
    bizTrackSalesOrder: job?.bizTrackSalesOrder ?? '',
    customer: job?.customer ?? '',
    siteAddress: job?.siteAddress ?? '',
    phone: job?.phone ?? '',
    email: job?.email ?? '',
    salesperson: job?.salesperson ?? defaultSalesperson,
    notes: job?.notes ?? '',
    hingeColor: job?.hingeColor ?? '',
    shopHours: job?.shopHours === null || job?.shopHours === undefined ? '' : String(job.shopHours),
    shopHoursSource: job?.shopHoursSource ?? '',
    fulfillmentPlan: job?.fulfillmentPlan ?? '',
    deliveryDate: job?.deliveryDate ?? '',
    customerPickupDate: job?.customerPickupDate ?? '',
    shopDate: job?.shopDate ?? '',
  };
}

const inputClass = 'min-h-12 w-full border-0 bg-transparent px-3 py-2 text-base outline-none disabled:cursor-not-allowed disabled:opacity-70 sm:min-h-11';
const fieldClass = 'job-intake-field grid overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-sky-600 focus-within:ring-2 focus-within:ring-sky-200 dark:border-slate-600 dark:bg-slate-950';

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
}: {
  initialJob: NativeJobAggregate | null;
  canEdit: boolean;
  defaultSalesperson: string;
}) {
  const router = useRouter();
  const [job, setJob] = useState(initialJob);
  const [values, setValues] = useState(() => initialValues(initialJob, defaultSalesperson));
  const [lines, setLines] = useState<DoorLineInput[]>(() => initialJob?.lines ?? []);
  const [lifecycleStage, setLifecycleStage] = useState<JobLifecycleStage>(initialJob?.lifecycleStage ?? 'Draft');
  const snapshot = (nextValues = values, nextLines = lines, nextStage = lifecycleStage) => JSON.stringify({ values: nextValues, lines: nextLines, lifecycleStage: nextStage });
  const [baseline, setBaseline] = useState(() => JSON.stringify({ values: initialValues(initialJob, defaultSalesperson), lines: initialJob?.lines ?? [], lifecycleStage: initialJob?.lifecycleStage ?? 'Draft' }));
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();
  const commandId = useRef<string | null>(null);
  const dirty = snapshot() !== baseline;
  const visibleIdentifier = values.bizTrackSalesOrder.trim() || job?.doorGoReference || 'New Draft';

  useEffect(() => {
    const preventExit = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventExit);
    return () => window.removeEventListener('beforeunload', preventExit);
  }, [dirty]);

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
    if (!dirty || window.confirm('Exit without saving your changes?')) router.push('/jobs');
  }

  function save(exitAfterSave: boolean) {
    if (!canEdit || isPending) return;
    if (lifecycleStage === 'Confirmed Job' && !hasValidActiveDoorLine(lines)) {
      setMessage({ kind: 'error', text: CONFIRMED_JOB_LINE_MESSAGE });
      return;
    }
    setMessage(null);
    setFieldErrors({});
    commandId.current ??= globalThis.crypto.randomUUID();
    startTransition(async () => {
      const result = job
        ? await updateDraftJobAction({ internalJobId: job.internalJobId, expectedRevision: job.revision, input, lines })
        : await createDraftJobAction({ commandId: commandId.current as string, input, lines });
      if (!result.ok) {
        setMessage({ kind: 'error', text: result.message });
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setJob(result.job);
      const savedValues = initialValues(result.job, defaultSalesperson);
      setValues(savedValues);
      setLines(result.job.lines);
      setLifecycleStage(result.job.lifecycleStage);
      setBaseline(JSON.stringify({ values: savedValues, lines: result.job.lines, lifecycleStage: result.job.lifecycleStage }));
      setMessage({ kind: 'success', text: `${result.job.doorGoReference} saved.` });
      if (exitAfterSave) router.push('/jobs');
      else if (!job) router.replace(`/jobs/${result.job.internalJobId}/edit`);
    });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
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

      {!canEdit ? <p className="mt-4 rounded-xl bg-sky-50 p-3 text-sm text-sky-900 dark:bg-sky-950 dark:text-sky-100">You have jobs = view access. This draft is read-only.</p> : null}
      <p className="mt-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">Confirmation requires at least one valid active door line. Saving or confirming does not schedule production or create fulfillment or Calendar records.</p>

      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <span className="font-semibold">Lifecycle</span>
        <button className={`min-h-11 rounded-xl px-4 font-semibold ${lifecycleStage === 'Draft' ? 'bg-amber-600 text-white' : 'border border-slate-300 dark:border-slate-600'}`} disabled={!canEdit} onClick={() => setLifecycleStage('Draft')} type="button">Draft</button>
        <button className={`min-h-11 rounded-xl px-4 font-semibold ${lifecycleStage === 'Confirmed Job' ? 'bg-emerald-700 text-white' : 'border border-slate-300 dark:border-slate-600'}`} disabled={!canEdit || !hasValidActiveDoorLine(lines)} onClick={() => setLifecycleStage('Confirmed Job')} type="button">Confirmed Job</button>
        {!hasValidActiveDoorLine(lines) ? <span className="text-sm text-slate-500">Add a valid active line before confirming.</span> : null}
      </div>

      <div className="mt-5 grid gap-4">
        <section aria-labelledby="job-identity-heading">
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400" id="job-identity-heading">Identity and contact</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field error={fieldErrors.bizTrackSalesOrder} label="BizTrack Sales Order" name="bizTrackSalesOrder"><input className={inputClass} disabled={!canEdit} id="bizTrackSalesOrder" onChange={(e) => update('bizTrackSalesOrder', e.target.value)} placeholder="Optional" value={values.bizTrackSalesOrder}/></Field>
            <Field error={fieldErrors.customer} label="Customer" name="customer"><input className={inputClass} disabled={!canEdit} id="customer" onChange={(e) => update('customer', e.target.value)} placeholder="Customer" value={values.customer}/></Field>
            <Field error={fieldErrors.siteAddress} label="Site / Address" name="siteAddress"><input className={inputClass} disabled={!canEdit} id="siteAddress" onChange={(e) => update('siteAddress', e.target.value)} placeholder="Site or address" value={values.siteAddress}/></Field>
            <Field label="Phone" name="phone"><input autoComplete="tel" className={inputClass} disabled={!canEdit} id="phone" onChange={(e) => update('phone', e.target.value)} placeholder="Phone number" type="tel" value={values.phone}/></Field>
            <Field error={fieldErrors.email} label="Email" name="email"><input autoComplete="email" className={inputClass} disabled={!canEdit} id="email" onChange={(e) => update('email', e.target.value)} placeholder="Email address" type="email" value={values.email}/></Field>
            <Field label="Salesperson" name="salesperson"><input className={inputClass} disabled={!canEdit} id="salesperson" onChange={(e) => update('salesperson', e.target.value)} placeholder="Not assigned" value={values.salesperson}/></Field>
          </div>
        </section>

        <details className="rounded-xl border border-slate-200 p-4 dark:border-slate-700" open={Boolean(values.hingeColor || values.shopHours || values.fulfillmentPlan || values.shopDate)}>
          <summary className="cursor-pointer font-semibold">Production details (optional in Draft)</summary>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Hinge Color" name="hingeColor"><input className={inputClass} disabled={!canEdit} id="hingeColor" onChange={(e) => update('hingeColor', e.target.value)} value={values.hingeColor}/></Field>
            <Field error={fieldErrors.shopHours} label="Shop Hours" name="shopHours"><input className={inputClass} disabled={!canEdit} id="shopHours" min="0" onChange={(e) => update('shopHours', e.target.value)} step="0.25" type="number" value={values.shopHours}/></Field>
            <Field label="Fulfillment Plan" name="fulfillmentPlan"><select className={inputClass} disabled={!canEdit} id="fulfillmentPlan" onChange={(e) => update('fulfillmentPlan', e.target.value)} value={values.fulfillmentPlan}><option value="">Not selected</option><option value="Delivery">Delivery</option><option value="Customer Pickup">Customer Pickup</option></select></Field>
            {values.fulfillmentPlan === 'Delivery' ? <Field label="Delivery Date" name="deliveryDate"><input className={inputClass} disabled={!canEdit} id="deliveryDate" onChange={(e) => update('deliveryDate', e.target.value)} type="date" value={values.deliveryDate}/></Field> : null}
            {values.fulfillmentPlan === 'Customer Pickup' ? <Field label="Customer Pickup Date" name="customerPickupDate"><input className={inputClass} disabled={!canEdit} id="customerPickupDate" onChange={(e) => update('customerPickupDate', e.target.value)} type="date" value={values.customerPickupDate}/></Field> : null}
            <Field label="Shop Date" name="shopDate"><input className={inputClass} disabled={!canEdit} id="shopDate" onChange={(e) => update('shopDate', e.target.value)} type="date" value={values.shopDate}/></Field>
          </div>
        </details>

        <Field label="Job Notes" name="notes"><textarea className={`${inputClass} min-h-24 resize-y`} disabled={!canEdit} id="notes" onChange={(e) => update('notes', e.target.value)} placeholder="Job notes" value={values.notes}/></Field>
      </div>

      <div className="mt-6"><DoorLineWorkspace canEdit={canEdit} lifecycleStage={lifecycleStage} lines={lines} onChange={setLines}/></div>

      {message ? <p className={`mt-5 rounded-xl p-3 text-sm ${message.kind === 'success' ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100' : 'bg-rose-50 text-rose-900 dark:bg-rose-950 dark:text-rose-100'}`} role="status">{message.text}</p> : null}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap">
        <button className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold dark:border-slate-600" onClick={leave} type="button">Back / Exit</button>
        {canEdit ? <>
          <button className="min-h-12 rounded-xl bg-sky-700 px-5 font-semibold text-white disabled:opacity-60" disabled={isPending} onClick={() => save(false)} type="button">{isPending ? 'Saving…' : 'Save'}</button>
          <button className="min-h-12 rounded-xl bg-slate-900 px-5 font-semibold text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900" disabled={isPending} onClick={() => save(true)} type="button">Save and Exit</button>
        </> : null}
      </div>
    </section>
  );
}
