import { JobArchiveControl, jobArchiveTarget, type JobArchiveActionResult } from '../../components/jobs/JobArchiveControl';

declare global {
  interface Window {
    __archiveRequests?: unknown[];
    __archiveNavigations?: string[];
  }
}

const job = {
  internalJobId: '11111111-1111-4111-8111-111111111111',
  revision: 7,
  origin: 'native' as const,
  archivedAt: null,
  bizTrackSalesOrder: null,
  doorGoReference: 'DG-000013',
};

export function ArchiveHarness({ saved = true, outcome = 'success' }: { saved?: boolean; outcome?: 'success' | 'stale_revision' | 'permission_required' }) {
  const onArchive = async (request: unknown): Promise<JobArchiveActionResult> => {
    window.__archiveRequests = [...(window.__archiveRequests ?? []), structuredClone(request)];
    if (outcome === 'stale_revision') return { ok: false, code: outcome, message: 'This draft changed after you opened it. Reload and review the latest version before saving.' };
    if (outcome === 'permission_required') return { ok: false, code: outcome, message: 'Your account does not have permission for this action.' };
    return { ok: true };
  };
  return <JobArchiveControl
    onArchive={onArchive}
    onNavigate={(path) => { window.__archiveNavigations = [...(window.__archiveNavigations ?? []), path]; }}
    target={jobArchiveTarget(saved ? job : null, true)}
  />;
}
