'use client';

import { useState, useTransition } from 'react';
import { inspectLegacyTransferAction } from '@/lib/jobs/job-intake-actions';
import { legacyTransferFilePreflight } from '@/lib/jobs/legacy-transfer-import-contract';
import type { LegacyTransferIssue, LegacyTransferMappingResult } from '@/lib/jobs/legacy-transfer-types';
import { legacyTransferIssueKey } from '@/lib/jobs/legacy-transfer-review-presentation';
import { JobHeaderForm, type LegacyTransferReviewContext } from './JobHeaderForm';
import { ContextTopBar } from '@/components/app-shell/ContextTopBar';
import type { AppNavigationItem } from '@/lib/app-shell/navigation';
import { LegacyJobImportShell } from './LegacyJobImportShell';

type AcceptedReview = Extract<LegacyTransferMappingResult, { ok: true }>;

export function LegacyJobImportReview({ defaultSalesperson, inAppShell = false, navigation = [] }: { defaultSalesperson: string; inAppShell?: boolean; navigation?: AppNavigationItem[] }) {
  const [review, setReview] = useState<{ rawPayload: string; result: AcceptedReview } | null>(null);
  const [issues, setIssues] = useState<LegacyTransferIssue[]>([]);
  const [message, setMessage] = useState('');
  const [isPending, startTransition] = useTransition();

  function selectFile(file: File | undefined) {
    setReview(null); setIssues([]); setMessage('');
    if (!file) return;
    const preflight = legacyTransferFilePreflight(file);
    if (!preflight.ok) { setMessage(preflight.message); return; }
    startTransition(async () => {
      const rawPayload = await file.text();
      const result = await inspectLegacyTransferAction(rawPayload);
      if (!result.ok) { setMessage(result.message); setIssues(result.issues); return; }
      setReview({ rawPayload, result: result.review });
    });
  }

  if (review) {
    const result = review.result;
    const context: LegacyTransferReviewContext = {
      rawPayload: review.rawPayload, primaryIdentifier: result.editor.primaryIdentifier,
      sourceSavedAt: result.provenance.sourceSavedAt, exportedAt: result.provenance.exportedAt,
      warnings: result.warnings, blockers: result.blockers, unsupportedFields: result.unsupportedFields,
    };
    const editor = <JobHeaderForm canEdit defaultSalesperson={defaultSalesperson} initialDraft={{ header: result.editor.header, lines: result.editor.lines }} initialJob={null} transferReview={context} inAppShell={inAppShell}/>;
    return inAppShell ? <LegacyJobImportShell editorActive navigation={navigation}>{editor}</LegacyJobImportShell> : editor;
  }

  const content = <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
    <p className="text-sm text-slate-600 dark:text-slate-300">Select one downloaded DoorGo legacy-transfer JSON file. Reviewing or cancelling creates no native job.</p>
    <label className="mt-5 grid gap-2 font-semibold" htmlFor="legacy-transfer-file">Legacy transfer file
      <input accept="application/json,.json" className="min-h-12 rounded-xl border border-slate-300 p-3 dark:border-slate-600" disabled={isPending} id="legacy-transfer-file" onChange={(event) => selectFile(event.target.files?.[0])} type="file"/>
    </label>
    {isPending ? <p className="mt-4" role="status">Inspecting transfer file…</p> : null}
    {message ? <p className="mt-4 rounded-xl bg-rose-50 p-3 text-rose-900 dark:bg-rose-950 dark:text-rose-100" role="alert">{message}</p> : null}
    {issues.length ? <ul className="mt-3 list-disc pl-5 text-sm text-rose-800 dark:text-rose-200">{issues.map((issue, index) => <li key={legacyTransferIssueKey('validation', issue, index)}>{issue.path}: {issue.message}</li>)}</ul> : null}
    <p className="mt-5 text-xs text-slate-500">Maximum file size: 1 MiB. Duplicate JSON keys, unknown identifiers, reverse transfers, secrets, and operational commands are rejected.</p>
  </section>;
  const uploadReview = <><ContextTopBar backHref="/jobs" backLabel="Jobs" title="Import Legacy Job" secondary="Review before saving as a native job"/><div className="app-workspace max-w-6xl">{content}</div></>;
  return inAppShell ? <LegacyJobImportShell editorActive={false} navigation={navigation}>{uploadReview}</LegacyJobImportShell> : content;
}
