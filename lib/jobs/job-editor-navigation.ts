export type JobEditorReturnTarget = '/jobs' | '/calendar' | `/calendar?week=${string}`;

export const DEFAULT_JOB_EDITOR_RETURN_TARGET: JobEditorReturnTarget = '/jobs';

const CALENDAR_RETURN_TARGET = /^\/calendar(?:\?week=\d{4}-\d{2}-\d{2})?$/;

export function safeJobEditorReturnTarget(value: string | string[] | undefined): JobEditorReturnTarget {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === DEFAULT_JOB_EDITOR_RETURN_TARGET || candidate === '/calendar') return candidate;
  if (candidate !== undefined && CALENDAR_RETURN_TARGET.test(candidate)) return candidate as `/calendar?week=${string}`;
  return DEFAULT_JOB_EDITOR_RETURN_TARGET;
}

export function jobEditorHref(internalJobId: string, returnTo: string): string {
  const safeReturnTo = safeJobEditorReturnTarget(returnTo);
  return `/jobs/${encodeURIComponent(internalJobId)}/edit?returnTo=${encodeURIComponent(safeReturnTo)}`;
}

export function canonicalJobEditorHref(internalJobId: string, returnTo: JobEditorReturnTarget): string {
  const base = `/jobs/${encodeURIComponent(internalJobId)}/edit`;
  return returnTo === DEFAULT_JOB_EDITOR_RETURN_TARGET ? base : `${base}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function jobEditorPostSaveNavigation(input: { exitAfterSave: boolean; hadJobBeforeSave: boolean; internalJobId: string; returnTo: JobEditorReturnTarget }): { method: 'push' | 'replace'; href: string } | null {
  if (input.exitAfterSave) return { method: 'push', href: input.returnTo };
  if (!input.hadJobBeforeSave) return { method: 'replace', href: canonicalJobEditorHref(input.internalJobId, input.returnTo) };
  return null;
}
