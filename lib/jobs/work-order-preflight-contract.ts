import type { WorkOrderDocument, WorkOrderPresentationStatus } from './work-order-document-contract';

export type WorkOrderPreflightIssue = {
  lineIndex: number | null;
  status: Exclude<WorkOrderPresentationStatus, 'Complete'>;
  message: string;
};

export type WorkOrderPreflight = {
  issues: WorkOrderPreflightIssue[];
  blocked: boolean;
  acknowledgementRequired: boolean;
};

export function evaluateWorkOrderPreflight(document: WorkOrderDocument): WorkOrderPreflight {
  const issues: WorkOrderPreflightIssue[] = (document.validationIssues ?? []).map((issue) => ({ lineIndex: issue.lineIndex, status: 'Blocked', message: issue.message }));
  issues.push(...document.rowGroups.flatMap((group): WorkOrderPreflightIssue[] => {
    const status = group.primaryRow.status;
    if (status === 'Complete') return [];
    const message = group.detailRows.flatMap((row) => row.lines).filter(Boolean).join(' | ') || status;
    return [{ lineIndex: group.primaryRow.lineIndex, status, message }];
  }));
  return {
    issues,
    blocked: issues.some((issue) => issue.status === 'Blocked'),
    acknowledgementRequired: issues.some((issue) => issue.status === 'Warning' || issue.status === 'Manual Override' || issue.status === 'Glass Detail Needed'),
  };
}

export function assertWorkOrderPreflight(document: WorkOrderDocument, acknowledged: boolean): WorkOrderPreflight {
  const preflight = evaluateWorkOrderPreflight(document);
  if (preflight.blocked) throw new Error('This work order contains blocked door lines and cannot be generated.');
  if (preflight.acknowledgementRequired && !acknowledged) throw new Error('Work-order warnings must be acknowledged before generation.');
  return preflight;
}
