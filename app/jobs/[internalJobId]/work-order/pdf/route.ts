import { generateCurrentSavedWorkOrder } from '@/lib/jobs/work-order-generation-service';
import { renderWorkOrderPdf, workOrderPdfHeaders } from '@/lib/jobs/work-order-pdf-contract';
import { assertWorkOrderPreflight } from '@/lib/jobs/work-order-preflight-contract';

export const dynamic = 'force-dynamic';

function generationInput(value: string | null) {
  const now = value ? new Date(value) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error('Invalid generation time.');
  return { generatedAt: now.toISOString(), generatedDate: now.toISOString().slice(0, 10) };
}

export async function GET(request: Request, context: { params: Promise<{ internalJobId: string }> }) {
  try {
    const { internalJobId } = await context.params;
    const url = new URL(request.url);
    const expectedRevision = Number(url.searchParams.get('revision'));
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) return new Response('A valid saved revision is required.', { status: 400 });
    const document = await generateCurrentSavedWorkOrder(internalJobId, generationInput(url.searchParams.get('generatedAt')));
    if (document.internalCorrelation.sourceAggregateRevision !== expectedRevision) {
      return new Response('This saved job changed after the preview was opened. Return to the job and open a new work-order preview.', { status: 409, headers: { 'Cache-Control': 'private, no-store' } });
    }
    assertWorkOrderPreflight(document, url.searchParams.get('acknowledged') === '1');
    const mode = url.searchParams.get('download') === '1' ? 'attachment' : 'inline';
    const bytes = await renderWorkOrderPdf(document);
    return new Response(Uint8Array.from(bytes).buffer, { status: 200, headers: workOrderPdfHeaders(document, mode) });
  } catch {
    return new Response('The saved work order is unavailable.', { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
