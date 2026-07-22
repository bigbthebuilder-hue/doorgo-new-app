import type {
  JobHeaderFields,
  JobHeaderInput,
  JobIntakeFailureCode,
  NativeJobHeader,
} from './job-intake-types';
import { normalizeHingeColor } from './hinge-contract';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type NormalizedJobHeader =
  | { ok: true; value: JobHeaderFields }
  | { ok: false; message: string; fieldErrors: Record<string, string> };

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function optionalHours(value: unknown): number | null | typeof Number.NaN {
  const text = optionalText(value);
  if (text === null) return null;
  const result = Number(text);
  return Number.isFinite(result) && result >= 0 ? result : Number.NaN;
}

export type NormalizedPoNumbers =
  | { ok: true; value: string[] }
  | { ok: false; message: string };

export function normalizePoNumbers(value: unknown): NormalizedPoNumbers {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, message: 'PO Numbers must be provided as a list.' };
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const item of value) {
    const po = String(item ?? '').trim();
    if (!po) continue;
    if (!/^\d+$/.test(po)) return { ok: false, message: 'PO Numbers must contain digits only.' };
    if (!seen.has(po)) { seen.add(po); normalized.push(po); }
  }
  return { ok: true, value: normalized };
}

export function jobAggregateDirtySnapshot(input: {
  values: unknown;
  lines: unknown;
  lifecycleStage: unknown;
  pendingPoNumber?: unknown;
}): string {
  return JSON.stringify(input);
}

export function normalizeJobHeaderInput(
  input: JobHeaderInput,
  fallbackSalesperson: string | null = null,
): NormalizedJobHeader {
  const customer = optionalText(input.customer);
  const siteAddress = optionalText(input.siteAddress);
  const email = optionalText(input.email)?.toLowerCase() ?? null;
  const shopHours = optionalHours(input.shopHours);
  const poNumbers = normalizePoNumbers(input.poNumbers);
  const hingeColor = normalizeHingeColor(input.hingeColor);
  const fieldErrors: Record<string, string> = {};

  if (!customer && !siteAddress) {
    fieldErrors.customer = 'Enter a customer or a site/address.';
    fieldErrors.siteAddress = 'Enter a customer or a site/address.';
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    fieldErrors.email = 'Enter a valid email address.';
  }
  if (Number.isNaN(shopHours)) {
    fieldErrors.shopHours = 'Shop Hours must be a non-negative number.';
  }
  if (poNumbers.ok === false) fieldErrors.poNumbers = poNumbers.message;
  if (hingeColor.ok === false) fieldErrors.hingeColor = hingeColor.message;
  if (input.lifecycleStage !== undefined && input.lifecycleStage !== 'Draft' && input.lifecycleStage !== 'Confirmed Job') {
    fieldErrors.lifecycleStage = 'Choose Draft or Confirmed Job.';
  }

  if (Object.keys(fieldErrors).length) {
    return { ok: false, message: 'Review the highlighted job fields.', fieldErrors };
  }

  const hasSalespersonInput = Object.prototype.hasOwnProperty.call(input, 'salesperson');
  return {
    ok: true,
    value: {
      bizTrackSalesOrder: optionalText(input.bizTrackSalesOrder),
      customer,
      siteAddress,
      phone: optionalText(input.phone),
      email,
      salesperson: hasSalespersonInput
        ? optionalText(input.salesperson)
        : optionalText(fallbackSalesperson),
      notes: optionalText(input.notes),
      hingeColor: hingeColor.ok ? hingeColor.value : null,
      shopHours: shopHours as number | null,
      shopHoursSource: optionalText(input.shopHoursSource),
      poNumbers: poNumbers.ok ? poNumbers.value : [],
      fulfillmentPlan: optionalText(input.fulfillmentPlan),
      deliveryDate: optionalText(input.deliveryDate),
      customerPickupDate: optionalText(input.customerPickupDate),
      shopDate: optionalText(input.shopDate),
      shopDateSource: optionalText(input.shopDateSource),
    },
  };
}

export function formatDoorGoReference(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new Error('DoorGo reference sequence must be a positive integer.');
  }
  return `DG-${String(sequence).padStart(6, '0')}`;
}

export function visibleJobIdentifier(
  job: Pick<NativeJobHeader, 'bizTrackSalesOrder' | 'doorGoReference'>,
): string {
  return job.bizTrackSalesOrder ?? job.doorGoReference;
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function canReadJobs(level: 'none' | 'view' | 'use'): boolean {
  return level === 'view' || level === 'use';
}

export function canWriteJobs(level: 'none' | 'view' | 'use'): boolean {
  return level === 'use';
}

export function jobFailureMessage(code: JobIntakeFailureCode): string {
  const messages: Record<JobIntakeFailureCode, string> = {
    authentication_required: 'Sign in to use Job Intake.',
    active_profile_required: 'An active DoorGo profile is required.',
    permission_required: 'Your account does not have permission for this action.',
    validation_failed: 'Review the highlighted job fields.',
    duplicate_biztrack_sales_order: 'That BizTrack Sales Order is already attached to another job.',
    stale_revision: 'This draft changed after you opened it. Reload and review the latest version before saving.',
    not_found: 'The requested draft job was not found.',
    idempotency_conflict: 'This create request was already used with different job details.',
    local_intake_disabled: 'Local Job Intake is disabled. Set DOORGO_LOCAL_INTAKE_ENABLED=true in a non-production environment.',
    unavailable: 'Local Job Intake is temporarily unavailable.',
  };
  return messages[code];
}
