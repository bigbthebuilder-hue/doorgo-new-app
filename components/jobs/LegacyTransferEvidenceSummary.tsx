import type { LegacyTransferIssue } from '@/lib/jobs/legacy-transfer-types';
import { legacyTransferIssueKey, uniqueLegacyTransferFields, uniqueLegacyTransferIssues } from '@/lib/jobs/legacy-transfer-review-presentation';

export function LegacyTransferEvidenceSummary({ warnings, blockers, unsupportedFields }: {
  warnings: LegacyTransferIssue[];
  blockers: LegacyTransferIssue[];
  unsupportedFields: string[];
}) {
  const visibleWarnings = uniqueLegacyTransferIssues(warnings);
  const visibleBlockers = uniqueLegacyTransferIssues(blockers);
  const visibleUnsupportedFields = uniqueLegacyTransferFields(unsupportedFields);
  return <>
    {visibleWarnings.length ? <div className="mt-3"><h3 className="font-semibold">Warnings</h3><ul className="list-disc pl-5">{visibleWarnings.map((issue, index) => <li key={legacyTransferIssueKey('warning', issue, index)}>{issue.message} <span className="text-xs">({issue.path})</span></li>)}</ul></div> : null}
    {visibleBlockers.length ? <div className="mt-3 text-rose-800 dark:text-rose-200"><h3 className="font-semibold">Blocking issues</h3><ul className="list-disc pl-5">{visibleBlockers.map((issue, index) => <li key={legacyTransferIssueKey('blocker', issue, index)}>{issue.message} <span className="text-xs">({issue.path})</span></li>)}</ul></div> : null}
    {visibleUnsupportedFields.length ? <p className="mt-3"><strong>Unsupported source fields:</strong> {visibleUnsupportedFields.join(', ')}</p> : null}
  </>;
}
