import { useState } from 'react';
import { DoorLineWorkspace } from '@/components/jobs/DoorLineWorkspace';
import { initialBuilderDraft } from '@/components/jobs/GlassUnitBuilder';
import type { DoorLineInput } from '@/lib/jobs/job-intake-types';

export function SlabSizingHarness({ line, initializeGlass = false }: { line: DoorLineInput; initializeGlass?: boolean }) {
  const [lines, setLines] = useState<DoorLineInput[]>([initializeGlass ? initialBuilderDraft(line) : line]);
  return <><DoorLineWorkspace canEdit lifecycleStage="Draft" lines={lines} onChange={setLines}/><output hidden data-testid="saved-sizing">{JSON.stringify(lines)}</output></>;
}
