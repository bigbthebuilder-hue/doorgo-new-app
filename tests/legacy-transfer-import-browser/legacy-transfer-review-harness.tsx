import { LegacyTransferEvidenceSummary } from '@/components/jobs/LegacyTransferEvidenceSummary';
import { importedLineRenderKey } from '@/lib/jobs/legacy-transfer-review-presentation';

export function LegacyTransferReviewHarness() {
  const lines = [{ lineIndex: 1, label: 'Glass line one' }, { lineIndex: 2, label: 'Glass line two' }];
  return <section>
    <h2>Job Lines</h2>
    {lines.map((line, index) => <p key={importedLineRenderKey(line, index)}>{line.label}</p>)}
    <LegacyTransferEvidenceSummary
      warnings={[
        { code: 'glass_review', path: 'lines.0.glass_inputs', message: 'Review glass evidence.' },
        { code: 'glass_review', path: 'lines.0.glass_inputs', message: 'Review glass evidence.' },
        { code: 'glass_review', path: 'lines.0.glass_inputs', message: 'Confirm the first line glass.' },
        { code: 'glass_review', path: 'lines.1.glass_inputs', message: 'Review glass evidence.' },
      ]}
      blockers={[{ code: 'required_review', path: 'job.customer', message: 'Confirm customer.' }]}
      unsupportedFields={['lines.0.glass_inputs.legacy_detail', 'lines.0.glass_inputs.legacy_detail']}
    />
  </section>;
}
