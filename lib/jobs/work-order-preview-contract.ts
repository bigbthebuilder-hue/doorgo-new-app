export const APPLY_LINE_BEFORE_OUTPUT_MESSAGE = 'Apply or cancel the current door-line changes before creating work-order output.';

export type WorkOrderOutputMode = 'inline' | 'attachment';
export type WorkOrderOutputIntent = 'preview' | 'download' | 'print' | 'send';

export function workOrderOutputDecision(input: { hasSavedJob: boolean; dirty: boolean; canEdit: boolean; hasUnappliedLineChanges: boolean }):
  | { ok: true; saveRequired: boolean }
  | { ok: false; message: string } {
  if (!input.hasSavedJob) return { ok: false, message: 'Save this job once before creating work-order output.' };
  if (input.hasUnappliedLineChanges) return { ok: false, message: APPLY_LINE_BEFORE_OUTPUT_MESSAGE };
  if (!input.dirty) return { ok: true, saveRequired: false };
  if (!input.canEdit) return { ok: false, message: 'You do not have permission to save pending job changes.' };
  return { ok: true, saveRequired: true };
}

export function buildWorkOrderPdfUrl(input: {
  internalJobId: string;
  sourceRevision: number;
  mode: WorkOrderOutputMode;
  acknowledged?: boolean;
}): string {
  const query = new URLSearchParams({
    revision: String(input.sourceRevision),
  });
  if (input.mode === 'attachment') query.set('download', '1');
  if (input.acknowledged) query.set('acknowledged', '1');
  return `/jobs/${encodeURIComponent(input.internalJobId)}/work-order/pdf?${query.toString()}`;
}
