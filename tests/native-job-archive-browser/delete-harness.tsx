import { JobDeleteControl, jobDeleteTarget, type JobDeleteActionResult } from '../../components/jobs/JobDeleteControl';

declare global { interface Window { __deleteRequests?: unknown[]; __deleteNavigations?: string[] } }
const job = { internalJobId: '11111111-1111-4111-8111-111111111111', revision: 7, visibleIdentifier: 'DG-000013', bizTrackSalesOrder: null, doorGoReference: 'DG-000013', customer: 'Test Job' };

export function DeleteHarness({ manager = true, outcome = 'success' }: { manager?: boolean; outcome?: 'success' | 'stale_revision' }) {
  const onDelete = async (request: unknown): Promise<JobDeleteActionResult> => {
    window.__deleteRequests = [...(window.__deleteRequests ?? []), structuredClone(request)];
    return outcome === 'stale_revision' ? { ok: false, code: outcome, message: 'This draft changed after you opened it.' } : { ok: true };
  };
  return <JobDeleteControl onDelete={onDelete} onNavigate={(path) => { window.__deleteNavigations = [...(window.__deleteNavigations ?? []), path]; }} target={jobDeleteTarget(job, manager)}/>;
}
