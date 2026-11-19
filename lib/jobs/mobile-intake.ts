import type { DoorLineInput, NativeJobAggregate } from './job-intake-types';

export type IntakeChange = { id: string; revision: number; kind: 'added' | 'updated' | 'quantity'; before: number | null; quantity: number };
export type IntakeMutation = { lineId: string; kind: IntakeChange['kind']; before: number | null; quantity: number };

export function intakeChange(value: unknown): IntakeChange | undefined {
  try {
    const item = typeof value === 'string' ? JSON.parse(value) : value;
    if (!item || typeof item !== 'object' || !/^[a-f0-9-]{36}$/i.test(item.id) ||
      !Number.isSafeInteger(item.revision) || item.revision < 1 || !['added', 'updated', 'quantity'].includes(item.kind) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 ||
      (item.kind === 'quantity' && item.before === null) ||
      (item.before !== null && (!Number.isSafeInteger(item.before) || item.before < 1))) return undefined;
    return { id: item.id, revision: item.revision, kind: item.kind, before: item.before, quantity: item.quantity };
  } catch { return undefined; }
}

export function stampIntakeChange(lines: DoorLineInput[], mutation: IntakeMutation, revision: number, id: string): DoorLineInput[] {
  const matches = lines.filter(line => line.lineId === mutation.lineId && Number(line.qty) === mutation.quantity);
  if (matches.length !== 1) throw new Error('The changed door identity or quantity is no longer available.');
  const change = intakeChange({ ...mutation, revision, id });
  if (!change) throw new Error('Invalid intake change.');
  return lines.map(line => line.lineId === mutation.lineId ? { ...line, intakeChange: change } : line);
}

// Call only with the server-returned saved aggregate, never the pending editor lines.
export function lastSavedIntakeChange(job: NativeJobAggregate | null): (IntakeChange & { lineId: string }) | null {
  if (!job) return null;
  const changes = job.lines.flatMap(line => {
    const change = intakeChange(line.intakeChange);
    return change && change.revision <= job.revision && line.lineStatus === 'Active' && change.quantity === Number(line.qty)
      ? [{ ...change, lineId: line.lineId }] : [];
  });
  return changes.sort((a, b) => b.revision - a.revision)[0] ?? null;
}

export function intakeChangeText(change: IntakeChange): string {
  return change.kind === 'quantity' ? `Quantity updated: ${change.before} → ${change.quantity}`
    : change.kind === 'added' ? `Door added · Qty ${change.quantity}` : `Door updated · Qty ${change.quantity}`;
}


// A completed Add & Next must not turn a queued second tap into a new default door.
// Identical doors remain available through the explicit Duplicate previous action.
export function intakeDraftReady(draft: DoorLineInput, baseline: string, lastCompleted?: string, editing = false): boolean {
  if (editing) return true;
  const snapshot = JSON.stringify(draft);
  return snapshot !== baseline && snapshot !== lastCompleted;
}
