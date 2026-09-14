import { useState } from 'react';
import { NoteActionPanel } from '@/components/calendar/NoteDetailsActions';
import type { ProductionBoardCard } from '@/lib/production-board/types';
import { lastNoteRequest } from './calendar-note-actions-shim';

export function CalendarNoteHarness({ mode = 'edit', linked = false }: { mode?: 'edit' | 'convert'; linked?: boolean }) {
  const [open, setOpen] = useState(true);
  const [result, setResult] = useState('');
  const card = { bookingId: 'item:11111111-1111-4111-8111-111111111111', title: 'Measure opening', customer: 'Measure opening', details: 'Check dimensions', productionDate: '2026-09-14', salesperson: 'Test salesperson', revision: 2, internalJobId: linked ? '22222222-2222-4222-8222-222222222222' : undefined } as ProductionBoardCard;
  return <>{open ? <NoteActionPanel boardStart="2026-09-14" canManageProduction card={card} mode={mode} onClose={() => setOpen(false)} onSaved={() => setResult(JSON.stringify(lastNoteRequest))} onConverted={() => setResult(JSON.stringify(lastNoteRequest))} roster={[]} today="2026-09-14" weeks={2}/> : <p>Calendar</p>}<output aria-label="Saved request">{result}</output></>;
}
