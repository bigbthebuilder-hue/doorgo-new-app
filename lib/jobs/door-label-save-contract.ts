import type { DoorLineInput, NativeJobAggregate } from './job-intake-types';

export const doorLabelKeys = ['doorId', 'productCode'] as const;
export type DoorLabelKey = typeof doorLabelKeys[number];
export type DoorLabelValues = Record<DoorLabelKey, string | null>;
export type DoorLabelChange = { expected: string | null; value: string | null };
export type DoorLabelSaveRequest = {
  internalJobId: string;
  lineId: string;
  changes: Partial<Record<DoorLabelKey, DoorLabelChange>>;
};

export function doorLabelValues(line: DoorLineInput): DoorLabelValues {
  return {
    doorId: typeof line.doorId === 'string' ? line.doorId || null : null,
    productCode: typeof line.productCode === 'string' ? line.productCode || null : null,
  };
}

export function pendingDoorLabelSaves(job: NativeJobAggregate, lines: DoorLineInput[]): DoorLabelSaveRequest[] {
  const requests: DoorLabelSaveRequest[] = [];
  for (const line of lines) {
    const saved = job.lines.find((candidate) => candidate.lineId === line.lineId);
    if (!saved) continue; // Initial metadata is inserted with a new line's first job save.
    const expected = doorLabelValues(saved);
    const next = doorLabelValues(line);
    const changes: DoorLabelSaveRequest['changes'] = {};
    for (const key of doorLabelKeys) {
      if (expected[key] !== next[key]) changes[key] = { expected: expected[key], value: next[key] };
    }
    if (Object.keys(changes).length) requests.push({ internalJobId: job.internalJobId, lineId: saved.lineId, changes });
  }
  return requests;
}

// The existing Save button can persist labels without invoking the aggregate save.
export function jobSpecificationSnapshot(snapshot: string): string {
  const parsed = JSON.parse(snapshot);
  parsed.lines = parsed.lines.map((line: DoorLineInput) => {
    const specifications = { ...line };
    delete specifications.doorId;
    delete specifications.productCode;
    return specifications;
  });
  return JSON.stringify(parsed);
}

export function mergeSavedDoorLabels<T extends DoorLineInput>(line: T, request: DoorLabelSaveRequest): T {
  if (line.lineId !== request.lineId) return line;
  const result = { ...line };
  for (const key of doorLabelKeys) {
    const change = request.changes[key];
    if (change) result[key] = change.value;
  }
  return result;
}

export function retainPendingDoorLabelEdits(saved: DoorLineInput[], submitted: DoorLineInput[], current: DoorLineInput[]): DoorLineInput[] {
  return saved.map((line) => {
    const sent = submitted.find((candidate) => candidate.lineId === line.lineId);
    const edited = current.find((candidate) => candidate.lineId === line.lineId);
    if (!sent || !edited) return line;
    const result = { ...line };
    const sentValues = doorLabelValues(sent);
    const editedValues = doorLabelValues(edited);
    for (const key of doorLabelKeys) {
      if (sentValues[key] !== editedValues[key]) result[key] = editedValues[key];
    }
    return result;
  });
}
