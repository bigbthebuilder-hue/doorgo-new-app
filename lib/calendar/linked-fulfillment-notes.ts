import 'server-only';
import { createAuthenticatedSupabaseServerClient } from '@/lib/supabase/server';
import type { CalendarItemRow } from './calendar-items';

// This is optional display enrichment, never a fallback route into Jobs.
export async function enrichCalendarLinkedFulfillmentNotes(rows: CalendarItemRow[]): Promise<void> {
  const linked = rows.filter(row => row.item_type !== 'note' && row.linked_internal_job_id);
  if (!linked.length) return;
  // Do not display a stale stored copy if authorization/enrichment fails.
  for (const row of linked) row.fulfillment_note = null;
  try {
    const client = await createAuthenticatedSupabaseServerClient();
    const { data, error } = await client.rpc('calendar_linked_fulfillment_notes', {
      p_internal_job_ids: [...new Set(linked.map(row => row.linked_internal_job_id!))],
    });
    if (error) throw new Error('Linked note enrichment unavailable');
    const notes = new Map<string, string | null>(
      ((data ?? []) as Array<{ internal_job_id: string; notes: string | null }>)
        .map(row => [row.internal_job_id, row.notes]),
    );
    for (const row of linked) row.fulfillment_note = notes.get(row.linked_internal_job_id!) ?? null;
  } catch {
    console.warn('Calendar linked-note enrichment unavailable; Calendar items remain visible.');
  }
}
