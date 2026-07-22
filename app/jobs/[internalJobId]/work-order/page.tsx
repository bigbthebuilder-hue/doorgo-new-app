import { redirect } from 'next/navigation';
import { WorkOrderPreview } from '@/components/jobs/WorkOrderPreview';
import { hasAtLeastView } from '@/lib/auth/access';
import { requireDoorGoProtectedAccess } from '@/lib/auth/protected-access';
import { JobIntakeFailure } from '@/lib/jobs/job-intake-types';
import { generateSavedWorkOrderWithAccess } from '@/lib/jobs/work-order-generation-service-contract';
import { createJobIntakeRepository } from '@/lib/jobs/job-intake-repository';
import { evaluateWorkOrderPreflight } from '@/lib/jobs/work-order-preflight-contract';

export const dynamic = 'force-dynamic';

export default async function WorkOrderPage({ params, searchParams }: { params: Promise<{ internalJobId: string }>; searchParams: Promise<{ action?: string }> }) {
  const access = await requireDoorGoProtectedAccess();
  if (!hasAtLeastView(access, 'jobs')) redirect('/account');
  const { internalJobId } = await params;
  const requestedAction = (await searchParams).action;
  const initialAction = requestedAction === 'download' || requestedAction === 'print' ? requestedAction : 'preview';
  const now = new Date();
  let document;
  try {
    document = await generateSavedWorkOrderWithAccess(access, internalJobId, {
      generatedAt: now.toISOString(), generatedDate: now.toISOString().slice(0, 10),
    }, createJobIntakeRepository());
  } catch (error) {
    const message = error instanceof JobIntakeFailure ? error.message : 'The saved work order is temporarily unavailable.';
    return <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 dark:bg-slate-950 dark:text-slate-100"><div className="mx-auto max-w-3xl rounded-2xl border border-amber-200 bg-white p-6 dark:border-amber-900 dark:bg-slate-900"><h1 className="text-2xl font-semibold">Saved Work Order</h1><p className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-900 dark:bg-amber-950 dark:text-amber-100">{message}</p></div></main>;
  }
  return <WorkOrderPreview generatedAt={document.generatedAt} initialAction={initialAction} internalJobId={internalJobId} pdfFilename={document.pdfFilename} preflight={evaluateWorkOrderPreflight(document)} sourceRevision={document.internalCorrelation.sourceAggregateRevision} visibleIdentifier={document.visibleIdentifier}/>;
}
