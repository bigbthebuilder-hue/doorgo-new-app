import type { LegacyTransferIssue } from './legacy-transfer-types';

export function uniqueLegacyTransferIssues(issues: readonly LegacyTransferIssue[]): LegacyTransferIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const identity = JSON.stringify([issue.code, issue.path, issue.message]);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

export function uniqueLegacyTransferFields(fields: readonly string[]): string[] {
  return [...new Set(fields)];
}

export function legacyTransferIssueKey(group: 'warning' | 'blocker' | 'validation', issue: LegacyTransferIssue, occurrence: number): string {
  return JSON.stringify([group, issue.code, issue.path, issue.message, occurrence]);
}

export function importedLineRenderKey(line: { lineId?: unknown; lineIndex?: unknown }, occurrence: number): string {
  const savedId = typeof line.lineId === 'string' ? line.lineId.trim() : '';
  return savedId || JSON.stringify(['imported-line', line.lineIndex ?? null, occurrence]);
}
